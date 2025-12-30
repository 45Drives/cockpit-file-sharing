import type { ResultAsync } from "neverthrow";
import type { DeviceType, VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import type { CHAPConfiguration } from "@/tabs/iSCSI/types/CHAPConfiguration";
import type { Connection } from "@/tabs/iSCSI/types/Connection";
import type { Initiator } from "@/tabs/iSCSI/types/Initiator";
import type { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import type { LogicalUnitNumber } from "@/tabs/iSCSI/types/LogicalUnitNumber";
import type { Portal } from "@/tabs/iSCSI/types/Portal";
import type { Session } from "@/tabs/iSCSI/types/Session";
import type { Target } from "@/tabs/iSCSI/types/Target";
import type { ProcessError, Server } from "@45drives/houston-common-lib";

export abstract class ISCSIDriver {
    abstract initialize(): ResultAsync<ISCSIDriver, ProcessError>;

    abstract getHandledDeviceTypes(): DeviceType[];

    abstract addVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError>;
    abstract removeVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<void, ProcessError>;

    abstract createTarget(target: Target): ResultAsync<void, ProcessError>;
    abstract removeTarget(target: Target): ResultAsync<void, ProcessError>;

    abstract addPortalToTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError>;
    abstract deletePortalFromTarget(target: Target, portal: Portal): ResultAsync<void, ProcessError>;

    abstract addInitiatorGroupToTarget(target: Target, initiatorGroup: InitiatorGroup): ResultAsync<void, ProcessError>;
    abstract deleteInitiatorGroupFromTarget(target: Target, initiatorGroup: InitiatorGroup): ResultAsync<void, ProcessError>;

    abstract addInitiatorToGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): ResultAsync<void, ProcessError>;
    abstract removeInitiatorFromGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): ResultAsync<void, ProcessError>;

    abstract addLogicalUnitNumberToGroup(
        initiatorGroup: InitiatorGroup,
        logicalUnitNumber: LogicalUnitNumber
      ): ResultAsync<void | Server , ProcessError>;
      
    abstract removeLogicalUnitNumberFromGroup(initiatorGroup: InitiatorGroup, logicalUnitNumber: LogicalUnitNumber): ResultAsync<void, ProcessError>;

    abstract addCHAPConfigurationToTarget(target: Target, chapConfiguration: CHAPConfiguration): ResultAsync<void, ProcessError>;
    abstract removeCHAPConfigurationFromTarget(target: Target, chapConfiguration: CHAPConfiguration): ResultAsync<void, ProcessError>;

    abstract getVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError>;
    abstract getTargets(): ResultAsync<Target[], ProcessError>;

    abstract getPortalsOfTarget(target: Target): ResultAsync<Portal[], ProcessError>;
    abstract getInitatorGroupsOfTarget(target: Target): ResultAsync<InitiatorGroup[], ProcessError>;
    abstract getSessionsOfTarget(target: Target): ResultAsync<Session[], ProcessError>;
    abstract getCHAPConfigurationsOfTarget(target: Target): ResultAsync<CHAPConfiguration[], ProcessError>;

    abstract getConnectionsOfSession(session: Session): ResultAsync<Connection[], ProcessError>;

    abstract getLogicalUnitNumbersOfInitiatorGroup(initiatorGroup: InitiatorGroup): ResultAsync<LogicalUnitNumber[], ProcessError>;
    abstract getInitiatorsOfInitiatorGroup(initiatorGroup: InitiatorGroup): ResultAsync<Initiator[], ProcessError>;
    abstract getnode(): ResultAsync<Server | undefined, ProcessError>;
}