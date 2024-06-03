import type { ResultAsync } from "neverthrow";
import type { VirtualDevice } from "./VirtualDevice";
import type { CHAPConfiguration } from "./CHAPConfiguration";
import type { Connection } from "./Connection";
import type { Initiator } from "./Initiator";
import type { InitiatorGroup } from "./InitiatorGroup";
import type { LogicalUnitNumber } from "./LogicalUnitNumber";
import type { Portal } from "./Portal";
import type { Session } from "./Session";
import type { Target } from "./Target";
import type { ExitedProcess, ProcessError } from "@45drives/houston-common-lib";

export abstract class ISCSIDriver {
    abstract addVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<ExitedProcess, ProcessError>;
    abstract removeVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<ExitedProcess, ProcessError>;

    abstract createTarget(target: Target): ResultAsync<ExitedProcess, ProcessError>;
    abstract removeTarget(target: Target): ResultAsync<ExitedProcess, ProcessError>;

    abstract addPortalToTarget(target: Target, portal: Portal): ResultAsync<ExitedProcess, ProcessError>;
    abstract deletePortalFromTarget(target: Target, portal: Portal): ResultAsync<ExitedProcess, ProcessError>;

    abstract addInitiatorGroupToTarget(target: Target, initiatorGroup: InitiatorGroup): ResultAsync<ExitedProcess, ProcessError>;
    abstract deleteInitiatorGroupFromTarget(initiatorGroup: InitiatorGroup): ResultAsync<ExitedProcess, ProcessError>;

    abstract addInitiatorToGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): ResultAsync<ExitedProcess, ProcessError>;
    abstract removeInitiatorFromGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): ResultAsync<ExitedProcess, ProcessError>;

    abstract addLogicalUnitNumberToGroup(logicalUnitNumber: LogicalUnitNumber, initiatorGroup: InitiatorGroup): ResultAsync<ExitedProcess, ProcessError>;
    abstract removeLogicalUnitNumberFromGroup(logicalUnitNumber: LogicalUnitNumber, initiatorGroup: InitiatorGroup): ResultAsync<ExitedProcess, ProcessError>;

    abstract addCHAPConfigurationToTarget(target: Target, chapConfiguration: CHAPConfiguration): ResultAsync<ExitedProcess, ProcessError>;
    abstract removeCHAPConfigurationFromTarget(target: Target, chapConfiguration: CHAPConfiguration): ResultAsync<ExitedProcess, ProcessError>;

    abstract getVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError>;
    abstract getTargets(): ResultAsync<Target[], ProcessError>;

    abstract getPortalsOfTarget(target: Target): ResultAsync<Portal[], ProcessError>;
    abstract getInitatorGroupsOfTarget(target: Target): ResultAsync<InitiatorGroup[], ProcessError>;
    abstract getSessionsOfTarget(target: Target): ResultAsync<Session[], ProcessError>;
    abstract getCHAPConfigurationsOfTarget(target: Target): ResultAsync<CHAPConfiguration[], ProcessError>;

    abstract getConnectionsOfSession(session: Session): ResultAsync<Connection[], ProcessError>;

    abstract getLogicalUnitNumbersOfInitiatorGroup(initiatorGroup: InitiatorGroup): ResultAsync<LogicalUnitNumber[], ProcessError>;
    abstract getInitiatorsOfInitiatorGroup(initiatorGroup: InitiatorGroup): ResultAsync<Initiator[], ProcessError>;
}