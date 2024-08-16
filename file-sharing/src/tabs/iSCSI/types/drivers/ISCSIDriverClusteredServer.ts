import { PCSResourceType, PCSResourceTypeInfo } from '@/tabs/iSCSI/types/cluster/PCSResource';
import { PCSResourceManager } from './../cluster/PCSResourceManager';
import { RBDManager } from './../cluster/RBDManager';
import { ConfigurationManager } from "@/tabs/iSCSI/types/ConfigurationManager";
import { VirtualDevice, DeviceType } from "@/tabs/iSCSI/types/VirtualDevice";
import { CHAPConfiguration, CHAPType } from "@/tabs/iSCSI/types/CHAPConfiguration";
import { type Connection } from "@/tabs/iSCSI/types/Connection";
import { type Initiator } from "@/tabs/iSCSI/types/Initiator";
import { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
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
import { ResultAsync, err, errAsync, ok, okAsync, safeTry } from "neverthrow";
import { useUserSettings } from "@/common/user-settings";
import { ISCSIDriverSingleServer } from "@/tabs/iSCSI/types/drivers/ISCSIDriverSingleServer";
import { PCSResource } from '@/tabs/iSCSI/types/cluster/PCSResource';
import { PCSResourceGroup } from '@/tabs/iSCSI/types/cluster/PCSResourceGroup';
import { RadosBlockDevice } from '@/tabs/iSCSI/types/cluster/RadosBlockDevice';
import { LogicalVolume } from '@/tabs/iSCSI/types/cluster/LogicalVolume';

export class ISCSIDriverClusteredServer implements ISCSIDriver {
    server: Server;
    activeNode: Server | undefined;
    configurationManager: ConfigurationManager;
    rbdManager: RBDManager;
    pcsResourceManager:PCSResourceManager;

    singleServerDriver: ISCSIDriverSingleServer | undefined;

    targets: Target[];
    virtualDevices: VirtualDevice[];

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
    }

    initialize() {
        return okAsync(this);
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
        this.virtualDevices.push(virtualDevice);
        return okAsync(undefined);
    }

    removeVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        this.virtualDevices.filter((device) => device !== virtualDevice);
        return okAsync(undefined);
    }

    createTarget(target: Target): ResultAsync<void, ProcessError> {
        const creationArugments = `ocf:heartbeat:iSCSITarget iqn=${target.name} op start timeout=20 op stop timeout=20 op monitor interval=20 timeout=40`;
        return this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_target_${target.name}`, creationArugments, PCSResourceType.TARGET)
            .andThen((resource) => this.pcsResourceManager.addResourceToGroup(resource, new PCSResourceGroup(`${this.resourceGroupPrefix}_${target.name}`, [resource.name])))
            .map(() => target.initiatorGroups.push(new InitiatorGroup("allowed", [], [], `${this.resourceNamePrefix}_target_${target.name}`)))
            .map(() => undefined)
    }

    removeTarget(target: Target): ResultAsync<void, ProcessError> {
        return this.findTargetPCSResource(target)
        .andThen((targetResource) => {
            if (targetResource !== undefined) {
                return this.pcsResourceManager.deleteResource({name: targetResource.name})
            }
            else {
                return errAsync(new ProcessError(`Unable to find resource to delete for target: ${target.name}`))
            }
        })    
    }

    addPortalToTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
        const updatedPortalList = [...target.portals.map((targetPortal) => targetPortal.address), portal.address + ":3260"].join(", ");

        const vipCreationArugments  = `ocf:heartbeat:IPaddr2 ip=${portal.address} cidr_netmask=${useUserSettings().value.iscsi.subnetMask.toString()} op start timeout=20 op stop timeout=20 op monitor interval=10`;
        const portblockOnCreationArugments  = `ocf:heartbeat:portblock ip=${portal.address} portno=3260 protocol=tcp action=block op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`;
        const portblockOffCreationArugments  = `ocf:heartbeat:portblock ip=${portal.address} portno=3260 protocol=tcp action=unblock op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`;

        return this.findTargetPCSResource(target)
        .andThen((targetResource) => {
            if (targetResource !== undefined) {
                this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_VIP_${portal.address}`, vipCreationArugments, PCSResourceType.VIP)
                    .map((vipResource) => this.pcsResourceManager.addResourceToGroup(vipResource, targetResource.resourceGroup!))
                    .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_PORTBLOCKON_${portal.address}`, portblockOnCreationArugments, PCSResourceType.PORTBLOCK_ON))
                    .map((portBlockResource) => this.pcsResourceManager.addResourceToGroup(portBlockResource, targetResource.resourceGroup!))
                    .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_PORTBLOCKOFF_${portal.address}`, portblockOffCreationArugments, PCSResourceType.PORTBLOCK_OFF))
                    .map((portBlockResource) => this.pcsResourceManager.addResourceToGroup(portBlockResource, targetResource.resourceGroup!))
                    .map(() => this.pcsResourceManager.updateResource(targetResource, `portals='${updatedPortalList}'`))
            }

            return errAsync(new ProcessError("Unable to add portal to Target, PCS Group for Target not found."))
        })
    }

    deletePortalFromTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
        return this.findTargetPCSResource(target)
        .andThen((targetResource) => {
            if (targetResource !== undefined) {
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
            }
            else
                return errAsync(new ProcessError(`Unable to find Target resource to remove Portal resources from: ${target.name}`))
        })   
    }

    // Should not be used.
    addInitiatorGroupToTarget(
    _target: Target,
    _initiatorGroup: InitiatorGroup
    ): ResultAsync<void, ProcessError> {
        throw new Error("Adding initiator groups is not supported by this driver.");
    }

    // Should not be used.
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
                    if (targetResource !== undefined) {
                        return this.pcsResourceManager.updateResource(targetResource, `allowed_initiators='${updatedInitiatorList}'`)
                    }

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
                    if (targetResource !== undefined) {
                        return this.pcsResourceManager.updateResource(targetResource, `allowed_initiators='${updatedInitiatorList}'`)
                    }

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
                return new ResultAsync(safeTry(async function * () {
                    const targetIQN = yield * self.pcsResourceManager.fetchResourceConfig(targetResource)
                        .map((config) => config.instance_attributes![0]!.nvpairs.find((pair) => pair.name === "ip")!.value)
                        .safeUnwrap();
                    
                    if (logicalUnitNumber.blockDevice! instanceof RadosBlockDevice) {
                        yield * self.createAndConfigureRBDResource(logicalUnitNumber.blockDevice, targetResource.resourceGroup!).safeUnwrap();
                    }
                    else if (logicalUnitNumber.blockDevice! instanceof LogicalVolume) {
                        yield * self.createAndConfigureLVResources(logicalUnitNumber.blockDevice, targetResource.resourceGroup!).safeUnwrap();
                    }
                    else {
                        yield * self.pcsResourceManager.createResource(`${initiatorGroup.devicePath}_lun_${logicalUnitNumber.unitNumber}`, `ocf:heartbeat:iSCSILogicalUnit target_iqn=${targetIQN} lun=${logicalUnitNumber.unitNumber} path=${logicalUnitNumber.blockDevice!.filePath} op start timeout=100 op stop timeout=100 op monitor interval=10 timeout=100`, PCSResourceType.LUN).safeUnwrap();
                    }

                    return okAsync(undefined);
                }))
            }

            return errAsync(new ProcessError("Could not find Target resource."))
        })
    }

    removeLogicalUnitNumberFromGroup(
    initiatorGroup: InitiatorGroup,
    logicalUnitNumber: LogicalUnitNumber
    ): ResultAsync<void, ProcessError> {
    return okAsync(undefined);
    }

    addCHAPConfigurationToTarget(
    target: Target,
    chapConfiguration: CHAPConfiguration
    ): ResultAsync<void, ProcessError> {
        return this.findTargetPCSResource(target)
        .andThen((targetResource) => {
            if (targetResource !== undefined) {
                return this.pcsResourceManager.updateResource(targetResource, `incoming_username='${chapConfiguration.username}' incoming_password='${chapConfiguration.password}'`)
            }

            return errAsync(new ProcessError("Could not find Target resource."))
        })
    }

    removeCHAPConfigurationFromTarget(
    target: Target,
    _chapConfiguration: CHAPConfiguration
    ): ResultAsync<void, ProcessError> {
        return this.findTargetPCSResource(target)
        .andThen((targetResource) => {
            if (targetResource !== undefined) {
                return this.pcsResourceManager.updateResource(targetResource, `incoming_username='' incoming_password=''`)
            }

            return errAsync(new ProcessError("Could not find Target resource."))
        })
    }

    getVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError> {
    return okAsync([]);
    }

    getTargets(): ResultAsync<Target[], ProcessError> {
    return okAsync([]);
    }

    getPortalsOfTarget(target: Target): ResultAsync<Portal[], ProcessError> {
    return okAsync([]);
    }

    // iSCSI through PCS only seems to support one ini_group 'allowed', that is created automatically.
    getInitatorGroupsOfTarget(target: Target): ResultAsync<InitiatorGroup[], ProcessError> {
    return okAsync([]);
    }

    getCHAPConfigurationsOfTarget(target: Target): ResultAsync<CHAPConfiguration[], ProcessError> {
    return okAsync([]);
    }

    getLogicalUnitNumbersOfInitiatorGroup(
    initiatorGroup: Pick<InitiatorGroup, "devicePath">
    ): ResultAsync<LogicalUnitNumber[], ProcessError> {
    return okAsync([]);
    }

    getInitiatorsOfInitiatorGroup(
    initiatorGroup: Pick<InitiatorGroup, "name" | "devicePath">
    ): ResultAsync<Initiator[], ProcessError> {
    return okAsync([]);
    }

    getSessionsOfTarget(target: Target): ResultAsync<Session[], ProcessError> {
        return this.singleServerDriver!.getSessionsOfTarget(target);
    }

    getConnectionsOfSession(session: Session): ResultAsync<Connection[], ProcessError> {
        return this.singleServerDriver!.getConnectionsOfSession(session);
    }

    findTargetPCSResource(target: Target) {
        const self = this;

        return this.pcsResourceManager.fetchResources()
        .andThen((resources) => new ResultAsync(safeTry(async function * () {
            for (var resource of resources) {
            const foundResource = yield * self.pcsResourceManager.fetchResourceConfig(resource)
            .map((config) => config.instance_attributes![0]!.nvpairs.find((pair) => pair.name === "iqn" && pair.value === target.name))
            .safeUnwrap();

            if (foundResource != undefined)
                return ok<PCSResource>(resource);
            }

            return ok(undefined);
        }))
        )
    }

    findPortblockPCSResource(target: Target, portal: Portal, type: PCSResourceType.PORTBLOCK_ON | PCSResourceType.PORTBLOCK_OFF) {
        const self = this;

        const actionFromType = type === PCSResourceType.PORTBLOCK_ON ? "block" : "unblock";

        return this.findTargetPCSResource(target)
        .andThen((targetResource) => new ResultAsync(safeTry(async function * () {
            if (targetResource?.resourceGroup != undefined) {
                for (var groupResourceName of targetResource.resourceGroup.includedResourceNames) {
                    const foundResource = yield * self.pcsResourceManager.fetchResourceConfig({name: groupResourceName})
                    .map((config) => {
                        if (config.agent_name!.type === PCSResourceTypeInfo[type].internalTypeName) {
                            let foundAction = false;
                            let foundIP = false;

                            for (var pair of config.instance_attributes![0]!.nvpairs) {
                                if (pair.name === "action")
                                    foundAction = pair.value === actionFromType;
                                else if (pair.name === "ip")
                                    foundIP = pair.value === portal.address;

                                if (foundAction && foundIP) {
                                    return true;
                                }
                            }
                        }

                        return false;
                    }).safeUnwrap();

                    if (foundResource) {
                        const resource = yield * self.pcsResourceManager.fetchResourceByName(groupResourceName).safeUnwrap();
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
        .andThen((targetResource) => new ResultAsync(safeTry(async function * () {
            if (targetResource?.resourceGroup != undefined) {
                for (var groupResourceName of targetResource.resourceGroup.includedResourceNames) {
                    const foundResource = yield * self.pcsResourceManager.fetchResourceConfig({name: groupResourceName})
                    .map((config) => {
                        if (config.agent_name!.type === PCSResourceTypeInfo[PCSResourceType.VIP].internalTypeName) {
                            for (var pair of config.instance_attributes![0]!.nvpairs) {
                                if (pair.name === "ip" && pair.value === portal.address)
                                    return true;
                            }
                        }

                        return false;
                    }).safeUnwrap();

                    if (foundResource) {
                        const resource = yield * self.pcsResourceManager.fetchResourceByName(groupResourceName).safeUnwrap();
                        return ok<PCSResource>(resource!);
                    }
                }
            }

            return ok(undefined);
        })))
    }

    createAndConfigureRBDResource(rbd: RadosBlockDevice, group: PCSResourceGroup) {
        return this.pcsResourceManager.createResource(`rbd_${rbd.deviceName}`, `ocf:ceph:rbd name=${rbd.deviceName} pool=${rbd.parentPool} user=admin cephconf=/etc/ceph/ceph.conf op start timeout=60s interval=0 op stop timeout=60s interval=0 op monitor timeout=30s interval=15s`, PCSResourceType.RBD)
        .andThen((resource) => this.pcsResourceManager.constrainResourceToGroup(resource, group)
            .andThen(() => this.pcsResourceManager.orderResourceBeforeGroup(resource, group))
            .map(() => resource));
        
    }

    createAndConfigureLVResources(lv: LogicalVolume, group: PCSResourceGroup) {
        return ResultAsync.combine(lv.volumeGroup.volumes.map((physicalVolume) => this.pcsResourceManager.createResource(`rbd_${physicalVolume.rbd.deviceName}`, `ocf:ceph:rbd name=${physicalVolume.rbd.deviceName} pool=${physicalVolume.rbd.parentPool} user=admin cephconf=/etc/ceph/ceph.conf op start timeout=60s interval=0 op stop timeout=60s interval=0 op monitor timeout=30s interval=15s`, PCSResourceType.RBD)
            .andThen((resource) => this.pcsResourceManager.constrainResourceToGroup(resource, group)
                .andThen(() => this.pcsResourceManager.orderResourceBeforeGroup(resource, group))
            )
        ))
        .andThen(() => this.pcsResourceManager.createResource(`${this.resourceNamePrefix}_lvm_${lv.deviceName}_${lv.volumeGroup}`, `ocf:heartbeat:LVM-activate lvname=${lv.deviceName} vgname=${lv.volumeGroup.name} activation_mode=exclusive vg_access_mode=system_id op start timeout=30 op stop timeout=30 op monitor interval=10 timeout=60`, PCSResourceType.LVM))
    }
}
