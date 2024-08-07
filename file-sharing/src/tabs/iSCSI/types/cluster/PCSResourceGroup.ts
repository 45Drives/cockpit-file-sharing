import type { PCSResource } from "@/tabs/iSCSI/types/cluster/PCSResource";

export class PCSResourceGroup {
    name: string;

    constructor(name: string) {
        this.name = name;
    }
}