import type { Pool } from "@/tabs/iSCSI/types/cluster/Pool";
import { DeviceType, VirtualDevice } from "@/tabs/iSCSI/types/VirtualDevice";

export class RadosBlockDevice extends VirtualDevice {
    parentPool: Pool;
    dataPool: Pool | undefined;
    maximumSize: number;

    constructor(deviceName: string, filePath: string, blockSize: number, maximumSize: number, parentPool: Pool, dataPool?: Pool) {
        super(deviceName, filePath, blockSize, DeviceType.BlockIO);

        this.parentPool = parentPool;
        this.dataPool = dataPool;
        this.maximumSize = maximumSize;
    }
}
