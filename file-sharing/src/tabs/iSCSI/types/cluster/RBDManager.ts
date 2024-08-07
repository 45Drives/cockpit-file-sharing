import type { LogicalVolume } from '@/tabs/iSCSI/types/cluster/LogicalVolume';
import type { RadosBlockDevice } from './RadosBlockDevice';
import type { Pool } from "@/tabs/iSCSI/types/cluster/Pool";

export class RBDManager {

    createRadosBlockDevice(name: string, size: string, pool: Pool) {

    }

    createLogicalVolumeFromRadosBlockDevices(rbds: RadosBlockDevice[]) {

    }

    expandRadosBlockDevice(device: RadosBlockDevice, newSize: string) {

    }

    expandLogicalVolume(volume: LogicalVolume, newSize: string) {

    }

    fetchAvaliablePools() {

    }

    fetchAvaliableRadosBlockDevices() {

    }

    fetchAvaliableLogicalVolumes() {
        
    }
}