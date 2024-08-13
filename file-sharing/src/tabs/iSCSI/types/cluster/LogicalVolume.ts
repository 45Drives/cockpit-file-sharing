import type { RadosBlockDevice } from '@/tabs/iSCSI/types/cluster/RadosBlockDevice';
import type { VolumeGroup } from './VolumeGroup';
import { DeviceType, VirtualDevice } from '@/tabs/iSCSI/types/VirtualDevice';

export class LogicalVolume extends VirtualDevice{
    volumeGroup: VolumeGroup;
    rbds: RadosBlockDevice[];
    maximumSize: string;

    constructor(deviceName: string, blockSize: number, volumeGroup: VolumeGroup, rbds: RadosBlockDevice[], maximumSize: string) {
        super(deviceName, `/dev/${volumeGroup.name}/${deviceName}`, blockSize, DeviceType.BlockIO);

        this.volumeGroup = volumeGroup;
        this.rbds = rbds;
        this.maximumSize = maximumSize;
    }
}