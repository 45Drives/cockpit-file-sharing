export class VirtualDevice {
    deviceName: string;
    filePath: string;
    blockSize: number;
    deviceType: DeviceType;
    assigned?: boolean;

    constructor(deviceName: string, filePath: string, blockSize: number, deviceType: DeviceType, assigned?: boolean) {
        this.deviceName = deviceName;
        this.filePath = filePath;
        this.blockSize = blockSize;
        this.deviceType = deviceType;
        this.assigned = assigned;
    }
}

export enum DeviceType {
    FileIO = "FileIO",
    BlockIO = "BlockIO"
}