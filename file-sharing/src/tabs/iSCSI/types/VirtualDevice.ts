export class VirtualDevice {
    deviceName: string;
    filePath: string;
    blockSize: number;
    deviceType: DeviceType;

    constructor(deviceName: string, filePath: string, blockSize: number, deviceType: DeviceType) {
        this.deviceName = deviceName;
        this.filePath = filePath;
        this.blockSize = blockSize;
        this.deviceType = deviceType;
    }
}

export enum DeviceType {
    FileIO = "FileIO",
    BlockIO = "BlockIO"
}