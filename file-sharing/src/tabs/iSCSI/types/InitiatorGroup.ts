import type { Initiator } from "./Initiator";
import type { LogicalUnitNumber } from "./LogicalUnitNumber";

export class InitiatorGroup {
    name: string;
    logicalUnitNumbers: LogicalUnitNumber[];
    initiators: Initiator[];

    devicePath: string;

    constructor(name: string, logicalUnitNumber: LogicalUnitNumber[], initiators: Initiator[], devicePath: string) {
        this.name = name;
        this.logicalUnitNumbers = logicalUnitNumber;
        this.initiators = initiators;
        this.devicePath = devicePath;

    }
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