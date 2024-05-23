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
    abstract addVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<ExitedProcess, ProcessError> ;
    abstract removeVirtualDevice(virtualDevice: VirtualDevice): ResultAsync<ExitedProcess, ProcessError>;

    abstract createTarget(targetName: string): void;
    abstract removeTarget(targetName: string): void;

    abstract addPortalToTarget(target: Target, portal: Portal): void;
    abstract deletePortalFromTarget(target: Target, portal: Portal): void;

    abstract addInitiatorGroupToTarget(target: Target, initiatorGroup: InitiatorGroup): void;
    abstract deleteInitiatorGroupFromTarget(target: Target, initiatorGroup: InitiatorGroup): void;

    abstract addInitiatorToGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): void;
    abstract removeInitiatorFromGroup(initiatorGroup: InitiatorGroup, initiator: Initiator): void;

    abstract addLogicalUnitNumberToGroup(logicalUnitNumber: LogicalUnitNumber, initiatorGroup: InitiatorGroup): void;
    abstract removeLogicalUnitNumberFromGroup(logicalUnitNumber: LogicalUnitNumber, initiatorGroup: InitiatorGroup): void;

    abstract addCHAPConfigurationToTarget(chapConfiguration: CHAPConfiguration, target: Target): void;
    abstract removeCHAPConfigurationToTarget(chapConfiguration: CHAPConfiguration, target: Target): void;

    abstract getVirtualDevices(): ResultAsync<VirtualDevice[], ProcessError>;
    abstract getTargets(): Target[];

    abstract getPortalsOfTarget(target: Target): Portal[];
    abstract getInitatorGroupsOfTarget(target: Target): InitiatorGroup[];
    abstract getSessionsOfTarget(target: Target): Session[];
    abstract getCHAPConfigurationsOfTarget(target: Target): CHAPConfiguration[];

    abstract getConnectionsOfSession(session: Session): Connection[];

    abstract getLogicalUnitNumbersOfInitiatorGroup(initiatorGroup: InitiatorGroup): LogicalUnitNumber[];

    abstract getInitiatorsOfInitiatorGroup(initiatorGroup: InitiatorGroup): InitiatorGroup[];
}