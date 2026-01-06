import type { PhysicalVolume } from "@/tabs/iSCSI/types/cluster/PhysicalVolume";
import type { Server } from "@45drives/houston-common-lib";

export class VolumeGroup {
    name: string;
    volumes: PhysicalVolume[];
    server: Server
    constructor(name: string, volumes: PhysicalVolume[],server: Server) {
        this.name = name;
        this.volumes = volumes;
        this.server = server;
    }
}