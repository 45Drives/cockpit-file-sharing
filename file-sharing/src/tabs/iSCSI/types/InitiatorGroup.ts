import type { Initiator } from "./Initiator";
import type { LogicalUnitNumber } from "./LogicalUnitNumber";

export interface InitiatorGroup {
    name: string;
    logicalUnitNumbers: LogicalUnitNumber[];
    initiators: Initiator[];

    devicePath: string;
}

export namespace InitiatorGroup {
    export function empty() : InitiatorGroup {
        return {
            name: "",
            devicePath: "",
            logicalUnitNumbers: [],
            initiators: [],
        }
    }
}