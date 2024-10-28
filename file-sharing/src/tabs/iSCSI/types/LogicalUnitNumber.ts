import type { VirtualDevice } from "./VirtualDevice";

export class LogicalUnitNumber {
    name: string;
    unitNumber: number;
    blockDevice?: VirtualDevice;

    constructor(name: string, unitNumber: number, blockDevice?: VirtualDevice) {
        this.name = name;
        this.unitNumber = unitNumber;
        this.blockDevice = blockDevice;
    }
}

export namespace LogicalUnitNumber {
    export function empty() : LogicalUnitNumber {
        return {
            name: "",
            unitNumber: 0,
            blockDevice: undefined,
        }
    }
}