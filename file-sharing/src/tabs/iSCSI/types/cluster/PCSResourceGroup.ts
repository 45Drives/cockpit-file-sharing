import type { PCSResource } from "@/tabs/iSCSI/types/cluster/PCSResource";

export class PCSResourceGroup {
    name: string;
    includedResourceNames: string[]

    constructor(name: string, resourceNames: string[]) {
        this.name = name;
        this.includedResourceNames = resourceNames;
    }
}