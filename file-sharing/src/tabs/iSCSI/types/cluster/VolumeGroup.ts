import type { PhysicalVolume } from "@/tabs/iSCSI/types/cluster/PhysicalVolume";

export class VolumeGroup {
    name: string;
    volumes: PhysicalVolume[];

    constructor(name: string, volumes: PhysicalVolume[]) {
        this.name = name;
        this.volumes = volumes;
    }
}