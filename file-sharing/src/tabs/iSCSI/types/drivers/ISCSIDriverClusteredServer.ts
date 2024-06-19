import { ConfigurationManager } from '@/tabs/iSCSI/types/ConfigurationManager';
import { File, Process } from "@45drives/houston-common-lib";
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
import { BashCommand, Command, ParsingError, ProcessError, Server, StringToIntCaster, getServer } from "@45drives/houston-common-lib";
import { ResultAsync, err, ok, safeTry, okAsync, errAsync } from "neverthrow";
import { useUserSettings } from '@/common/user-settings';
import { ISCSIDriverSingleServer } from '@/tabs/iSCSI/types/drivers/ISCSIDriverSingleServer';
import { create } from 'domain';
import type { Result } from 'postcss';

export interface PCSResource {
    resourceName: string,
    resourceType: PCSResourceType,
    creationCommand: Command | undefined,
}

export enum PCSResourceType {
    PORTBLOCK_ON = "iscsi_portblock_on",
    VIP = "iscsi_vip",
    LVM = "iscsi_lvm",
    TARGET = "iscsi_target",
    LUN = "iscsi_lun",
    PORTBLOCK_OFF = "iscsi_portblock_off",
}

export class ISCSIDriverClusteredServer implements ISCSIDriver {

    server: Server;
    activeNode: Server | undefined;
    configurationManager: ConfigurationManager;

    singleServerDriver: ISCSIDriverSingleServer | undefined;

    virtualDevices: VirtualDevice[];

    deviceTypeToHandlerDirectory = {
        [DeviceType.BlockIO]: "/sys/kernel/scst_tgt/handlers/vdisk_blockio"
    };

    targetManagementDirectory = "/sys/kernel/scst_tgt/targets/iscsi";

    resourceGroupPrefix = "iscsi_group";

    constructor(server: Server) {
        this.server = server;
        this.configurationManager = new ConfigurationManager(server);
        this.virtualDevices = [];
    }

    initialize() {
        return this.getActiveNode()
                .map((server) => this.activeNode = server)
                .map((server) => {
                    const singleServerDriver = new ISCSIDriverSingleServer(server)
                    this.singleServerDriver = singleServerDriver;
                    return this;
                })
    }

    getHandledDeviceTypes(): DeviceType[] {
        return Object.keys(this.deviceTypeToHandlerDirectory) as DeviceType[];
    }

    getActiveNode(): ResultAsync<Server, ProcessError> {
        return this.server.execute(new BashCommand(`pcs status xml`))
            .map((proc) => {
                const output = proc.getStdout();
                const parser = new DOMParser();

                const doc = parser.parseFromString(output, "text/xml");
                return doc.getElementsByTagName("resource")[0]?.getElementsByTagName("node")[0]?.attributes.getNamedItem("name")?.value;
            })
            .map((nodeIP) => new Server(nodeIP));
    }

    addLVMResource(target: Target, virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        const lvmResource = this.createLVMResource(virtualDevice);

        return this.server.execute(lvmResource.creationCommand!)
                            .andThen(() => this.moveResourceToGroup(target, lvmResource))
                            .andThen(() => this.addVirtualDevice(virtualDevice));
    }

    removeLVMResource(target: Target, virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        return this.deleteResource({resourceName: `${PCSResourceType.LVM}_${virtualDevice.deviceName}`})
                    .andThen(() => this.removeVirtualDevice(virtualDevice))
    }

    addVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        this.virtualDevices = [...this.virtualDevices, virtualDevice];

        return okAsync(undefined);
    }

    removeVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {        
        this.virtualDevices = this.virtualDevices.filter((existingDevice) => existingDevice.deviceName !== virtualDevice.deviceName);

        return okAsync(undefined);
    }

    createTarget(target: Target): ResultAsync<void, ProcessError> {
        const resource = this.createTargetResource(target);

        return this.server.execute(resource.creationCommand!)
                    .andThen(() => this.moveResourceToGroup(target, resource))
                    .map(() => undefined);
    }

    removeTarget(target: Target): ResultAsync<void, ProcessError> {
        return this.deleteResource({resourceName: `${this.resourceGroupPrefix}_${target.name}`})
    }

    addPortalToTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
        const existingPortals = [...target.portals, portal].map((portal) => portal.address).join(', ');

        const portblockOnResource = this.createPortalPortblockOnResource(portal);
        const portblockOffResource = this.createPortalPortblockOffResource(portal);

        return this.server.execute(portblockOnResource.creationCommand!)
                    .andThen(() => this.server.execute(new BashCommand(`pcs resource update ${PCSResourceType.TARGET}_${target.name} portals='${existingPortals}'`)))
                    .andThen(() => this.moveResourceToGroup(target, portblockOnResource))
                    .andThen(() => this.server.execute(portblockOffResource.creationCommand!))
                    .andThen(() => this.moveResourceToGroup(target, portblockOffResource))
                    .andThen(() => okAsync(undefined));
    }

    deletePortalFromTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
        const existingPortals = target.portals.filter((existingPortal) => existingPortal !== portal).map((existingPortal) => existingPortal.address).join(', ');

        return this.server.execute(new BashCommand(`pcs resource update ${PCSResourceType.TARGET}_${target.name} portals='${existingPortals}'`))
                    .andThen(() => this.deleteResource({resourceName: `${PCSResourceType.PORTBLOCK_ON}_${portal.address}`}))
                    .andThen(() => this.deleteResource({resourceName: `${PCSResourceType.PORTBLOCK_OFF}_${portal.address}`}))
                    .andThen(() => okAsync(undefined));
    }

    addInitiatorGroupToTarget(target: Target, initiatorGroup: InitiatorGroup): ResultAsync<void, ProcessError> {
        throw new Error('Adding initiator groups is not supported by this driver.');
    }
    deleteInitiatorGroupFromTarget(target: Target, initiatorGroup: InitiatorGroup): ResultAsync<void, ProcessError> {
        throw new Error('Removing initiator groups is not supported by this driver.');
    }

    addInitiatorToGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): ResultAsync<void, ProcessError> {
        const targetName = initiatorGroup.devicePath.split('/')[5]!;
        
        const existingInitiators = [...initiatorGroup.initiators, initiator].map((initiator) => initiator.name).join(', ');

        return this.server.execute(new BashCommand(`pcs resource update ${PCSResourceType.TARGET}_${targetName} allowed_initiators='${existingInitiators}'`))
                    .andThen(() => okAsync(undefined));
    }

    removeInitiatorFromGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): ResultAsync<void, ProcessError> {
        const targetName = initiatorGroup.devicePath.split('/')[5]!;

        const existingInitiators = initiatorGroup.initiators.filter((existinginitiator) => existinginitiator !== initiator).map((existinginitiator) => existinginitiator.name).join(', ');

        return this.server.execute(new BashCommand(`pcs resource update ${PCSResourceType.TARGET}_${targetName} allowed_initiators='${existingInitiators}'`))
                    .andThen(() => okAsync(undefined));
    }

    addLogicalUnitNumberToGroup(initiatorGroup: InitiatorGroup, logicalUnitNumber: LogicalUnitNumber): ResultAsync<void, ProcessError> {
        const resource = this.createLogicalUnitNumberResources(initiatorGroup, logicalUnitNumber);

        const targetName = initiatorGroup.devicePath.split('/')[5]!;

        return this.server.execute(resource.creationCommand!)
                            .andThen(() => this.moveResourceToGroup({name: targetName}, resource));
    }

    removeLogicalUnitNumberFromGroup(initiatorGroup: InitiatorGroup, logicalUnitNumber: LogicalUnitNumber): ResultAsync<void, ProcessError> {
        return this.deleteResource({resourceName: `${PCSResourceType.LUN}_${logicalUnitNumber.unitNumber}`})
    }

    addCHAPConfigurationToTarget(target: Target, chapConfiguration: CHAPConfiguration): ResultAsync<void, ProcessError> {
        const command = new BashCommand(`pcs resource update ${PCSResourceType.TARGET}_${target.name} incoming_username='${chapConfiguration.username}' incoming_password='${chapConfiguration.password}'`);

        return this.server.execute(command)
                    .andThen(() => okAsync(undefined));
    }

    removeCHAPConfigurationFromTarget(target: Target, chapConfiguration: CHAPConfiguration): ResultAsync<void, ProcessError> {
        return this.server.execute(new BashCommand(`pcs resource update ${PCSResourceType.TARGET}_${target.name} incoming_username='' incoming_password=''`))
                    .andThen(() => okAsync(undefined));
    }

    getVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError> {
        return this.singleServerDriver!.getVirtualDevices();
    }

    getTargets(): ResultAsync<Target[], ProcessError> {
        return this.singleServerDriver!.getTargets();
    }

    getPortalsOfTarget(target: Target): ResultAsync<Portal[], ProcessError> {
        return this.singleServerDriver!.getPortalsOfTarget(target);
    }

    getInitatorGroupsOfTarget(target: Target): ResultAsync<InitiatorGroup[], ProcessError> {
        return this.singleServerDriver!.getInitatorGroupsOfTarget(target);
    }

    getCHAPConfigurationsOfTarget(target: Target): ResultAsync<CHAPConfiguration[], ProcessError> {
        return this.singleServerDriver!.getCHAPConfigurationsOfTarget(target);
    }

    getLogicalUnitNumbersOfInitiatorGroup(initiatorGroup: InitiatorGroup): ResultAsync<LogicalUnitNumber[], ProcessError> {
        return this.singleServerDriver!.getLogicalUnitNumbersOfInitiatorGroup(initiatorGroup);
    }

    getInitiatorsOfInitiatorGroup(initiatorGroup: InitiatorGroup): ResultAsync<Initiator[], ProcessError> {
        return this.singleServerDriver!.getInitiatorsOfInitiatorGroup(initiatorGroup);
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

        const splitFilePath = virtualDevice.filePath.split('/');

        const vgName = splitFilePath[-2]!;
        const lvName = splitFilePath[-1]!;

        return {
            resourceName: resourceName, 
            resourceType: resourceType,
            creationCommand: new BashCommand(`pcs resource create $1 ocf:heartbeat:LVM-activate lvname=$2 vgname=$3 activation_mode=exclusive vg_access_mode=system_id op start timeout=30 op stop timeout=30 op monitor interval=10 timeout=60`, 
                    [resourceName, lvName, vgName])
        };
    }

    createPortalVIPResource(portal: Portal): PCSResource {
        const resourceType = PCSResourceType.VIP;
        const resourceName = `${resourceType}_${portal.address}`;

        const subnetMask = useUserSettings().value.iscsi.subnetMask.toString();

        return {
            resourceName: `${resourceName}`, 
            resourceType: resourceType,
            creationCommand: new BashCommand(`pcs resource create $1 ocf:heartbeat:IPaddr2 ip=$2 cidr_netmask=$3 op start timeout=20 op stop timeout=20 op monitor interval=10`, [`${resourceName}`, portal.address, subnetMask])
        }
    }

    createPortalPortblockOnResource(portal: Portal): PCSResource {
        const resourceType = PCSResourceType.PORTBLOCK_ON;
        const resourceName = `${resourceType}_${portal.address}`;

        return {
            resourceName: `${resourceName}`,
            resourceType: resourceType,
            creationCommand: new BashCommand(`pcs resource create $1 ocf:heartbeat:portblock ip=$2 portno=3260 protocol=tcp action=block op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`, [`${resourceName}`, portal.address])
        };
    }

    createPortalPortblockOffResource(portal: Portal): PCSResource {
        const resourceType = PCSResourceType.PORTBLOCK_OFF;
        const resourceName = `${resourceType}_${portal.address}`;
        return {
            resourceName: `${resourceName}`,
            resourceType: resourceType,
            creationCommand: new BashCommand(`pcs resource create $1 ocf:heartbeat:portblock ip=$2 portno=3260 protocol=tcp action=unblock op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`, [`${resourceName}`, portal.address])
        };
    }

    createLogicalUnitNumberResources(initiatorGroup: InitiatorGroup, logicalUnitNumber: LogicalUnitNumber): PCSResource {
        const resourceType = PCSResourceType.LUN;
        const resourceName = `${resourceType}_${logicalUnitNumber.unitNumber}`;
        
        const targetName = initiatorGroup.devicePath.split('/')[5]!;

        return {
            resourceName: resourceName,
            resourceType: resourceType,
            creationCommand: new BashCommand(`pcs resource create $1 ocf:heartbeat:iSCSILogicalUnit target_iqn=$2 lun=$3 path=$4 op start timeout=100 op stop timeout=100 op monitor interval=10 timeout=100`, 
                    [resourceName, targetName, logicalUnitNumber.unitNumber.toString(), logicalUnitNumber.blockDevice!.filePath])
        };
    }

    createTargetResource(target: Target): PCSResource {
        const resourceType = PCSResourceType.TARGET;
        const resourceName = `${resourceType}_${target.name}`;

        return {
            resourceName: resourceName,
            resourceType: resourceType,
            creationCommand: new BashCommand(`pcs resource create $1 ocf:heartbeat:iSCSITarget iqn=$2 op start timeout=20 op stop timeout=20 op monitor interval=20 timeout=40`, 
            [resourceName, target.name])
        };
    }

    getCurrentResourcesInGroup(groupName: string): ResultAsync<PCSResource[], ProcessError> {
        
        return this.server.execute(new BashCommand(`pcs status xml`))
        .map((proc) => {
            let foundResources: PCSResource[] = [];
            const output = proc.getStdout();
            const parser = new DOMParser();

            const doc = parser.parseFromString(output, "text/xml");
            const groupElement = doc.querySelector(`resources > group[id=${groupName}]`);

            if (groupElement) {
                groupElement.querySelectorAll("resource").forEach((resource) => {
                    if (resource.getAttribute("id") !== null) {
                        const resourceType = this.getResourceType({resourceName: resource.getAttribute("id")!})

                        if (resourceType) {
                            const pcsResource = {
                                resourceName: resource.getAttribute("id")!,
                                resourceType: resourceType!,
                                creationCommand: undefined,
                            }

                            foundResources = [...foundResources, pcsResource];
                        }
                    }
                })
            } 

            return foundResources;
        })
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
        return this.server.execute(new BashCommand(`pcs resource delete $1`, [resource.resourceName]))
                            .map(() => undefined);
    }

    moveResourceToGroup(target: Pick<Target, "name">, resource: Pick<PCSResource, "resourceName" | "resourceType">): ResultAsync<void, ProcessError> {
        const PCSResourceTypeOrder = {
            [PCSResourceType.PORTBLOCK_ON]: 0,
            [PCSResourceType.VIP]: 1,
            [PCSResourceType.LVM]: 2,
            [PCSResourceType.TARGET]: 3,
            [PCSResourceType.LUN]: 4,
            [PCSResourceType.PORTBLOCK_OFF]: 5,
        }

        const currentResourceIndex = PCSResourceTypeOrder[resource.resourceType];

        return this.getCurrentResourcesInGroup(`${this.resourceGroupPrefix}_${target.name}`)
        .andThen((resources) => {
            let positionArgument: string[] = [];

            const nextResource = resources.find((existingResource) => currentResourceIndex <= PCSResourceTypeOrder[existingResource.resourceType]);

            if (nextResource !== undefined) {
                positionArgument = [`--before`, nextResource.resourceName];
            }

            const command = new Command([`pcs`, `resource`, `group`, `add`, `${this.resourceGroupPrefix}_${target.name}`, ...positionArgument, resource.resourceName]);
            return this.server.execute(command);
        })
        .map(() => undefined);
    }
}