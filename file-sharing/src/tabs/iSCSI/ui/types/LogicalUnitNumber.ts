import { None } from 'monet';
import type { VirtualDevice } from "./VirtualDevice";

export interface LogicalUnitNumber {
    name: string;
    unitNumber: string;
    blockDevice?: VirtualDevice | undefined;
}

export namespace LogicalUnitNumber {
    export function empty() : LogicalUnitNumber {
        return {
            name: "",
            unitNumber: "",
            blockDevice: undefined,
        }
    }
}