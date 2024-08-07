import type { Pool } from "@/tabs/iSCSI/types/cluster/Pool";
import { VirtualDevice, type DeviceType } from "@/tabs/iSCSI/types/VirtualDevice";

export class RadosBlockDevice extends VirtualDevice {
    parentPool: Pool;
    dataPool: Pool | undefined;
    maximumSize: String;

    constructor(deviceName: string, filePath: string, blockSize: number, deviceType: DeviceType, maximumSize: String, parentPool: Pool, dataPool?: Pool) {
        super(deviceName, filePath, blockSize, deviceType);

        this.parentPool = parentPool;
        this.dataPool = dataPool;
        this.maximumSize = maximumSize;
    }
}
