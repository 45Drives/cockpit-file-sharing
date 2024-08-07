import type { LogicalVolume } from '@/tabs/iSCSI/types/cluster/LogicalVolume';
import { RadosBlockDevice } from './RadosBlockDevice';
import { type Pool } from "@/tabs/iSCSI/types/cluster/Pool";
import { BashCommand, ProcessError, StringToIntCaster, type Server } from '@45drives/houston-common-lib';
import { DeviceType } from '@/tabs/iSCSI/types/VirtualDevice';
import { err, errAsync, ok, okAsync } from 'neverthrow';

export class RBDManager {

    server: Server;

    constructor(server: Server) {
        this.server = server;
    }

    createReplicationRadosBlockDevice(name: string, size: string, pool: Pool) {
        return this.server.execute(new BashCommand(`rbd create ${pool.name}/${name} --size ${size}`))
        .andThen(() => 
            this.server.execute(new BashCommand(`rbd map ${pool.name}/${name}`))
            .andThen((mapProc) => this.server.execute(new BashCommand(`blockdev --getbsz ${mapProc.getStdout()}`))
                .andThen((blockSizeProc) => {
                    const blockSize = StringToIntCaster()(blockSizeProc.getStdout())

                    if (!blockSize.isNone())
                        return okAsync(new RadosBlockDevice(name, mapProc.getStdout(), blockSize.some(), DeviceType.BlockIO, size, pool));

                    return errAsync(new ProcessError("Unable to determine block size of RBD"));
                })
            )
        )
    }

    createErasureCodedRadosBlockDevice(name: string, size: string, dataPool: Pool, parentPool: Pool) {
        return this.server.execute(new BashCommand(`rbd create ${parentPool.name}/${name} --size ${size} --data-pool ${dataPool.name}`))
        .andThen(() => 
            this.server.execute(new BashCommand(`rbd map ${parentPool.name}/${name}`))
            .andThen((mapProc) => this.server.execute(new BashCommand(`blockdev --getbsz ${mapProc.getStdout()}`))
                .andThen((blockSizeProc) => {
                    const blockSize = StringToIntCaster()(blockSizeProc.getStdout())

                    if (!blockSize.isNone())
                        return okAsync(new RadosBlockDevice(name, mapProc.getStdout(), blockSize.some(), DeviceType.BlockIO, size, parentPool, dataPool));

                    return errAsync(new ProcessError("Unable to determine block size of RBD"));
                })
            )
        )
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