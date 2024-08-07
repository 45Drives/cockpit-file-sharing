import type { PhysicalVolume } from "@/tabs/iSCSI/types/cluster/PhysicalVolume";

export interface VolumeGroup {
    name: string;
    volumes: PhysicalVolume[];
}