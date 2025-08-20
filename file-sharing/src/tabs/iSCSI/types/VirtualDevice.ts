import type { Server } from "@45drives/houston-common-lib";

export class VirtualDevice {
    deviceName: string;
    filePath: string;
    blockSize: number;
    deviceType: DeviceType;
    assigned?: boolean;
    vgName?: string;
    server?: Server;
    constructor(deviceName: string, filePath: string, blockSize: number, deviceType: DeviceType, assigned?: boolean,    vgName?: string,server?:Server) {
        this.deviceName = deviceName;
        this.filePath = filePath;
        this.blockSize = blockSize;
        this.deviceType = deviceType;
        this.assigned = assigned;
        this.vgName = vgName;
        this.server = server;;
    }
}

export enum DeviceType {
    FileIO = "FileIO",
    BlockIO = "BlockIO"
}