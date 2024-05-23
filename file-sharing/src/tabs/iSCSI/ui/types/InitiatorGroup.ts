import type { Initiator } from "./Initiator";
import type { LogicalUnitNumber } from "./LogicalUnitNumber";

export class InitiatorGroup {
    name: string;
    logicalUnitNumbers: LogicalUnitNumber[];
    initiators: Initiator[];

    constructor(name: string, logicalUnitNumbers: LogicalUnitNumber[], initiators: Initiator[]) {
        this.name = name;
        this.logicalUnitNumbers = logicalUnitNumbers;
        this.initiators = initiators;
    }
}