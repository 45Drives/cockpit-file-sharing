import type { RadosBlockDevice } from './RadosBlockDevice';

export class PhysicalVolume {
    rbd: RadosBlockDevice;

    constructor(rbd: RadosBlockDevice) {
        this.rbd = rbd;
    }
}