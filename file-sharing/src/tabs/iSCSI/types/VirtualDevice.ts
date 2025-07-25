export class VirtualDevice {
    deviceName: string;
    filePath: string;
    blockSize: number;
    deviceType: DeviceType;
    assigned?: boolean;
    vgName?: string;
    constructor(deviceName: string, filePath: string, blockSize: number, deviceType: DeviceType, assigned?: boolean,    vgName?: string) {
        this.deviceName = deviceName;
        this.filePath = filePath;
        this.blockSize = blockSize;
        this.deviceType = deviceType;
        this.assigned = assigned;
        this.vgName = vgName;
    }
}

export enum DeviceType {
    FileIO = "FileIO",
    BlockIO = "BlockIO"
}