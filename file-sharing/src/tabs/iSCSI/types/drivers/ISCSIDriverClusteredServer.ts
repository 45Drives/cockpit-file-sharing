import { ConfigurationManager } from '@/tabs/iSCSI/types/ConfigurationManager';
import { File } from "@45drives/houston-common-lib";
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

export class ISCSIDriverClusteredServer implements ISCSIDriver {

    server: Server;
    activeNode: Server | undefined;
    configurationManager: ConfigurationManager;

    singleServerDriver: ISCSIDriverSingleServer | undefined;
    commandQueue: Command[];
    virtualDevices: VirtualDevice[];
    targets: Target[];

    deviceTypeToHandlerDirectory = {
        [DeviceType.BlockIO]: "/sys/kernel/scst_tgt/handlers/vdisk_blockio"
    };

    targetManagementDirectory = "/sys/kernel/scst_tgt/targets/iscsi";

    constructor(server: Server) {
        this.server = server;
        this.configurationManager = new ConfigurationManager(server);
        this.commandQueue = [];
        this.virtualDevices = [];
        this.targets = [];
    }

    initialize() {
        return this.getActiveNode()
                .map((server) => this.activeNode = server)
                .map((server) => {
                    const singleServerDriver = new ISCSIDriverSingleServer(server)
                    this.singleServerDriver = singleServerDriver;
                    return singleServerDriver
                })
                .andThen((driver) => driver.getVirtualDevices().map((devices) => this.virtualDevices = devices).map(() => driver))
                .andThen((driver) => driver.getTargets().map((targets) => this.targets = targets))
                .map(() => this);
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
                return doc.getElementsByTagName("current_dc")[0]?.attributes.getNamedItem("name")?.value;
            })
            .map((nodeIP) => new Server(nodeIP));
    }

    addLVMResource(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        return okAsync(undefined);
    }

    removeLVMResource(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        return okAsync(undefined);
    }

    addVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        this.virtualDevices.push(virtualDevice);

        return okAsync(undefined);
    }

    removeVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {        
        this.virtualDevices = this.virtualDevices.filter((existingDevice) => existingDevice.deviceName !== virtualDevice.deviceName);

        return okAsync(undefined);
    }

    createTarget(target: Target): ResultAsync<void, ProcessError> {
        this.targets.push(target);

        return okAsync(undefined);
    }

    removeTarget(target: Target): ResultAsync<void, ProcessError> {
        this.targets = this.targets.filter((existingTarget) => existingTarget.name !== target.name);

        return okAsync(undefined);
    }

    addPortalToTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
        target.portals.push(portal);

        return okAsync(undefined);
    }

    deletePortalFromTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
        target.portals = target.portals.filter((existingPortal) => existingPortal !== portal);

        return okAsync(undefined);
    }

    addInitiatorGroupToTarget(target: Target, initiatorGroup: InitiatorGroup): ResultAsync<void, ProcessError> {
        target.initiatorGroups.push(initiatorGroup);

        return okAsync(undefined);
    }

    deleteInitiatorGroupFromTarget(target: Target, initiatorGroup: InitiatorGroup): ResultAsync<void, ProcessError> {
        target.initiatorGroups = target.initiatorGroups.filter((existingGroup) => existingGroup !== initiatorGroup);

        return okAsync(undefined);
    }

    addInitiatorToGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): ResultAsync<void, ProcessError> {
        initiatorGroup.initiators.push(initiator);

        return okAsync(undefined);
    }

    removeInitiatorFromGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): ResultAsync<void, ProcessError> {
        initiatorGroup.initiators = initiatorGroup.initiators.filter((existingInitiator) => existingInitiator !== initiator);

        return okAsync(undefined);
    }

    addLogicalUnitNumberToGroup(initiatorGroup: InitiatorGroup, logicalUnitNumber: LogicalUnitNumber): ResultAsync<void, ProcessError> {
        initiatorGroup.logicalUnitNumbers.push(logicalUnitNumber);

        return okAsync(undefined);
    }

    removeLogicalUnitNumberFromGroup(initiatorGroup: InitiatorGroup, logicalUnitNumber: LogicalUnitNumber): ResultAsync<void, ProcessError> {
        initiatorGroup.logicalUnitNumbers = initiatorGroup.logicalUnitNumbers.filter((existingLogicalUnitNumber) => existingLogicalUnitNumber !== logicalUnitNumber);

        return okAsync(undefined);
    }

    addCHAPConfigurationToTarget(target: Target, chapConfiguration: CHAPConfiguration): ResultAsync<void, ProcessError> {
        target.chapConfigurations.push(chapConfiguration);

        return okAsync(undefined);
    }

    removeCHAPConfigurationFromTarget(target: Target, chapConfiguration: CHAPConfiguration): ResultAsync<void, ProcessError> {
        target.chapConfigurations = target.chapConfigurations.filter((existingCHAP => existingCHAP !== chapConfiguration));

        return okAsync(undefined);
    }

    createLVMResource(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        const vgName = "";
        const lvName = "";

        return this.server.execute(new BashCommand(`pcs resource create $1 ocf:heartbeat:LVM-activate lvname=$2 vgname=$3 activation_mode=exclusive vg_access_mode=system_id op start timeout=30 op stop timeout=30 op monitor interval=10 timeout=60`, 
                    [virtualDevice.deviceName, lvName, vgName]))
                    .andThen(() => okAsync(undefined));
    }

    deleteLVMResource(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError> {
        return this.server.execute(new BashCommand(`pcs resource delete $1`, 
            [virtualDevice.deviceName]))
            .andThen(() => okAsync(undefined));
    }

    createPortalResources(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
        const subnetMask = useUserSettings().value.iscsi.subnetMask.toString();

        return this.server.execute(new BashCommand(`pcs resource create $1 ocf:heartbeat:IPaddr2 ip=$2 cidr_netmask=$3 op start timeout=20 op stop timeout=20 op monitor interval=10`, [`iscsi_${portal.address}_vip`, portal.address, subnetMask]))
                .andThen(() => this.server.execute(new BashCommand(`pcs resource create $1 ocf:heartbeat:portblock ip=$2 portno=3260 protocol=tcp action=block op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`, [`iscsi_${portal.address}_portblock_on`, portal.address])))
                .andThen(() => this.server.execute(new BashCommand(`pcs resource create $1 ocf:heartbeat:portblock ip=$2 portno=3260 protocol=tcp action=unblock op start timeout=20 op stop timeout=20 op monitor timeout=20 interval=20`, [`iscsi_${portal.address}_portblock_off`, portal.address])))
                .andThen(() => okAsync(undefined));
    }

    deletePortalResources(target: Target, portal: Portal): ResultAsync<void, ProcessError> {
        return this.server.execute(new BashCommand(`pcs resource delete $1`, [`iscsi_${portal.address}_vip`, portal.address]))
                .andThen(() => this.server.execute(new BashCommand(`pcs resource delete $1`, [`iscsi_${portal.address}_portblock_on`, portal.address])))
                .andThen(() => this.server.execute(new BashCommand(`pcs resource delete $1`, [`iscsi_${portal.address}_portblock_off`, portal.address])))
                .andThen(() => okAsync(undefined));
    }

    createLogicalUnitNumberResources(initiatorGroup: InitiatorGroup, logicalUnitNumber: LogicalUnitNumber): ResultAsync<void, ProcessError> {
        const targetName = initiatorGroup.devicePath.split('/')[5];

        if (targetName === undefined)
            return errAsync(new ProcessError("Unable to determine target name."));

        return this.server.execute(new BashCommand(`pcs resource create $1 ocf:heartbeat:iSCSILogicalUnit target_iqn=$2 lun=$3 path=$4 op start timeout=100 op stop timeout=100 op monitor interval=10 timeout=100`, 
                    [`iscsilun${logicalUnitNumber.unitNumber}`, targetName, logicalUnitNumber.unitNumber.toString(), logicalUnitNumber.blockDevice!.filePath]))
                .andThen(() => okAsync(undefined));
    }

    deleteLogicalUnitNumberResources(initiatorGroup: InitiatorGroup, logicalUnitNumber: LogicalUnitNumber): ResultAsync<void, ProcessError> {
        return this.server.execute(new BashCommand(`pcs resource delete $1`, [`iscsilun${logicalUnitNumber.unitNumber}`]))
        .andThen(() => okAsync(undefined));
    }

    applyChanges(): ResultAsync<void, ProcessError> {
        return okAsync(undefined);
    }

    getVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError> {
        return okAsync(this.virtualDevices);
    }

    getTargets(): ResultAsync<Target[], ProcessError> {
        return okAsync(this.targets);
    }

    getPortalsOfTarget(target: Target): ResultAsync<Portal[], ProcessError> {
        return okAsync(target.portals);
    }

    getInitatorGroupsOfTarget(target: Target): ResultAsync<InitiatorGroup[], ProcessError> {
        return okAsync(target.initiatorGroups);
    }

    getSessionsOfTarget(target: Target): ResultAsync<Session[], ProcessError> {
        return this.singleServerDriver!.getSessionsOfTarget(target).map((sessions) => target.sessions = sessions);
    }

    getCHAPConfigurationsOfTarget(target: Target): ResultAsync<CHAPConfiguration[], ProcessError> {
        return okAsync(target.chapConfigurations);
    }

    getConnectionsOfSession(session: Session): ResultAsync<Connection[], ProcessError> {
        return this.singleServerDriver!.getConnectionsOfSession(session).map((connections) => session.connections = connections);
    }

    getLogicalUnitNumbersOfInitiatorGroup(initiatorGroup: InitiatorGroup): ResultAsync<LogicalUnitNumber[], ProcessError> {
        return okAsync(initiatorGroup.logicalUnitNumbers);
    }

    getInitiatorsOfInitiatorGroup(initiatorGroup: InitiatorGroup): ResultAsync<Initiator[], ProcessError> {
        return okAsync(initiatorGroup.initiators);
    }
}