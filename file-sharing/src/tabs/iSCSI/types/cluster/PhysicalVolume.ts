import type { RadosBlockDevice } from './RadosBlockDevice';

export class PhysicalVolume {
    filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }
}