import { PCSResourceType, PCSResourceTypeInfo } from '@/tabs/iSCSI/types/cluster/PCSResource';
import { PCSResourceManager } from './../cluster/PCSResourceManager';
import { RBDManager } from './../cluster/RBDManager';
import { ConfigurationManager } from "@/tabs/iSCSI/types/ConfigurationManager";
import { VirtualDevice, DeviceType } from "@/tabs/iSCSI/types/VirtualDevice";
import { CHAPConfiguration, CHAPType } from "@/tabs/iSCSI/types/CHAPConfiguration";
import { type Connection } from "@/tabs/iSCSI/types/Connection";
import { Initiator } from "@/tabs/iSCSI/types/Initiator";
import { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import { LogicalUnitNumber } from "@/tabs/iSCSI/types/LogicalUnitNumber";
import { Portal } from "@/tabs/iSCSI/types/Portal";
import { type Session } from "@/tabs/iSCSI/types/Session";
import { type Target } from "@/tabs/iSCSI/types/Target";
import { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import {
    BashCommand,
    Command,
    Directory,
    ProcessError,
    safeJsonParse,
    Server,
    StringToIntCaster,
} from "@45drives/houston-common-lib";
import { ResultAsync, err, errAsync, ok, okAsync, safeTry } from "neverthrow";
import { useUserSettings } from "@/common/user-settings";
import { ISCSIDriverSingleServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverSingleServer";
import { PCSResource } from '@/tabs/iSCSI/types/cluster/PCSResource';
import { PCSResourceGroup } from '@/tabs/iSCSI/types/cluster/PCSResourceGroup';
import { RadosBlockDevice } from '@/tabs/iSCSI/types/cluster/RadosBlockDevice';
import { LogicalVolume } from '@/tabs/iSCSI/types/cluster/LogicalVolume';
import { Result } from 'postcss';
import { PhysicalVolume } from '../cluster/PhysicalVolume';
import { VolumeGroup } from '../cluster/VolumeGroup';

const userSettingsResult = ResultAsync.fromSafePromise(useUserSettings(true));

export class ISCSIDriverClusteredServer implements ISCSIDriver {
    server: Server;
    configurationManager: ConfigurationManager;
    rbdManager: RBDManager;
    pcsResourceManager: PCSResourceManager;

    singleServerDriver: ISCSIDriverSingleServer | undefined;

    targets: Target[];
    virtualDevices: VirtualDevice[];
    allServers: Server[];

    deviceTypeToHandlerDirectory = {
        [DeviceType.BlockIO]: "/sys/kernel/scst_tgt/handlers/vdisk_blockio",
    };

    targetManagementDirectory = "/sys/kernel/scst_tgt/targets/iscsi";

      resourceNamePrefix = "iscsi"
    resourceGroupPrefix = "iscsi_group";

    constructor(server: Server) {
        this.server = server;
        this.configurationManager = new ConfigurationManager(server);
        this.rbdManager = new RBDManager(server);
        this.pcsResourceManager = new PCSResourceManager(server);
        this.virtualDevices = [];
        this.targets = [];
        this.allServers = [];
    }

    initialize() {
        return new Directory(this.server, "/sys/kernel/scst_tgt").exists()
            .andThen((exists) => {
                if (!exists) {
                    return err(new ProcessError("/sys/kernel/scst_tgt was not found. Is SCST installed?"));
                }
                const primaryServer = this.server;
                // Initialize core managers with the primary server
                this.server = primaryServer;
                this.singleServerDriver = new ISCSIDriverSingleServer(primaryServer);
                this.configurationManager = new ConfigurationManager(primaryServer);
                this.rbdManager = new RBDManager(primaryServer);
                this.pcsResourceManager = new PCSResourceManager(primaryServer);
                // Fetch virtual devices after setting up the server
                return this.rbdManager.initialize()
                .andThen(() => this.getExistingVirtualDevices())
                .map((devices) => this.virtualDevices.push(...devices))
                .map(() => this);
        });

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

    addVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        this.virtualDevices = [...this.virtualDevices, virtualDevice];
        return okAsync(undefined);
    }

    removeVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        if (virtualDevice.assigned) {
            return errAsync(new ProcessError("Cannot delete assigned devices in clustered environment."));
        } else {
            this.virtualDevices = this.virtualDevices.filter((existingDevice) => existingDevice.deviceName !== virtualDevice.deviceName);
            return okAsync(undefined);
        }
    }


    createTarget(target: Target): ResultAsync<void, ProcessError> {
        const targetResourceName = `${this.resourceNamePrefix}_TARGET_${target.name}`;
        const creationArugments = `ocf:heartbeat:iSCSITarget iqn=${target.name} op start timeout=20 op stop timeout=20 op monitor interval=20 timeout=40`;
        return this.pcsResourceManager.createResource(targetResourceName, creationArugments, PCSResourceType.TARGET)
            .andThen((resource) => {
                target.devicePath = resource.name;
                return this.pcsResourceManager.addResourceToGroup(resource, new PCSResourceGroup(`${this.resourceGroupPrefix}_${resource.name}`))
            })
            .map(() => target.initiatorGroups.push(new InitiatorGroup("allowed", [], [], targetResourceName)))
            .map(() => undefined)
    }

    removeTarget(target: Target): ResultAsync<void, ProcessError> {
        const self = this;

        return new ResultAsync(safeTry(async function* () {
            for (let group of target.initiatorGroups) {
                for (let lun of group.logicalUnitNumbers) {
                    yield* self.removeLogicalUnitNumberFromGroup(group, lun).safeUnwrap();
                }
            }

            const targetResource = yield* self.findTargetPCSResource(target).safeUnwrap();

            yield* self.pcsResourceManager.deleteResourceGroup(targetResource.resourceGroup!).safeUnwrap();

            return okAsync(undefined);
        }))
    }

    addPortalToTarget(target: Target, portal: Portal) {
        return userSettingsResult.andThen((userSettings) => {
            const createdResources: PCSResource[] = [];

            const updatedPortalList = [...target.portals.map((targetPortal) => targetPortal.address), portal.address + ":3260"].join(", ");

            const vipCreationArugments = `ocf:heartbeat:IPaddr2 ip=${portal.address} cidr_netmask=${userSettings.value.iscsi.subnetMask.toString()} op start timeout=20 op stop timeout=20 op monitor interval=10`;
            const portblockOnCreationArugments = `ocf:heartbeat:portblock ip=${portal.address} portno=3260 protocol=tcp action=block op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`;
            const portblockOffCreationArugments = `ocf:heartbeat:portblock ip=${portal.address} portno=3260 protocol=tcp action=unblock op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`;

            return this.findTargetPCSResource(target)
                .andThen((targetResource) => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_VIP_${portal.address}`, vipCreationArugments, PCSResourceType.VIP)
                    .andThen((vipResource) => {
                        createdResources.push(vipResource);
                        return this.pcsResourceManager.addResourceToGroup(vipResource, targetResource.resourceGroup!);
                    })
                    .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_PORTBLOCKON_${portal.address}`, portblockOnCreationArugments, PCSResourceType.PORTBLOCK_ON))
                    .andThen((portBlockResource) => {
                        createdResources.push(portBlockResource);
                        return this.pcsResourceManager.addResourceToGroup(portBlockResource, targetResource.resourceGroup!);
                    })
                    .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_PORTBLOCKOFF_${portal.address}`, portblockOffCreationArugments, PCSResourceType.PORTBLOCK_OFF))
                    .andThen((portBlockResource) => {
                        createdResources.push(portBlockResource);
                        return this.pcsResourceManager.addResourceToGroup(portBlockResource, targetResource.resourceGroup!);
                    })
                    .andThen(() => this.pcsResourceManager.updateResource(targetResource, `portals='${updatedPortalList}'`))
                )
                .mapErr((err) => {
                    createdResources.forEach((resource) => this.pcsResourceManager.deleteResource(resource))
                    return err;
                });
        });
    }

    deletePortalFromTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
        return this.findTargetPCSResource(target)
            .andThen((targetResource) => {
                const updatedPortalList = target.portals.filter((existingPortal) => existingPortal !== portal).map((existingPortal) => existingPortal.address).join(", ");

                return this.pcsResourceManager.updateResource(targetResource, `portals='${updatedPortalList}'`)
                    .andThen(() => this.findPortblockPCSResource(target, portal, PCSResourceType.PORTBLOCK_OFF))
                    .andThen((resource) => {
                        if (resource !== undefined) {
                            return this.pcsResourceManager.deleteResource(resource);
                        }

                        return okAsync(undefined);
                    })
                    .andThen(() => this.findPortblockPCSResource(target, portal, PCSResourceType.PORTBLOCK_ON))
                    .andThen((resource) => {
                        if (resource !== undefined) {
                            return this.pcsResourceManager.deleteResource(resource);
                        }

                        return okAsync(undefined);
                    })
                    .andThen(() => this.findPortblockVIPResource(target, portal))
                    .andThen((resource) => {
                        if (resource !== undefined) {
                            return this.pcsResourceManager.deleteResource(resource);
                        }

                        return okAsync(undefined);
                    })
            })
    }

    // Only group available is created by default by the Target resource, called 'allowed'
    addInitiatorGroupToTarget(
        _target: Target,
        _initiatorGroup: InitiatorGroup
    ): ResultAsync<void, ProcessError> {
        throw new Error("Adding initiator groups is not supported by this driver.");
    }

    // Only group available is created by default by the Target resource, called 'allowed'
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
        const updatedInitiatorList = [...initiatorGroup.initiators, initiator].map((initiator) => initiator.name).join(" ");

        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
            .andThen((targetResource) => {
                if (targetResource !== undefined)
                    return this.pcsResourceManager.updateResource(targetResource, `allowed_initiators='${updatedInitiatorList}'`)

                return errAsync(new ProcessError("Could not find Target resource."))
            })
    }

    removeInitiatorFromGroup(
        initiatorGroup: InitiatorGroup,
        initiator: Initiator
    ): ResultAsync<void, ProcessError> {
        const updatedInitiatorList = initiatorGroup.initiators.filter((existinginitiator) => existinginitiator !== initiator).map((existinginitiator) => existinginitiator.name).join(" ");

        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
            .andThen((targetResource) => {
                if (targetResource !== undefined)
                    return this.pcsResourceManager.updateResource(targetResource, `allowed_initiators='${updatedInitiatorList}'`)

                return errAsync(new ProcessError("Could not find Target resource."))
            })
    }

    addLogicalUnitNumberToGroup(
        initiatorGroup: InitiatorGroup,
        logicalUnitNumber: LogicalUnitNumber
    ): ResultAsync<void, ProcessError> {
        const self = this;

        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
            .andThen((targetResource) => {
                if (targetResource !== undefined) {
                    return new ResultAsync(safeTry(async function* () {
                        const targetIQN = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValue(targetResource, "iqn").safeUnwrap();
                        if( logicalUnitNumber.blockDevice?.vgName === undefined) {
                            if(logicalUnitNumber.blockDevice! instanceof LogicalVolume) {
                                yield* self.createAndConfigureLVResources(logicalUnitNumber, targetIQN!, targetResource.resourceGroup!).safeUnwrap();
                            }
                            else{
                                const lvPath = logicalUnitNumber.blockDevice!.filePath;
                                const pathParts = lvPath.split("/");
                
                               if (pathParts.length < 4) {
                                 throw new Error(`Invalid block device path: ${lvPath}`);
                                }
       
                                const vgname = pathParts[2];
                                const lvname = pathParts[3];
           
                               if (vgname && lvname) {
                                   const logicalVolume = yield* self.resolveLogicalVolume(vgname, lvname).safeUnwrap();
                                    logicalUnitNumber.blockDevice = logicalVolume;
                                    }

                    
                            yield* self.createAndConfigureLVResources(logicalUnitNumber, targetIQN!, targetResource.resourceGroup!).safeUnwrap();
                            }
                        }
                       else  if (logicalUnitNumber.blockDevice! instanceof RadosBlockDevice) {

                            yield* self.createAndConfigureRBDResource(logicalUnitNumber, targetIQN!, targetResource.resourceGroup!).safeUnwrap();
                        }
                        return okAsync(undefined);
                    }))
                }

                return errAsync(new ProcessError("Could not find Target resource."))
            })
    }
    
    resolveLogicalVolume(vgname: string, lvname: string): ResultAsync<LogicalVolume, Error> {
        const self = this;
    
        return this.server.execute(new BashCommand(`lvs --reportformat json --units B`))
            .map((proc) => proc.getStdout())
            .andThen(safeJsonParse<LogicalVolumeInfoJson>)
            .map((lvData) => {
                const lvs = lvData?.report?.flatMap((r) => r.lv) ?? [];
                const match = lvs.find((lv) => lv.lv_name === lvname && lv.vg_name === vgname);
                if (!match) throw new Error(`Logical volume ${vgname}/${lvname} not found`);
                return match;
            })
            .andThen((lvInfo) =>
                this.server.execute(new BashCommand(`pvs -S vgname=${vgname} --reportformat json --units B`))
                    .map((proc) => proc.getStdout())
                    .andThen(safeJsonParse<VolumeGroupInfoJson>)
                    .map((pvData) => pvData?.report?.flatMap((r) => r.pv) ?? [])
                    .andThen((pvList) =>   new ResultAsync<LogicalVolume, Error>(safeTry(async function* () {
                        const mappedBlockDevices = yield* self.rbdManager.fetchAvaliableRadosBlockDevices().safeUnwrap();
                        const physicalVolumes = pvList.flatMap((pv) =>
                            mappedBlockDevices.find((rbd) => rbd.filePath === pv.pv_name)
                        )
                        .filter((rbd): rbd is RadosBlockDevice => rbd !== undefined)
                        .map((rbd) => new PhysicalVolume(rbd));
    
                        const vg = new VolumeGroup(vgname, physicalVolumes);
                        const lv = new LogicalVolume(
                            lvname,
                            0,
                            vg,
                            StringToIntCaster()(lvInfo.lv_size).some()
                        );
                        return okAsync(lv);
                    })))
            );
    }

    // removeLogicalUnitNumberFromGroup(
    //     initiatorGroup: InitiatorGroup,
    //     logicalUnitNumber: LogicalUnitNumber
    // ): ResultAsync<void, ProcessError> {
    //     const self = this;
    //     console.log("hello from removeLogicalUnitNumberFromGroup")
    //     return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
    //         .andThen((targetResource) => new ResultAsync(safeTry(async function* () {
    //             const targetIQN = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValue(targetResource!, "iqn").safeUnwrap();
    //             if(logicalUnitNumber.blockDevice?.vgName=== undefined) {

    //             }
    //             if (logicalUnitNumber.blockDevice! instanceof RadosBlockDevice) {
    //                 console.log("removing from RadosBlockDevice block ", logicalUnitNumber)

    //                 yield* self.removeRBDAndRelatedResource(logicalUnitNumber, targetIQN!).safeUnwrap();
    //             }
    //             else if (logicalUnitNumber.blockDevice! instanceof LogicalVolume) {
    //                 console.log("removing from LogicalVolume block ", logicalUnitNumber)

    //                 yield* self.removeLVAndRelatedResources(logicalUnitNumber, targetIQN!).safeUnwrap();
    //             }
    //             else {
    //                 console.log("removing from else block ", logicalUnitNumber)
    //                 yield* self.removeLUNResource(logicalUnitNumber, targetIQN!).safeUnwrap();
    //             }

    //             return okAsync(undefined)
    //         })));
    // }
    removeLogicalUnitNumberFromGroup(
        initiatorGroup: InitiatorGroup,
        logicalUnitNumber: LogicalUnitNumber
      ): ResultAsync<void, ProcessError> {
        const self = this;
      
        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
          .andThen((targetResource) =>
            new ResultAsync(safeTry(async function* () {
              const targetIQN = yield* self.pcsResourceManager
                .fetchResourceInstanceAttributeValue(targetResource!, "iqn")
                .safeUnwrap();
      
              if (logicalUnitNumber.blockDevice?.vgName === undefined) {
                if (logicalUnitNumber.blockDevice instanceof LogicalVolume) {
                  yield* self.removeLVAndRelatedResources(logicalUnitNumber, targetIQN!).safeUnwrap();
                } else {
                  const lvPath = logicalUnitNumber.blockDevice!.filePath;
                  const pathParts = lvPath.split("/");
      
                  if (pathParts.length < 4) {
                    throw new Error(`Invalid block device path: ${lvPath}`);
                  }
      
                  const vgname = pathParts[2];
                  const lvname = pathParts[3];
      
                  if (vgname && lvname) {
                    const logicalVolume = yield* self.resolveLogicalVolume(vgname, lvname).safeUnwrap();
                    logicalUnitNumber.blockDevice = logicalVolume;
                  }
      
                  yield* self.removeLVAndRelatedResources(logicalUnitNumber, targetIQN!).safeUnwrap();
                }
              } else if (logicalUnitNumber.blockDevice instanceof RadosBlockDevice) {
                yield* self.removeRBDAndRelatedResource(logicalUnitNumber, targetIQN!).safeUnwrap();
              } else {
                yield* self.removeLUNResource(logicalUnitNumber, targetIQN!).safeUnwrap();
              }
      
              return ok(undefined); // ✅ Do not use okAsync inside safeTry
            }))
          )
          .andThen(() => {
            return this.server
              .execute(new BashCommand(`pcs resource cleanup`))
              .map(() => undefined); // Ensures return type matches: ResultAsync<void, ProcessError>
          });
      }
      

    addCHAPConfigurationToTarget(
        target: Target,
        chapConfiguration: CHAPConfiguration
    ): ResultAsync<void, ProcessError> {
        return this.findTargetPCSResource(target)
            .andThen((targetResource) => this.pcsResourceManager.updateResource(targetResource, `incoming_username='${chapConfiguration.username}' incoming_password='${chapConfiguration.password}'`))
    }

    removeCHAPConfigurationFromTarget(
        target: Target,
        _chapConfiguration: CHAPConfiguration
    ): ResultAsync<void, ProcessError> {
        return this.findTargetPCSResource(target)
            .andThen((targetResource) => this.pcsResourceManager.updateResource(targetResource, `incoming_username='' incoming_password=''`))
    }

    getVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError> {
        return okAsync(this.virtualDevices);
    }

    getExistingVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError> {
        const self = this;

        return new ResultAsync(safeTry(async function* () {
            const foundDevices: VirtualDevice[] = [];

          const availableLogicalVolumes = yield* self.rbdManager.fetchAvaliableLogicalVolumes().safeUnwrap();
            const availableRadosBlockDevices = yield* self.rbdManager.fetchAvaliableRadosBlockDevices().safeUnwrap();
          console.log("Available Logical Volumes:", availableLogicalVolumes);
            const resources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

            // Track paths used in LUNs
            const assignedPaths = new Set<string>();

            // === 1. Parse LUN resources to identify assigned devices ===
            for (let resource of resources.filter((r) => r.resourceType === PCSResourceType.LUN)) {
                const attributes = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["path"]).safeUnwrap();
                const path = attributes.get("path");
                if (!path) continue;

                assignedPaths.add(path);

                // Try to match Logical Volume
               const lv = availableLogicalVolumes.find((vol) => vol.filePath === path);
                if (lv) {
                    foundDevices.push(new VirtualDevice(lv.deviceName, lv.filePath, lv.blockSize, lv.deviceType, true));
                    continue;
                }

                // Try to match RBD
                const rbd = availableRadosBlockDevices.find((r) => r.filePath === path);
                if (rbd) {
                    rbd.assigned = true;
                    foundDevices.push(rbd);
                    continue;
                }
                // Fallback unknown BlockIO device
                const blockSizeResult = await self.rbdManager.getBlockSizeFromDevicePath(path,server);
                const blockSize = 0;

                foundDevices.push(new VirtualDevice(path, path, blockSize, DeviceType.BlockIO, true));
            }

            // === 2. Add all UNASSIGNED RBDs ===
            for (let rbd of availableRadosBlockDevices) {
                if (!assignedPaths.has(rbd.filePath)) {
                    foundDevices.push(new VirtualDevice(rbd.deviceName, rbd.filePath, rbd.blockSize, rbd.deviceType, false,rbd.vgName));
                }
            }

            // === 3. Add all UNASSIGNED Logical Volumes ===
            for (let lv of availableLogicalVolumes) {
                if (!assignedPaths.has(lv.filePath)) {
                    foundDevices.push(new VirtualDevice(lv.deviceName, lv.filePath, lv.blockSize, lv.deviceType, false));
                }
            }
            console.log("Found devices:", foundDevices);
            return ok(foundDevices);
        }));
    }


    getTargets(): ResultAsync<Target[], ProcessError> {
        const self = this;

        return this.pcsResourceManager.fetchResources()
            .map((resources) => resources.filter((resource) => resource.resourceType === PCSResourceType.TARGET))
            .andThen((filteredResources) => ResultAsync.combine(
                filteredResources.map((resource) =>
                    new ResultAsync(safeTry(async function* () {
                        const targetIQN = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValue(resource, "iqn").safeUnwrap();

                        const partialTarget = {
                            name: targetIQN!,
                            devicePath: resource.name
                        };

                        return ok<Target>({
                            ...partialTarget,
                            portals: yield* self.getPortalsOfTarget(partialTarget).safeUnwrap(),
                            chapConfigurations: yield* self.getCHAPConfigurationsOfTarget(partialTarget).safeUnwrap(),
                            initiatorGroups: yield* self.getInitatorGroupsOfTarget(partialTarget).safeUnwrap(),
                            sessions: yield* self.getSessionsOfTarget(partialTarget).safeUnwrap()
                        });
                    }))
                )
            ))
    }

    getPortalsOfTarget(target: Pick<Target, "name" | "devicePath">): ResultAsync<Portal[], ProcessError> {
        return this.findTargetPCSResource(target)
            .andThen((targetResource) => this.pcsResourceManager.fetchResourceInstanceAttributeValue(targetResource, "portals"))
            .map((portalsString) => {
                if (portalsString !== undefined)
                    return portalsString!.split(", ").map((portalAddress) => new Portal(portalAddress));

                return [];
            })
    }

    // iSCSI through PCS only seems to support one ini_group 'allowed', that is created automatically.
    getInitatorGroupsOfTarget(target: Pick<Target, "name" | "devicePath">): ResultAsync<InitiatorGroup[], ProcessError> {
        const self = this;

        return this.findTargetPCSResource(target)
            .andThen((resource) => new ResultAsync(safeTry(async function* () {
                const partialInitiatorGroup = {
                    name: "allowed",
                    devicePath: resource.name,
                }

                return ok<InitiatorGroup[]>([{
                    ...partialInitiatorGroup,
                    logicalUnitNumbers: yield* self.getLogicalUnitNumbersOfInitiatorGroup(partialInitiatorGroup).safeUnwrap(),
                    initiators: yield* self.getInitiatorsOfInitiatorGroup(partialInitiatorGroup).safeUnwrap()
                }])
            })))
    }

    getCHAPConfigurationsOfTarget(target: Pick<Target, "name" | "devicePath">): ResultAsync<CHAPConfiguration[], ProcessError> {
        return this.findTargetPCSResource(target)
            .andThen((resource) => this.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["incoming_username", "incoming_password"]))
            .map((value) => {
                if (value.get("incoming_username") !== undefined && value.get("incoming_password") !== undefined) {
                    return [new CHAPConfiguration(value.get("incoming_username")!, value.get("incoming_password")!, CHAPType.IncomingUser)]
                }

                return [];
            })
    }

    getLogicalUnitNumbersOfInitiatorGroup(initiatorGroup: Pick<InitiatorGroup, "devicePath">): ResultAsync<LogicalUnitNumber[], ProcessError> {
        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
            .andThen((targetResource) => this.pcsResourceManager.fetchResources().map((resources) => resources.filter((resource) => resource.resourceType === PCSResourceType.LUN && resource.resourceGroup?.name === targetResource?.resourceGroup?.name)))
            .andThen((filteredResources) => {
                return ResultAsync.combine(filteredResources.map((resource) => this.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["lun", "path"])
                    .andThen((values) => {
                        const lunAttribute = StringToIntCaster()(values.get("lun")!);
                        const virtualDevice = this.virtualDevices.find((device) => device.filePath === values.get("path"));

                        if (virtualDevice !== undefined)
                            return okAsync(new LogicalUnitNumber(virtualDevice.deviceName, lunAttribute.some(), virtualDevice));

                        return okAsync(undefined);
                    })
                ))
                    .map((foundLuns) => foundLuns.filter((lun) => lun !== undefined)) as ResultAsync<LogicalUnitNumber[], ProcessError>;
            });
    }

    getInitiatorsOfInitiatorGroup(initiatorGroup: Pick<InitiatorGroup, "name" | "devicePath">): ResultAsync<Initiator[], ProcessError> {
        return this.pcsResourceManager.fetchResourceByName(initiatorGroup.devicePath)
            .andThen((targetResource) => this.pcsResourceManager.fetchResourceInstanceAttributeValue(targetResource!, "allowed_initiators"))
            .map((value) => {
                if (value !== undefined) {
                    return value.split(" ").map((initiatorName) => new Initiator(initiatorName))
                }

                return [];
            })
    }

    getSessionsOfTarget(target: Pick<Target, "name">): ResultAsync<Session[], ProcessError> {
        return this.singleServerDriver!.getSessionsOfTarget(target);
    }

    getConnectionsOfSession(session: Session): ResultAsync<Connection[], ProcessError> {
        return this.singleServerDriver!.getConnectionsOfSession(session);
    }

    findTargetPCSResource(target: Pick<Target, "name" | "devicePath">) {
        const self = this;

        return this.pcsResourceManager.fetchResourceByName(target.devicePath)
            .andThen((resource) => {
                return resource !== undefined ? okAsync(resource) : errAsync(new ProcessError(`Unable to find resource for Target IQN ${target.name}.`))
            });
    }

    findPortblockPCSResource(target: Target, portal: Portal, type: PCSResourceType.PORTBLOCK_ON | PCSResourceType.PORTBLOCK_OFF) {
        const self = this;

        const actionFromType = type === PCSResourceType.PORTBLOCK_ON ? "block" : "unblock";

        return this.findTargetPCSResource(target)
            .andThen((targetResource) => new ResultAsync(safeTry(async function* () {
                if (targetResource.resourceGroup != undefined) {
                    let resources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

                    for (var groupResource of resources.filter((resource) => resource.resourceGroup?.name === targetResource.resourceGroup?.name)) {
                        let attributes = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues({ name: groupResource.name }, ["action", "ip"]).safeUnwrap();

                        if (attributes.get("action") === actionFromType && attributes.get("ip") === portal.address.split(":")[0]!) {
                            const resource = yield* self.pcsResourceManager.fetchResourceByName(groupResource.name).safeUnwrap();
                            return ok<PCSResource>(resource!);
                        }
                    }
                }

                return ok(undefined);
            })))
    }

    findPortblockVIPResource(target: Target, portal: Portal) {
        const self = this;

        return this.findTargetPCSResource(target)
            .andThen((targetResource) => new ResultAsync(safeTry(async function* () {
                if (targetResource.resourceGroup != undefined) {
                    let resources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

                    for (var groupResource of resources.filter((resource) => resource.resourceGroup?.name === targetResource.resourceGroup?.name)) {
                        const foundResource = yield* self.pcsResourceManager.fetchResourceByName(groupResource.name).safeUnwrap();

                        if (foundResource!.resourceType === PCSResourceType.VIP) {
                            const vipAddress = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValue(foundResource!, "ip").safeUnwrap();

                            if (vipAddress === portal.address.split(":")[0]!) {
                                return ok<PCSResource>(foundResource!);
                            }
                        }
                    }
                }

                return ok(undefined);
            })))
    }

    createAndConfigureRBDResource(lun: LogicalUnitNumber, targetIQN: string, group: PCSResourceGroup) {
        const blockDevice = (lun.blockDevice! as RadosBlockDevice);

        return this.server.execute(new BashCommand(`rbd unmap ${blockDevice.parentPool.name}/${blockDevice.deviceName}`))
            .andThen(() => this.pcsResourceManager.createResource(`RBD_${blockDevice.deviceName}`, `ocf:ceph:rbd name=${blockDevice.deviceName} pool=${blockDevice.parentPool.name} user=admin cephconf=/etc/ceph/ceph.conf op start timeout=60s interval=0 op stop timeout=60s interval=0 op monitor timeout=30s interval=15s`, PCSResourceType.RBD)
                .andThen((resource) => this.pcsResourceManager.constrainResourceToGroup(resource, group)
                    .andThen(() => this.pcsResourceManager.orderResourceBeforeGroup(resource, group)))
            )
            .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_LUN_${blockDevice.deviceName}`, `ocf:heartbeat:iSCSILogicalUnit target_iqn=${targetIQN} lun=${lun.unitNumber} path=${blockDevice.filePath} op start timeout=100 op stop timeout=100 op monitor interval=10 timeout=100`, PCSResourceType.LUN))
            .andThen((resource) => this.pcsResourceManager.addResourceToGroup(resource, group))
    }

    removeRBDAndRelatedResource(lun: LogicalUnitNumber, targetIQN: string) {
        const self = this;

        const blockDevice = lun.blockDevice! as RadosBlockDevice;

        return new ResultAsync(safeTry(async function* () {
            yield* self.removeRBDResources([blockDevice]).safeUnwrap();
            yield* self.removeLUNResource(lun, targetIQN).safeUnwrap();

            return ok(undefined);
        }))
    }

     createAndConfigureLVResources(lun: LogicalUnitNumber, targetIQN: string, group: PCSResourceGroup) {
        const self = this;

        const blockDevice = (lun.blockDevice! as LogicalVolume);
        // const blockDevice = lun.blockDevice ?? await self.resolveLogicalVolume(lun);
        console.log("BlockDevice ",blockDevice)
        return this.server.execute(new BashCommand(`lvchange -an ${blockDevice!.volumeGroup.name}/${blockDevice!.deviceName}`))
            .andThen(() => new ResultAsync(safeTry(async function* () {
                for (let physicalVolume of blockDevice.volumeGroup.volumes) {
                    yield* self.server.execute(new BashCommand(`rbd unmap ${physicalVolume.rbd.parentPool.name}/${physicalVolume.rbd.deviceName}`)).safeUnwrap();

                    const resource = yield* self.pcsResourceManager.createResource(`RBD_${physicalVolume.rbd.deviceName}`, `ocf:ceph:rbd name=${physicalVolume.rbd.deviceName} pool=${physicalVolume.rbd.parentPool.name} user=admin cephconf=/etc/ceph/ceph.conf op start timeout=60s interval=0 op stop timeout=60s interval=0 op monitor timeout=30s interval=15s`, PCSResourceType.RBD).safeUnwrap();

                    yield* self.pcsResourceManager.constrainResourceToGroup(resource, group).safeUnwrap();
                    yield* self.pcsResourceManager.orderResourceBeforeGroup(resource, group).safeUnwrap();
                }

                return ok(undefined);
            })))
            .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_LVM_${blockDevice.deviceName}_${blockDevice.volumeGroup.name}`, `ocf:heartbeat:LVM-activate lvname=${blockDevice.deviceName} vgname=${blockDevice.volumeGroup.name} activation_mode=exclusive vg_access_mode=system_id op start timeout=30 op stop timeout=30 op monitor interval=10 timeout=60`, PCSResourceType.LVM))
            .andThen((resource) => this.pcsResourceManager.addResourceToGroup(resource, group))
            .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_LUN_${blockDevice.deviceName}`, `ocf:heartbeat:iSCSILogicalUnit target_iqn=${targetIQN} lun=${lun.unitNumber} path=${blockDevice.filePath} op start timeout=100 op stop timeout=100 op monitor interval=10 timeout=100`, PCSResourceType.LUN))
            .andThen((resource) => this.pcsResourceManager.addResourceToGroup(resource, group))
            .andThen(() => this.server.execute(new BashCommand(`pcs resource cleanup`)))
    }
    removeLVAndRelatedResources(lun: LogicalUnitNumber, targetIQN: string) {
        const self = this;

        const blockDevice = lun.blockDevice! as LogicalVolume;

        return new ResultAsync(safeTry(async function* () {
            let rbdsToRemove = blockDevice.volumeGroup.volumes.map((physicalVolume) => physicalVolume.rbd);

            yield* self.removeLUNResource(lun, targetIQN).safeUnwrap();

            const lvmResources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();
            console.log("LVM resource ",lvmResources)

            for (var resource of lvmResources.filter((resource) => resource.resourceType === PCSResourceType.LVM)) {
               console.log("LVM resource in for loop",resource)
                const values = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["lvname", "vgname"]).safeUnwrap();
                console.log("LVM resource values ",values)
                if (values.get("lvname") === blockDevice.deviceName && values.get("vgname") === blockDevice.volumeGroup.name) {
                    console.log("Deleting LVM resource ",resource)
                    yield* self.pcsResourceManager.deleteResource(resource).safeUnwrap();
                    break;
                }
            }

            yield* self.removeRBDResources(rbdsToRemove).safeUnwrap();

            return ok(undefined);
        }))
    }

    removeRBDResources(rbdsToRemove: RadosBlockDevice[]) {
        const self = this;
        return new ResultAsync(safeTry(async function* () {
            const rbdResources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

            for (var resource of rbdResources.filter((resource) => resource.resourceType === PCSResourceType.RBD)) {
                const values = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["name", "pool"]).safeUnwrap();

                for (var rbdToRemove of rbdsToRemove) {
                    if (values.get("name") === rbdToRemove.deviceName && values.get("pool") === rbdToRemove.parentPool.name) {
                        yield* self.pcsResourceManager.disableResource(resource).safeUnwrap();
                        break;
                    }
                }
            }

            for (var resource of rbdResources.filter((resource) => resource.resourceType === PCSResourceType.RBD)) {
                const values = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["name", "pool"]).safeUnwrap();

                for (var rbdToRemove of rbdsToRemove) {
                    if (values.get("name") === rbdToRemove.deviceName && values.get("pool") === rbdToRemove.parentPool.name) {
                        yield* self.pcsResourceManager.deleteResource(resource).safeUnwrap();
                        break;
                    }
                }
            }

            return ok(undefined);
        }));
    }

    removeLUNResource(lun: LogicalUnitNumber, targetIQN: string) {
        const self = this;

        return new ResultAsync(safeTry(async function* () {
            const lunResources = yield* self.pcsResourceManager.fetchResources().safeUnwrap();

            for (var resource of lunResources.filter((resource) => resource.resourceType === PCSResourceType.LUN)) {
                const values = yield* self.pcsResourceManager.fetchResourceInstanceAttributeValues(resource, ["lun", "target_iqn"]).safeUnwrap();

                if (values.get("lun") === lun.unitNumber.toString() && values.get("target_iqn") === targetIQN) {
                    yield* self.pcsResourceManager.deleteResource(resource).safeUnwrap();
                    break;
                }
            }

            return ok(undefined);
        }));
    }
}






type LogicalVolumeInfoJson = {
    report: {
        lv: {
            lv_name: string,
            vg_name: string,
            lv_size: string,
        }[]
    }[]
}

type VolumeGroupInfoJson = {
    report: {
        pv: {
            pv_name: string,
            vg_name: string,
        }[]
    }[]
}