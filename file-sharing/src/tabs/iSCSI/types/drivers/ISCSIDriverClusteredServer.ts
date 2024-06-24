import { ConfigurationManager } from "@/tabs/iSCSI/types/ConfigurationManager";
import { Directory, safeJsonParse } from "@45drives/houston-common-lib";
import { VirtualDevice, DeviceType } from "@/tabs/iSCSI/types/VirtualDevice";
import { CHAPConfiguration, CHAPType } from "@/tabs/iSCSI/types/CHAPConfiguration";
import { type Connection } from "@/tabs/iSCSI/types/Connection";
import { type Initiator } from "@/tabs/iSCSI/types/Initiator";
import { type InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import { LogicalUnitNumber } from "@/tabs/iSCSI/types/LogicalUnitNumber";
import { Portal } from "@/tabs/iSCSI/types/Portal";
import { type Session } from "@/tabs/iSCSI/types/Session";
import { type Target } from "@/tabs/iSCSI/types/Target";
import { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import {
  BashCommand,
  Command,
  ProcessError,
  Server,
  StringToIntCaster,
} from "@45drives/houston-common-lib";
import { Result, ResultAsync, err, ok, okAsync, safeTry } from "neverthrow";
import { useUserSettings } from "@/common/user-settings";
import { ISCSIDriverSingleServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverSingleServer";

interface PCSResource {
  resourceName: string;
  resourceType: PCSResourceType;
  creationCommand: Command | undefined;
}

enum PCSResourceType {
  PORTBLOCK_ON = "iscsi_portblock_on",
  VIP = "iscsi_vip",
  LVM = "iscsi_lvm",
  TARGET = "iscsi_target",
  LUN = "iscsi_lun",
  PORTBLOCK_OFF = "iscsi_portblock_off",
}

type PcsResourceConfigJson = {
  primitives: {
    instance_attributes: {
      nvpairs: {
        id: string;
        name: string;
        value: string;
      }[];
    }[];
  }[];
};

export class ISCSIDriverClusteredServer implements ISCSIDriver {
  server: Server;
  activeNode: Server | undefined;
  configurationManager: ConfigurationManager;

  singleServerDriver: ISCSIDriverSingleServer | undefined;

  targets: Target[];
  virtualDevices: VirtualDevice[];

  deviceTypeToHandlerDirectory = {
    [DeviceType.BlockIO]: "/sys/kernel/scst_tgt/handlers/vdisk_blockio",
  };

  targetManagementDirectory = "/sys/kernel/scst_tgt/targets/iscsi";

  resourceGroupPrefix = "iscsi_group";

  constructor(server: Server) {
    this.server = server;
    this.configurationManager = new ConfigurationManager(server);
    this.virtualDevices = [];
    this.targets = [];
  }

  initialize() {
    return new Directory(this.server, "/sys/kernel/scst_tgt").exists()
    .andThen((exists) => {
        if (exists) {
            return this.getActiveNode()
            .map((server) => (this.activeNode = server))
            .map((server) => {
              this.singleServerDriver = new ISCSIDriverSingleServer(server);
              return this.singleServerDriver;
            })
            .andThen((driver) =>
              driver
                .getVirtualDevices()
                .map((devices) => (this.virtualDevices = devices))
                .map(() => driver)
            )
            .andThen((driver) =>
              driver
                .getTargets()
                .map((targets) => (this.targets = targets))
                .map(() => driver)
            )
            .map(() => this);
        }
        else {
            return err(new ProcessError("/sys/kernel/scst_tgt was not found. Is SCST installed?"))
        }
    })
  }

  getHandledDeviceTypes(): DeviceType[] {
    return Object.keys(this.deviceTypeToHandlerDirectory) as DeviceType[];
  }

  getActiveNode(): ResultAsync<Server, ProcessError> {
    return this.server
      .execute(new BashCommand(`pcs status xml`))
      .map((proc) => {
        const output = proc.getStdout();
        const parser = new DOMParser();

        const doc = parser.parseFromString(output, "text/xml");
        return doc
          .getElementsByTagName("resource")[0]
          ?.getElementsByTagName("node")[0]
          ?.attributes.getNamedItem("name")?.value;
      })
      .map((nodeIP) => new Server(nodeIP));
  }

  addLVMResource(target: Pick<Target, "name">, virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
    const lvmResource = this.createLVMResource(virtualDevice);

    return this.server
      .execute(lvmResource.creationCommand!)
      .andThen(() => this.moveResourceToGroup(target, lvmResource))
  }

  removeLVMResource(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
    return this.deleteResource({
      resourceName: `${PCSResourceType.LVM}_${virtualDevice.deviceName}`,
    }).andThen(() => this.removeVirtualDevice(virtualDevice));
  }

  addVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
    this.virtualDevices = [...this.virtualDevices, virtualDevice];

    return okAsync(undefined);
  }

  removeVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
    this.virtualDevices = this.virtualDevices.filter(
      (existingDevice) => existingDevice.deviceName !== virtualDevice.deviceName
    );

    return okAsync(undefined);
  }

  createTarget(target: Target): ResultAsync<void, ProcessError> {
    const resource = this.createTargetResource(target);

    return this.server
      .execute(resource.creationCommand!)
      .andThen(() => this.moveResourceToGroup(target, resource))
      .map(() => {
        this.targets = [...this.targets, target];
        return undefined;
      });
  }

  removeTarget(target: Target): ResultAsync<void, ProcessError> {
    return this.deleteResource({ resourceName: `${this.resourceGroupPrefix}_${target.name}` }).map(
      () => {
        this.targets = this.targets.filter((existingTarget) => existingTarget.name !== target.name);
        return undefined;
      }
    );
  }

  addPortalToTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
    const existingPortals = [...target.portals, portal].map((portal) => portal.address).join(", ");

    const portalVIP = this.createPortalVIPResource(portal);
    const portblockOnResource = this.createPortalPortblockOnResource(portal);
    const portblockOffResource = this.createPortalPortblockOffResource(portal);

    return this.server
      .execute(
        new BashCommand(
          `pcs resource update ${PCSResourceType.TARGET}_${target.name} portals='${existingPortals}'`
        )
      )
      .andThen(() => this.server.execute(portalVIP.creationCommand!))
      .andThen(() => this.moveResourceToGroup(target, portalVIP))
      .andThen(() => this.server.execute(portblockOnResource.creationCommand!))
      .andThen(() => this.moveResourceToGroup(target, portblockOnResource))
      .andThen(() => this.server.execute(portblockOffResource.creationCommand!))
      .andThen(() => this.moveResourceToGroup(target, portblockOffResource))
      .andThen(() => okAsync(undefined));
  }

  deletePortalFromTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
    const existingPortals = target.portals
      .filter((existingPortal) => existingPortal !== portal)
      .map((existingPortal) => existingPortal.address)
      .join(", ");

    return this.server
      .execute(
        new BashCommand(
          `pcs resource update ${PCSResourceType.TARGET}_${target.name} portals='${existingPortals}'`
        )
      )
      .andThen(() =>
        this.deleteResource({ resourceName: `${PCSResourceType.VIP}_${portal.address}` })
      )
      .andThen(() =>
        this.deleteResource({ resourceName: `${PCSResourceType.PORTBLOCK_ON}_${portal.address}` })
      )
      .andThen(() =>
        this.deleteResource({ resourceName: `${PCSResourceType.PORTBLOCK_OFF}_${portal.address}` })
      )
      .andThen(() => okAsync(undefined));
  }

  addInitiatorGroupToTarget(
    _target: Target,
    _initiatorGroup: InitiatorGroup
  ): ResultAsync<void, ProcessError> {
    throw new Error("Adding initiator groups is not supported by this driver.");
  }
  deleteInitiatorGroupFromTarget(
    _target: Target,
    _initiatorGroup: InitiatorGroup
  ): ResultAsync<void, ProcessError> {
    throw new Error("Removing initiator groups is not supported by this driver.");
  }

  addInitiatorToGroup(
    initiatorGroup: InitiatorGroup,
    initiator: Initiator
  ): ResultAsync<void, ProcessError> {
    const existingInitiators = [...initiatorGroup.initiators, initiator]
      .map((initiator) => initiator.name)
      .join(" ");

    return this.server
      .execute(
        new BashCommand(
          `pcs resource update ${PCSResourceType.TARGET}_${this.getTargetNameOfInitiatorGroup(initiatorGroup)} allowed_initiators='${existingInitiators}'`
        )
      )
      .andThen(() => okAsync(undefined));
  }

  removeInitiatorFromGroup(
    initiatorGroup: InitiatorGroup,
    initiator: Initiator
  ): ResultAsync<void, ProcessError> {
    const existingInitiators = initiatorGroup.initiators
      .filter((existinginitiator) => existinginitiator !== initiator)
      .map((existinginitiator) => existinginitiator.name)
      .join(" ");

    return this.server
      .execute(
        new BashCommand(
          `pcs resource update ${PCSResourceType.TARGET}_${this.getTargetNameOfInitiatorGroup(initiatorGroup)} allowed_initiators='${existingInitiators}'`
        )
      )
      .andThen(() => okAsync(undefined));
  }

  addLogicalUnitNumberToGroup(
    initiatorGroup: InitiatorGroup,
    logicalUnitNumber: LogicalUnitNumber
  ): ResultAsync<void, ProcessError> {
    const resource = this.createLogicalUnitNumberResources(initiatorGroup, logicalUnitNumber);

    return this.server
      .execute(resource.creationCommand!)
      .andThen(() => this.moveResourceToGroup({ name: this.getTargetNameOfInitiatorGroup(initiatorGroup) }, resource));
  }

  removeLogicalUnitNumberFromGroup(
    initiatorGroup: InitiatorGroup,
    logicalUnitNumber: LogicalUnitNumber
  ): ResultAsync<void, ProcessError> {
    return this.getCurrentResourcesInGroup(`${this.resourceGroupPrefix}_${this.getTargetNameOfInitiatorGroup(initiatorGroup)}`)
          .andThen((resources) => 
            ResultAsync.combine(
              resources.filter((resource) => (resource.resourceName === `${PCSResourceType.LUN}_${logicalUnitNumber.unitNumber}`) || (resource.resourceName === `${PCSResourceType.LVM}_${logicalUnitNumber.name}`))
              .flatMap((resource) => this.deleteResource(resource))
            ).map(() => undefined)
          )
  }

  addCHAPConfigurationToTarget(
    target: Target,
    chapConfiguration: CHAPConfiguration
  ): ResultAsync<void, ProcessError> {
    const command = new BashCommand(
      `pcs resource update ${PCSResourceType.TARGET}_${target.name} incoming_username='${chapConfiguration.username}' incoming_password='${chapConfiguration.password}'`
    );

    return this.server.execute(command).andThen(() => okAsync(undefined));
  }

  removeCHAPConfigurationFromTarget(
    target: Target,
    _chapConfiguration: CHAPConfiguration
  ): ResultAsync<void, ProcessError> {
    return this.server
      .execute(
        new BashCommand(
          `pcs resource update ${PCSResourceType.TARGET}_${target.name} incoming_username='' incoming_password=''`
        )
      )
      .andThen(() => okAsync(undefined));
  }

  getVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError> {
    return okAsync(this.virtualDevices);
  }

  getTargets(): ResultAsync<Target[], ProcessError> {
    return okAsync(this.targets);
  }

  getPortalsOfTarget(target: Target): ResultAsync<Portal[], ProcessError> {
    return this.getCurrentResourcesInGroup(`${this.resourceGroupPrefix}_${target.name}`).andThen(
      (resources) =>
        ResultAsync.combine(
          resources
            .filter((resource) => resource.resourceType === PCSResourceType.TARGET)
            .map((resource) =>
              this.server
                .execute(
                  new BashCommand(
                    `pcs resource config --output-format json ${resource.resourceName}`
                  )
                )
                .map((process) => process.getStdout())
                .andThen(safeJsonParse<PcsResourceConfigJson>)
                .map((configObject) => {
                  const portalsString =
                    configObject.primitives?.[0]?.instance_attributes?.[0]?.nvpairs?.find(
                      ({ name }) => name === "portals"
                    )?.value;

                  if (portalsString) {
                    return portalsString.split(", ").map((portalAddress) => {
                      return {
                        address: portalAddress,
                      } as Portal;
                    });
                  }

                  return null;
                })
            )
        ).map((portalLists) =>
          portalLists
            .filter((portalLists): portalLists is Portal[] => portalLists !== null)
            .flatMap((portal) => portal)
        )
    );
  }

  // iSCSI through PCS only seems to support one ini_group 'allowed', that is created automatically.
  getInitatorGroupsOfTarget(target: Target): ResultAsync<InitiatorGroup[], ProcessError> {
    const self = this;

    const initiatorGroupDirectory = `${this.getTargetPath(target)}/ini_groups`;

    return new ResultAsync(
      safeTry(async function* () {
        const partialInitiatorGroup = {
          name: "allowed",
          devicePath: `${initiatorGroupDirectory}/allowed`,
        };

        return ok<InitiatorGroup[]>([
          {
            ...partialInitiatorGroup,
            initiators: yield* self
              .getInitiatorsOfInitiatorGroup(partialInitiatorGroup)
              .safeUnwrap(),
            logicalUnitNumbers: yield* self
              .getLogicalUnitNumbersOfInitiatorGroup(partialInitiatorGroup)
              .safeUnwrap(),
          },
        ]);
      })
    );
  }

  getCHAPConfigurationsOfTarget(target: Target): ResultAsync<CHAPConfiguration[], ProcessError> {
    return this.getCurrentResourcesInGroup(`${this.resourceGroupPrefix}_${target.name}`).andThen(
      (resources) =>
        ResultAsync.combine(
          resources
            .filter((resource) => resource.resourceType === PCSResourceType.TARGET)
            .map((resource) =>
              this.server
                .execute(
                  new BashCommand(
                    `pcs resource config --output-format json ${resource.resourceName}`
                  )
                )
                .map((process) => process.getStdout())
                .andThen(safeJsonParse<PcsResourceConfigJson>)
                .map((configObject) => {
                  const chapUsername =
                    configObject.primitives?.[0]?.instance_attributes?.[0]?.nvpairs?.find(
                      ({ name }) => name === "incoming_username"
                    )?.value;

                  const chapPassword =
                    configObject.primitives?.[0]?.instance_attributes?.[0]?.nvpairs?.find(
                      ({ name }) => name === "incoming_password"
                    )?.value;

                  if (chapUsername && chapPassword) {
                    return {
                      username: chapUsername,
                      password: chapPassword,
                      chapType: CHAPType.IncomingUser,
                    } as CHAPConfiguration;
                  }

                  return null;
                })
            )
        ).map((chapConfigs) =>
          chapConfigs.filter((chapConfig): chapConfig is CHAPConfiguration => chapConfig !== null)
        )
    );
  }

  getLogicalUnitNumbersOfInitiatorGroup(
    initiatorGroup: Pick<InitiatorGroup, "devicePath">
  ): ResultAsync<LogicalUnitNumber[], ProcessError> {
    return this.getCurrentResourcesInGroup(`${this.resourceGroupPrefix}_${this.getTargetNameOfInitiatorGroup(initiatorGroup)}`).andThen(
      (resources) =>
        ResultAsync.combine(
          resources
            .filter((resource) => resource.resourceType === PCSResourceType.LUN)
            .map((resource) =>
              this.server
                .execute(
                  new BashCommand(
                    `pcs resource config --output-format json ${resource.resourceName}`
                  )
                )
                .map((process) => process.getStdout())
                .andThen(safeJsonParse<PcsResourceConfigJson>)
                .map((configObject) => {
                  const attributeDevicePath =
                    configObject.primitives?.[0]?.instance_attributes?.[0]?.nvpairs?.find(
                      ({ name }) => name === "path"
                    )?.value;
                  const attributeLunString =
                    configObject.primitives?.[0]?.instance_attributes?.[0]?.nvpairs?.find(
                      ({ name }) => name === "lun"
                    )?.value;

                  if (attributeDevicePath && attributeLunString) {
                    const attributeLun = StringToIntCaster()(attributeLunString);
                    const device = this.virtualDevices.find(
                      (device) => device.filePath === attributeDevicePath
                    );

                    if (device && attributeLun.isSome()) {
                      return {
                        name: device.deviceName,
                        unitNumber: attributeLun.some(),
                        blockDevice: device,
                      } as LogicalUnitNumber;
                    }
                  }

                  return null;
                })
            )
        ).map((luns) => luns.filter((lun): lun is LogicalUnitNumber => lun !== null))
    );
  }

  getInitiatorsOfInitiatorGroup(
    initiatorGroup: Pick<InitiatorGroup, "name" | "devicePath">
  ): ResultAsync<Initiator[], ProcessError> {
    return this.getCurrentResourcesInGroup(`${this.resourceGroupPrefix}_${this.getTargetNameOfInitiatorGroup(initiatorGroup)}`).andThen(
      (resources) =>
        ResultAsync.combine(
          resources
            .filter((resource) => resource.resourceType === PCSResourceType.TARGET)
            .map((resource) =>
              this.server
                .execute(
                  new BashCommand(
                    `pcs resource config --output-format json ${resource.resourceName}`
                  )
                )
                .map((process) => process.getStdout())
                .andThen(safeJsonParse<PcsResourceConfigJson>)
                .map((configObject) => {
                  const initiatorsInGroup =
                    configObject.primitives?.[0]?.instance_attributes?.[0]?.nvpairs?.find(
                      ({ name }) => name === `${initiatorGroup.name}_initiators`
                    )?.value;

                  if (initiatorsInGroup) {
                    return initiatorsInGroup.split(" ").map((initiatorName) => {
                      return {
                        name: initiatorName,
                      } as Initiator;
                    });
                  }

                  return null;
                })
            )
        ).map((initiatorLists) =>
          initiatorLists
            .filter((initiatorList): initiatorList is Initiator[] => initiatorList !== null)
            .flatMap((initiator) => initiator)
        )
    );
  }

  getSessionsOfTarget(target: Target): ResultAsync<Session[], ProcessError> {
    return this.singleServerDriver!.getSessionsOfTarget(target);
  }

  getConnectionsOfSession(session: Session): ResultAsync<Connection[], ProcessError> {
    return this.singleServerDriver!.getConnectionsOfSession(session);
  }

  createLVMResource(virtualDevice: VirtualDevice): PCSResource {
    const resourceType = PCSResourceType.LVM;
    const resourceName = `${resourceType}_${virtualDevice.deviceName}`;

    const splitFilePath = virtualDevice.filePath.split("/");

    const vgName = splitFilePath[splitFilePath.length - 2]!;
    const lvName = splitFilePath[splitFilePath.length - 1]!;

    return {
      resourceName: resourceName,
      resourceType: resourceType,
      creationCommand: new BashCommand(
        `pcs resource create $1 ocf:heartbeat:LVM-activate lvname=$2 vgname=$3 activation_mode=exclusive vg_access_mode=system_id op start timeout=30 op stop timeout=30 op monitor interval=10 timeout=60`,
        [resourceName, lvName, vgName]
      ),
    };
  }

  createPortalVIPResource(portal: Portal): PCSResource {
    const resourceType = PCSResourceType.VIP;
    const resourceName = `${resourceType}_${portal.address}`;

    const subnetMask = useUserSettings().value.iscsi.subnetMask.toString();

    return {
      resourceName: `${resourceName}`,
      resourceType: resourceType,
      creationCommand: new BashCommand(
        `pcs resource create $1 ocf:heartbeat:IPaddr2 ip=$2 cidr_netmask=$3 op start timeout=20 op stop timeout=20 op monitor interval=10`,
        [resourceName, portal.address, subnetMask]
      ),
    };
  }

  createPortalPortblockOnResource(portal: Portal): PCSResource {
    const resourceType = PCSResourceType.PORTBLOCK_ON;
    const resourceName = `${resourceType}_${portal.address}`;

    return {
      resourceName: `${resourceName}`,
      resourceType: resourceType,
      creationCommand: new BashCommand(
        `pcs resource create $1 ocf:heartbeat:portblock ip=$2 portno=3260 protocol=tcp action=block op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`,
        [resourceName, portal.address]
      ),
    };
  }

  createPortalPortblockOffResource(portal: Portal): PCSResource {
    const resourceType = PCSResourceType.PORTBLOCK_OFF;
    const resourceName = `${resourceType}_${portal.address}`;
    return {
      resourceName: `${resourceName}`,
      resourceType: resourceType,
      creationCommand: new BashCommand(
        `pcs resource create $1 ocf:heartbeat:portblock ip=$2 portno=3260 protocol=tcp action=unblock op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`,
        [resourceName, portal.address]
      ),
    };
  }

  createLogicalUnitNumberResources(
    initiatorGroup: InitiatorGroup,
    logicalUnitNumber: LogicalUnitNumber
  ): PCSResource {
    const resourceType = PCSResourceType.LUN;
    const resourceName = `${resourceType}_${logicalUnitNumber.unitNumber}`;

    return {
      resourceName: resourceName,
      resourceType: resourceType,
      creationCommand: new BashCommand(
        `pcs resource create $1 ocf:heartbeat:iSCSILogicalUnit target_iqn=$2 lun=$3 path=$4 op start timeout=100 op stop timeout=100 op monitor interval=10 timeout=100`,
        [
          resourceName,
          this.getTargetNameOfInitiatorGroup(initiatorGroup),
          logicalUnitNumber.unitNumber.toString(),
          logicalUnitNumber.blockDevice!.filePath,
        ]
      ),
    };
  }

  createTargetResource(target: Target): PCSResource {
    const resourceType = PCSResourceType.TARGET;
    const resourceName = `${resourceType}_${target.name}`;

    return {
      resourceName: resourceName,
      resourceType: resourceType,
      creationCommand: new BashCommand(
        `pcs resource create $1 ocf:heartbeat:iSCSITarget iqn=$2 op start timeout=20 op stop timeout=20 op monitor interval=20 timeout=40`,
        [resourceName, target.name]
      ),
    };
  }

  getCurrentResourcesInGroup(groupName: string): ResultAsync<PCSResource[], ProcessError> {
    return this.server.execute(new BashCommand(`pcs status xml`)).map((proc) => {
      let foundResources: PCSResource[] = [];
      const output = proc.getStdout();
      const parser = new DOMParser();

      const doc = parser.parseFromString(output, "text/xml");
      const groupElement = doc.querySelector(`resources > group[id=${groupName}]`);

      if (groupElement) {
        groupElement.querySelectorAll("resource").forEach((resource) => {
          if (resource.getAttribute("id") !== null) {
            const resourceType = this.getResourceType({
              resourceName: resource.getAttribute("id")!,
            });

            if (resourceType) {
              const pcsResource = {
                resourceName: resource.getAttribute("id")!,
                resourceType: resourceType!,
                creationCommand: undefined,
              };

              foundResources = [...foundResources, pcsResource];
            }
          }
        });
      }

      return foundResources;
    });
  }

  getResourceType(resource: Pick<PCSResource, "resourceName">): PCSResourceType | undefined {
    for (const resourcePrefix of Object.values(PCSResourceType)) {
      if (resource.resourceName.startsWith(resourcePrefix)) {
        return resourcePrefix;
      }
    }

    return undefined;
  }

  deleteResource(resource: Pick<PCSResource, "resourceName">): ResultAsync<void, ProcessError> {
    return this.server
      .execute(new BashCommand(`pcs resource delete $1`, [resource.resourceName]))
      .map(() => undefined);
  }

  moveResourceToGroup(
    target: Pick<Target, "name">,
    resource: Pick<PCSResource, "resourceName" | "resourceType">
  ): ResultAsync<void, ProcessError> {
    const PCSResourceTypeOrder = {
      [PCSResourceType.PORTBLOCK_ON]: 0,
      [PCSResourceType.VIP]: 1,
      [PCSResourceType.LVM]: 2,
      [PCSResourceType.TARGET]: 3,
      [PCSResourceType.LUN]: 4,
      [PCSResourceType.PORTBLOCK_OFF]: 5,
    };

    const currentResourceIndex = PCSResourceTypeOrder[resource.resourceType];

    return this.getCurrentResourcesInGroup(`${this.resourceGroupPrefix}_${target.name}`)
      .andThen((resources) => {
        let positionArgument: string[] = [];

        const nextResource = resources.find(
          (existingResource) =>
            currentResourceIndex <= PCSResourceTypeOrder[existingResource.resourceType]
        );

        if (nextResource !== undefined) {
          positionArgument = [`--before`, nextResource.resourceName];
        }

        const command = new Command([
          `pcs`,
          `resource`,
          `group`,
          `add`,
          `${this.resourceGroupPrefix}_${target.name}`,
          ...positionArgument,
          resource.resourceName,
        ]);
        return this.server.execute(command);
      })
      .map(() => undefined);
  }
  
  getTargetPath(target: Pick<Target, "name">) {
    return `${this.targetManagementDirectory}/${target.name}`;
  }

  getTargetNameOfInitiatorGroup(initiatorGroup: Pick<InitiatorGroup, "devicePath">) {
    return initiatorGroup.devicePath.split("/")[6]!
  }
}
