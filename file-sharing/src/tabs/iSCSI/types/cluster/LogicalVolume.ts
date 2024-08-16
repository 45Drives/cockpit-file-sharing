import type { RadosBlockDevice } from '@/tabs/iSCSI/types/cluster/RadosBlockDevice';
import type { VolumeGroup } from './VolumeGroup';
import { DeviceType, VirtualDevice } from '@/tabs/iSCSI/types/VirtualDevice';

export class LogicalVolume extends VirtualDevice{
    volumeGroup: VolumeGroup;
    maximumSize: string;

    constructor(deviceName: string, blockSize: number, volumeGroup: VolumeGroup, maximumSize: string) {
        super(deviceName, `/dev/${volumeGroup.name}/${deviceName}`, blockSize, DeviceType.BlockIO);

        this.volumeGroup = volumeGroup;
        this.maximumSize = maximumSize;
    }
}