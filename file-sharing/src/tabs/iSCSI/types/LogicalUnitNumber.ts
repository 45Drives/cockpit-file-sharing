import type { VirtualDevice } from "./VirtualDevice";

export interface LogicalUnitNumber {
    name: string;
    unitNumber: number;
    blockDevice?: VirtualDevice;
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