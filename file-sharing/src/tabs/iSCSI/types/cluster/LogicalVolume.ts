import type { RadosBlockDevice } from '@/tabs/iSCSI/types/cluster/RadosBlockDevice';
import type { VolumeGroup } from './VolumeGroup';

export interface LogicalVolume {
    volumeGroup: VolumeGroup;
    rbds: RadosBlockDevice[];
    maximumSize: string;
}