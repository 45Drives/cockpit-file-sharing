import type { Pool } from "@/tabs/iSCSI/types/cluster/Pool";
import { DeviceType, VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";
import type { Server } from '@45drives/houston-common-lib';

export class RadosBlockDevice extends VirtualDevice {
    parentPool: Pool;
    dataPool: Pool | undefined;
    maximumSize: number;
    vgName?: string;
    server: Server | undefined;
    constructor(deviceName: string, filePath: string, blockSize: number, maximumSize: number, parentPool: Pool, dataPool?: Pool,vgName?: string,server:Server) {
        super(deviceName, filePath, blockSize, DeviceType.BlockIO);

        this.parentPool = parentPool;
        this.dataPool = dataPool;
        this.maximumSize = maximumSize;
        this.vgName = vgName;
        this.server = server;
    } 
}
