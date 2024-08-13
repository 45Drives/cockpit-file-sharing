import { VirtualDevice } from './../VirtualDevice';
import { VolumeGroup } from './VolumeGroup';
import { PhysicalVolume } from './PhysicalVolume';
import { LogicalVolume } from '@/tabs/iSCSI/types/cluster/LogicalVolume';
import { RadosBlockDevice } from './RadosBlockDevice';
import { Pool, PoolType } from "@/tabs/iSCSI/types/cluster/Pool";
import { BashCommand, ProcessError, safeJsonParse, StringToIntCaster, type Server } from '@45drives/houston-common-lib';
import { DeviceType } from '@/tabs/iSCSI/types/VirtualDevice';
import { err, errAsync, ok, okAsync, ResultAsync, safeTry } from 'neverthrow';
import { Result } from 'postcss';

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
                        return okAsync(new RadosBlockDevice(name, mapProc.getStdout(), blockSize.some(), size, pool));

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
                        return okAsync(new RadosBlockDevice(name, mapProc.getStdout(), blockSize.some(), size, parentPool, dataPool));

                    return errAsync(new ProcessError("Unable to determine block size of RBD"));
                })
            )
        )
    }

    createLogicalVolumeFromRadosBlockDevices(logicalVolumeName: string, volumeGroupName: string, rbds: RadosBlockDevice[]) {
        const rbdPaths = rbds.map((rbd) => rbd.filePath).join(' ');
        let createdLogicalVolume: LogicalVolume | null = null;

        return ResultAsync.combine(rbds.map((rbd) => this.server.execute(new BashCommand(`pvcreate ${rbd.filePath}`)).map(() => new PhysicalVolume(rbd.filePath))))
        .andThen((physicalVolumes) => this.server.execute(new BashCommand(`vgcreate ${volumeGroupName} ${rbdPaths}`)).map(() => new VolumeGroup(volumeGroupName, physicalVolumes)))
        .andThen((volumeGroup) => this.server.execute(new BashCommand(`lvcreate -i ${rbds.length} -I 64 -l 100%FREE -n ${logicalVolumeName} ${volumeGroupName} ${rbdPaths}`))
            .andThen(() => this.server.execute(new BashCommand(`lvdisplay /dev/${volumeGroupName}/${logicalVolumeName} | grep 'LV Size' | awk '{print $3, $4}'`))
                .map((proc) => proc.getStdout())
                .map((maximumSize) => {
                    createdLogicalVolume = new LogicalVolume(logicalVolumeName, 0, volumeGroup, rbds, maximumSize)
                })
            )
        )
        .map(() => this.server.execute(new BashCommand(`lvchange -an ${createdLogicalVolume!.volumeGroup.name}/${createdLogicalVolume!.deviceName}`)))
        .map(() => ResultAsync.combine(rbds.map((rbd) => this.server.execute(new BashCommand(`rbd unmap ${rbd.parentPool}/${rbd.deviceName}`)))))
        .map(() => createdLogicalVolume!);
    }

    expandRadosBlockDevice(device: RadosBlockDevice, newSize: string) {
        return this.server.execute(new BashCommand(`rbd resize --size ${newSize} ${device.filePath}`));
    }

    expandLogicalVolume(volume: LogicalVolume, newSize: string) {
        return this.server.execute(new BashCommand(`lvextend -L ${newSize} ${volume.filePath}`));
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
            .map((results) => results.filter((result) => result !== undefined));
    }

    fetchAvaliableRadosBlockDevices() {
        const self = this;
        return this.server.execute(new BashCommand(`rbd showmapped --format json`))
        .map((proc) => proc.getStdout())
        .andThen(safeJsonParse<MappedRBDJson>)
        .mapErr((err) => new ProcessError(`Unable to get current mapped Rados Block Devices: ${err}`))
        .map((rbdEntry) => ResultAsync.combine(
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
        return this.server.execute(new BashCommand(`lvs --reportformat json`))
                    .map((proc) => proc.getStdout())
                    .andThen(safeJsonParse<LogicalVolumeInfoJson>)
                    .map((logicalVolumeInfo) => logicalVolumeInfo?.report?.flatMap((report) => report.lv))
                    .map((lvList) => lvList!.flatMap((lvInfo) => 
                        this.server.execute(new BashCommand(`pvs -S vgname=${lvInfo.vg_name}`))
                            .map((proc) => proc.getStdout())
                            .andThen(safeJsonParse<VolumeGroupInfoJson>)
                            .map((volumeGroupEntries) => volumeGroupEntries!.report!.flatMap((report) => report.pv))
                            .map((pvList) => pvList.flatMap((pvInfo) => new PhysicalVolume(pvInfo.pv_name)))
                            .map((volumes) => new VolumeGroup(lvInfo.vg_name, volumes))
                    ))
                    .andThen((volumeGroups) => )
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
                    .map((number) => cockpit.format_bytes(number.some()))
                    .mapErr(() => new ProcessError(`Unable to determine maximum size of RDB: ${rbdName}`))
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

    fetchRadosBlockDeviceByDevicePath(path: Pick<VirtualDevice, "filePath"> | string) {
        return this.server.execute(new BashCommand(``))
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