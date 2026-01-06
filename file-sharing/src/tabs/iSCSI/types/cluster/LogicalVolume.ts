import type { RadosBlockDevice } from '@/tabs/iSCSI/types/cluster/RadosBlockDevice';
import type { VolumeGroup } from './VolumeGroup';
import { DeviceType, VirtualDevice } from '@/tabs/iSCSI/types/VirtualDevice';
import type { Server } from '@45drives/houston-common-lib';

export class LogicalVolume extends VirtualDevice{
    volumeGroup: VolumeGroup;
    server:Server;

    constructor(deviceName: string, blockSize: number, volumeGroup: VolumeGroup, maximumSize: number,server: Server) {
        super(deviceName, `/dev/${volumeGroup.name}/${deviceName}`, blockSize, DeviceType.BlockIO,maximumSize, false, undefined, server);

        this.volumeGroup = volumeGroup;
        this.maximumSize = maximumSize;
        this.server = server;
    }
}