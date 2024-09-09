import { VirtualDevice } from './../VirtualDevice';
import { VolumeGroup } from './VolumeGroup';
import { PhysicalVolume } from './PhysicalVolume';
import { LogicalVolume } from '@/tabs/iSCSI/types/cluster/LogicalVolume';
import { RadosBlockDevice } from './RadosBlockDevice';
import { Pool, PoolType } from "@/tabs/iSCSI/types/cluster/Pool";
import { BashCommand, ProcessError, safeJsonParse, StringToIntCaster, type Server } from '@45drives/houston-common-lib';
import { err, errAsync, ok, okAsync, ResultAsync, safeTry } from 'neverthrow';

export class RBDManager {

    server: Server;

    constructor(server: Server) {
        this.server = server;
    }

    createRadosBlockDevice(name: string, size: number, parentPool: Pool, dataPool?: Pool) {
        const dataPoolArgument =  dataPool === undefined ? "" :  `--data-pool ${dataPool.name}`

        return this.server.execute(new BashCommand(`rbd create ${parentPool.name}/${name} --size ${size}B ${dataPoolArgument}`))
        .andThen(() => 
            this.server.execute(new BashCommand(`rbd map ${parentPool.name}/${name}`))
            .andThen((mapProc) => this.server.execute(new BashCommand(`blockdev --getbsz ${mapProc.getStdout()}`))
                .andThen((blockSizeProc) => {
                    const blockSize = StringToIntCaster()(blockSizeProc.getStdout())

                    if (!blockSize.isNone())
                        return okAsync(new RadosBlockDevice(name, mapProc.getStdout().trim(), blockSize.some(), size, parentPool, dataPool));

                    return errAsync(new ProcessError("Unable to determine block size of RBD"));
                })
            )
        )
    }

    createLogicalVolumeFromRadosBlockDevices(logicalVolumeName: string, volumeGroupName: string, rbds: RadosBlockDevice[]) {
        const rbdPaths = rbds.map((rbd) => rbd.filePath).join(' ');
        let createdLogicalVolume: LogicalVolume | null = null;

        return ResultAsync.combine(rbds.map((rbd) => this.server.execute(new BashCommand(`pvcreate ${rbd.filePath}`)).map(() => new PhysicalVolume(rbd))))
        .andThen((physicalVolumes) => this.server.execute(new BashCommand(`vgcreate ${volumeGroupName} ${rbdPaths}`)).map(() => new VolumeGroup(volumeGroupName, physicalVolumes)))
        .andThen((volumeGroup) => this.server.execute(new BashCommand(`lvcreate -i ${rbds.length} -I 64 -l 100%FREE -n ${logicalVolumeName} ${volumeGroupName} ${rbdPaths}`))
            .andThen(() => this.server.execute(new BashCommand(`lvdisplay /dev/${volumeGroupName}/${logicalVolumeName} --units B | grep 'LV Size' | awk '{print $3, $4}'`))
                .map((proc) => proc.getStdout())
                .map((maximumSize) => {
                    createdLogicalVolume = new LogicalVolume(logicalVolumeName, 0, volumeGroup, StringToIntCaster()(maximumSize!).some())
                })
            )
        )
        .map(() => createdLogicalVolume!);
    }

    expandRadosBlockDevice(device: RadosBlockDevice, newSizeBytes: number) {
        return this.server.execute(new BashCommand(`rbd resize --size ${newSizeBytes}B ${device.deviceName}`));
    }

    expandLogicalVolume(volume: LogicalVolume, newSizeBytes: number) {
        const newSizePerRBD = Math.round(newSizeBytes/volume.volumeGroup.volumes.length);

        return ResultAsync.combine(volume.volumeGroup.volumes.map((volume) => 
            this.expandRadosBlockDevice(volume.rbd, newSizePerRBD)
            .andThen(() => this.server.execute(new BashCommand(`pvresize ${volume.rbd.filePath}`)))
        ))
        .andThen(() => this.server.execute(new BashCommand(`lvextend -l +100%FREE ${volume.filePath}`)));
    }

    fetchAvaliablePools() {
        return this.server.execute(new BashCommand(`ceph osd pool ls detail --format json`))
            .map((proc) => proc.getStdout())
            .andThen(safeJsonParse<PoolInfoJson>)
            .map((allPoolInfo) => allPoolInfo.filter((poolInfo) => poolInfo !== undefined))
            .andThen((filteredPoolInfo) => ResultAsync.combine(
                filteredPoolInfo.map((poolData) => {
                    let poolType = undefined;

                    switch (poolData?.type) {
                        case 1:
                            poolType = PoolType.Replication;
                            break;
                        case 3:
                            poolType = PoolType.ErasureCoded;
                            break;
                    }

                    if (poolType !== undefined && poolData!.pool_name !== undefined) {
                        return okAsync(new Pool(poolData!.pool_name, poolType));
                    }

                    return okAsync(undefined);
                })
            ))
            .map((results) => results.filter((result): result is Pool => result !== undefined));
    }

    fetchAvaliableRadosBlockDevices() {
        const self = this;
        return this.server.execute(new BashCommand(`rbd showmapped --format json`))
        .map((proc) => proc.getStdout())
        .andThen(safeJsonParse<MappedRBDJson>)
        .mapErr((err) => new ProcessError(`Unable to get current mapped Rados Block Devices: ${err}`))
        .andThen((rbdEntry) => ResultAsync.combine(
            rbdEntry.filter((entry) => entry !== undefined)
            .map((entry) => {
                return new ResultAsync(safeTry(async function * () {
                    const blockSize = yield * self.getBlockSizeFromDevicePath(entry!.device).safeUnwrap();

                    const maximumSize = yield * self.getMaximumSizeFromRBDName(entry!.name).safeUnwrap();

                    const parentPool = yield * self.fetchAvaliablePools()
                                                .map((pools) => pools.filter((pool) => pool!.name === entry!.pool)[0])
                                                .safeUnwrap();

                    if (parentPool !== undefined) {
                        if (parentPool.poolType === PoolType.Replication) {
                            return ok<RadosBlockDevice>(new RadosBlockDevice(entry!.name, entry!.device, blockSize, maximumSize, parentPool));
                        }
                        else if (parentPool.poolType === PoolType.ErasureCoded) {
                            const dataPool = yield * self.getDataPoolForRBDName(entry!.name, parentPool).safeUnwrap();

                            if (dataPool !== undefined)
                                return ok<RadosBlockDevice>(new RadosBlockDevice(entry!.name, entry!.device, blockSize, maximumSize, parentPool, dataPool));
                        }
                    }

                    return err(new ProcessError("Unable to get Block Device information."))
                }))
            })
        ))
    }

    fetchAvaliableLogicalVolumes() {
        const self = this;

        return this.server.execute(new BashCommand(`lvs --reportformat json --units B`))
        .map((proc) => proc.getStdout())
        .andThen(safeJsonParse<LogicalVolumeInfoJson>)
        .map((logicalVolumeInfo) => logicalVolumeInfo?.report?.flatMap((report) => report.lv))
        .andThen((lvList) => ResultAsync.combine(lvList!.flatMap((lvInfo) => 
            this.server.execute(new BashCommand(`pvs -S vgname=${lvInfo.vg_name} --reportformat json --units B`))
                .map((proc) => proc.getStdout())
                .andThen(safeJsonParse<VolumeGroupInfoJson>)
                .map((volumeGroupEntries) => volumeGroupEntries!.report!.flatMap((report) => report.pv))
                .andThen((pvList) => new ResultAsync(safeTry(async function * () {
                    const mappedBlockDevices = yield * self.fetchAvaliableRadosBlockDevices().safeUnwrap();

                    const physicalVolumes = pvList.flatMap((rbdItem) => mappedBlockDevices.find((rbd) => rbd.filePath === rbdItem.pv_name))
                                        .filter((item) => item !== undefined)
                                        .map((item) => new PhysicalVolume(item!));

                    return okAsync(physicalVolumes);
                })))
                .map((volumes) => new VolumeGroup(lvInfo.vg_name, volumes))
                .map((volumeGroup) => new LogicalVolume(lvInfo.lv_name, 0, volumeGroup, StringToIntCaster()(lvInfo.lv_size).some())))
        ))
    }

    getBlockSizeFromDevicePath(path: Pick<VirtualDevice, "filePath"> | string) {
        return this.server.execute(new BashCommand(`blockdev --getbsz ${path}`))
                    .map((proc) => StringToIntCaster()(proc.getStdout()))
                    .andThen((maybeNumber) => maybeNumber.isSome() ? okAsync(maybeNumber.some()) : errAsync(new ProcessError(`Unable to determine block size for device: ${path}`)))
    }

    getMaximumSizeFromRBDName(rbdName: Pick<VirtualDevice, "deviceName"> | string) {
        return this.server.execute(new BashCommand(`rbd info ${rbdName} --format json`))
                    .map((proc) => proc.getStdout())
                    .andThen(safeJsonParse<RBDInfoJson>)
                    .map((rbdInfoEntry) => StringToIntCaster()(rbdInfoEntry.size!))
                    .map((number) => number.some())
                    .mapErr(() => new ProcessError(`Unable to determine maximum size of RBD: ${rbdName}`))
    }

    getDataPoolForRBDName(rbdName: Pick<VirtualDevice, "deviceName"> | string, parentPool: Pool) {
        return this.server.execute(new BashCommand(`rbd info ${parentPool.name}/${rbdName}`))
                    .map((proc) => proc.getStdout())
                    .andThen(safeJsonParse<RBDInfoJson>)
                    .map((rbdInfoEntry) => {
                        if (rbdInfoEntry.data_pool !== undefined) {
                            return new Pool(rbdInfoEntry.data_pool, PoolType.ErasureCoded)
                        }

                        return undefined
                    })
    }
}

type MappedRBDJson = {
    id: string,
    pool: string,
    namespace: string,
    name: string,
    snap: string,
    device: string,
}[]

type RBDInfoJson = {
    name: string,
    size: string,
    data_pool: string,
}

type PoolInfoJson = {
    pool_name: string,
    type: number,
}[]

type LogicalVolumeInfoJson = {
    report: {
        lv: {
            lv_name: string,
            vg_name: string,
            lv_size: string,
        }[]
    }[]
}

type VolumeGroupInfoJson = {
    report: {
        pv: {
            pv_name: string,
            vg_name: string,
        }[]
    }[]
}