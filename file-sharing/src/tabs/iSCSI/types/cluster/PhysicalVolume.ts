import type { RadosBlockDevice } from './RadosBlockDevice';

export interface PhysicalVolume {
    rbd: RadosBlockDevice;
}