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

    // createRadosBlockDevice(name: string, size: number, parentPool: Pool, dataPool?: Pool) {
    //     const dataPoolArgument =  dataPool === undefined ? "" :  `--data-pool ${dataPool.name}`

    //     return this.server.execute(new BashCommand(`rbd create ${parentPool.name}/${name} --size ${size}B ${dataPoolArgument}`))
    //     .andThen(() => 
    //         this.server.execute(new BashCommand(`rbd map ${parentPool.name}/${name}`))
    //         .andThen((mapProc) => this.server.execute(new BashCommand(`blockdev --getbsz ${mapProc.getStdout()}`))
    //             .andThen((blockSizeProc) => {
    //                 const blockSize = StringToIntCaster()(blockSizeProc.getStdout())

    //                 if (!blockSize.isNone())
    //                     return okAsync(new RadosBlockDevice(name, mapProc.getStdout().trim(), blockSize.some(), size, parentPool, dataPool));
    //                 if (this.cachedRBDs === null) {
    //                     this.cachedRBDs = [];
    //                 }
    //                 this.cachedRBDs.push(new RadosBlockDevice(name, mapProc.getStdout().trim(), blockSize.some(), size, parentPool, dataPool));
    //                 return errAsync(new ProcessError("Unable to determine block size of RBD"));
    //             })
    //         )
    //     )
    // }
    createRadosBlockDevice(name: string, size: number, parentPool: Pool, dataPool?: Pool) {
        const dataPoolArgument =  dataPool === undefined ? "" :  `--data-pool ${dataPool.name}`

        return this.server.execute(new BashCommand(`rbd create ${parentPool.name}/${name} --size ${size}B ${dataPoolArgument}`))
        .andThen(() => 
            this.server.execute(new BashCommand(`rbd map ${parentPool.name}/${name}`))
            .andThen((mapProc) => this.server.execute(new BashCommand(`blockdev --getbsz ${mapProc.getStdout()}`))
                .andThen((blockSizeProc) => {
                    const blockSize = StringToIntCaster()(blockSizeProc.getStdout())

                    if (!blockSize.isNone())
                        if (this.cachedRBDs === null) {
                            this.cachedRBDs = [];
                        }
                      const  newRbd = new RadosBlockDevice(name, mapProc.getStdout().trim(), blockSize.some(), size, parentPool, dataPool);
                        this.cachedRBDs.push(newRbd);
                        return okAsync(newRbd)
                    return errAsync(new ProcessError("Unable to determine block size of RBD"));
                })
            )
        )
    }

    // createRadosBlockDevice(name: string, size: number, parentPool: Pool, dataPool?: Pool) {
    //     const dataPoolArgument = dataPool === undefined ? "" : `--data-pool ${dataPool.name}`;
    
    //     return this.server.execute(new BashCommand(`rbd create ${parentPool.name}/${name} --size ${size}B ${dataPoolArgument}`))
    //         .andThen(() => 
    //             this.server.execute(new BashCommand(`rbd map ${parentPool.name}/${name}`))
    //             .andThen((mapProc) =>
    //                 this.server.execute(new BashCommand(`blockdev --getbsz ${mapProc.getStdout().trim()}`))
    //                     .andThen((blockSizeProc) => {
    //                         const blockSizeOpt = StringToIntCaster()(blockSizeProc.getStdout());
    
    //                         if (blockSizeOpt.isNone()) {
    //                             return errAsync(new ProcessError("Unable to determine block size of RBD"));
    //                         }
    
    
    //                         const rbd = new RadosBlockDevice(
    //                             name,
    //                             mapProc.getStdout().trim(),
    //                             blockSize.some(),
    //                             size,
    //                             parentPool,
    //                             dataPool
    //                         );
    
    //                         // Always update cache
    //                         if (this.cachedRBDs === null) {
    //                             this.cachedRBDs = [];
    //                         }
    //                         this.cachedRBDs.push(rbd);
    
    //                         return okAsync(rbd);
    //                     })
    //             )
    //         );
    // }
    

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
                    if (poolData !== undefined) {
                        if (poolData.application_metadata.rbd !== undefined) {
                            let poolType = undefined;

                            switch (poolData.type) {
                                case 1:
                                    poolType = PoolType.Replication;
                                    break;
                                case 3:
                                    poolType = PoolType.ErasureCoded;
                                    break;
                            }

                            if (poolType !== undefined && poolData.pool_name !== undefined) {
                                return okAsync(new Pool(poolData.pool_name, poolType));
                            }
                        }
                    }

                    return okAsync(undefined);
                })
            ))
            .map((results) => results.filter((result): result is Pool => result !== undefined));
    }
    // fetchAvaliableRadosBlockDevices() {
    //     const self = this;
    //     return ResultAsync.combine([
    //       this.server.execute(new BashCommand(`rbd showmapped --format json`))
    //         .map((proc) => proc.getStdout())
    //         .andThen(safeJsonParse<MappedRBDJson>)
    //         .mapErr((err) => new ProcessError(`Unable to get current mapped Rados Block Devices: ${err}`)),
      
    //       this.server.execute(new BashCommand(`pvs --reportformat json -o pv_name,vg_name`))
    //         .map((proc) => proc.getStdout())
    //         .andThen(safeJsonParse<PVToVGJson>)
    //         .map((parsed) => {
    //           const map = new Map<string, string>();
    //           parsed.report.forEach(report => {
    //             report.pv.forEach(entry => {
    //               if (entry.vg_name) {
    //                 map.set(entry.pv_name, entry.vg_name);
    //               }
    //             });
    //           });
    //           return map;
    //         })
    //     ])
    //     .andThen(([rbdEntries, pvToVGMap]) => {
    //       return ResultAsync.combine(
    //         rbdEntries.filter(Boolean).map((entry) => {
    //           return new ResultAsync(safeTry(async function* () {
    //             const devicePath = entry.device;
    //             const vgName = pvToVGMap.get(devicePath); // ✅ Map device to VG (if exists)
      
    //             const blockSize = yield* self.getBlockSizeFromDevicePath(devicePath).safeUnwrap();
    //             const maximumSize = yield* self.getMaximumSizeFromRBDName(entry.name).safeUnwrap();
      
    //             const parentPool = yield* self.fetchAvaliablePools()
    //               .map(pools => pools.find(pool => pool.name === entry.pool))
    //               .safeUnwrap();
      
    //             if (parentPool) {
    //               if (parentPool.poolType === PoolType.Replication) {
    //                 return ok(new RadosBlockDevice(entry.name, devicePath, blockSize, maximumSize, parentPool, undefined, vgName));
    //               } else if (parentPool.poolType === PoolType.ErasureCoded) {
    //                 const dataPool = yield* self.getDataPoolForRBDName(entry.name, parentPool).safeUnwrap();
    //                 if (dataPool) {
    //                   return ok(new RadosBlockDevice(entry.name, devicePath, blockSize, maximumSize, parentPool, dataPool, vgName));
    //                 }
    //               }
    //             }
      
    //             return err(new ProcessError("Unable to get Block Device information."));
    //           }));
    //         })
    //       );
    //     });
    //   }

    private cachedRBDs: RadosBlockDevice[] | null = null;

    fetchAvaliableRadosBlockDevices(): ResultAsync<RadosBlockDevice[], ProcessError> {
      const self = this;
    
      if (this.cachedRBDs !== null) {
        return okAsync(this.cachedRBDs);
      }
    
      return ResultAsync.combine([
        this.server.execute(new BashCommand(`rbd showmapped --format json`))
          .map((proc) => proc.getStdout())
          .andThen(safeJsonParse<MappedRBDJson>)
          .mapErr((err) => new ProcessError(`Unable to get current mapped Rados Block Devices: ${err}`)),
    
        this.server.execute(new BashCommand(`pvs --reportformat json -o pv_name,vg_name`))
          .map((proc) => proc.getStdout())
          .andThen(safeJsonParse<PVToVGJson>)
          .map((parsed) => {
            const map = new Map<string, string>();
            parsed.report.forEach(report => {
              report.pv.forEach(entry => {
                if (entry.vg_name) {
                  map.set(entry.pv_name, entry.vg_name);
                }
              });
            });
            return map;
          })
      ])
      .andThen(([rbdEntries, pvToVGMap]) => {
        return ResultAsync.combine(
          rbdEntries.filter(Boolean).map((entry) => {
            return new ResultAsync(safeTry(async function* () {
              const devicePath = entry.device;
              const vgName = pvToVGMap.get(devicePath);
    
              const blockSize = yield* self.getBlockSizeFromDevicePath(devicePath).safeUnwrap();
              const maximumSize = yield* self.getMaximumSizeFromRBDName(entry.name).safeUnwrap();
    
              const parentPool = yield* self.fetchAvaliablePools()
                .map(pools => pools.find(pool => pool.name === entry.pool))
                .safeUnwrap();
    
              if (parentPool) {
                if (parentPool.poolType === PoolType.Replication) {
                  return ok(new RadosBlockDevice(entry.name, devicePath, blockSize, maximumSize, parentPool, undefined, vgName));
                } else if (parentPool.poolType === PoolType.ErasureCoded) {
                  const dataPool = yield* self.getDataPoolForRBDName(entry.name, parentPool).safeUnwrap();
                  if (dataPool) {
                    return ok(new RadosBlockDevice(entry.name, devicePath, blockSize, maximumSize, parentPool, dataPool, vgName));
                  }
                }
              }
    
              return err(new ProcessError("Unable to get Block Device information."));
            }));
          })
        ).map((rbdList) => {
          self.cachedRBDs = rbdList; // ✅ cache result
          return rbdList;
        });
      });
    }
          
    // fetchAvaliableLogicalVolumes() {
    //     const self = this;

    //     return this.server.execute(new BashCommand(`lvs --reportformat json --units B`))
    //     .map((proc) => proc.getStdout())
    //     .andThen(safeJsonParse<LogicalVolumeInfoJson>)
    //     .map((logicalVolumeInfo) => logicalVolumeInfo?.report?.flatMap((report) => report.lv))
    //     .andThen((lvList) => ResultAsync.combine(lvList!.flatMap((lvInfo) => 
    //         this.server.execute(new BashCommand(`pvs -S vgname=${lvInfo.vg_name} --reportformat json --units B`))
    //             .map((proc) => proc.getStdout())
    //             .andThen(safeJsonParse<VolumeGroupInfoJson>)
    //             .map((volumeGroupEntries) => volumeGroupEntries!.report!.flatMap((report) => report.pv))
    //             .andThen((pvList) => new ResultAsync(safeTry(async function * () {
    //                 const mappedBlockDevices = yield * self.fetchAvaliableRadosBlockDevices().safeUnwrap();

    //                 const physicalVolumes = pvList.flatMap((rbdItem) => mappedBlockDevices.find((rbd) => rbd.filePath === rbdItem.pv_name))
    //                                     .filter((item) => item !== undefined)
    //                                     .map((item) => new PhysicalVolume(item!));

    //                 return okAsync(physicalVolumes);
    //             })))
    //             .map((volumes) => new VolumeGroup(lvInfo.vg_name, volumes))
    //             .map((volumeGroup) => new LogicalVolume(lvInfo.lv_name, 0, volumeGroup, StringToIntCaster()(lvInfo.lv_size).some())))
    //     )).map((LogicalVolumes) => LogicalVolumes.filter((volume) => volume.volumeGroup.volumes.length !== 0));
    // }

    fetchAvaliableLogicalVolumes() {
        const self = this;
      
        // Fetch RBDs only once (uses cache if available)
        return self.fetchAvaliableRadosBlockDevices()
          .andThen((mappedBlockDevices) =>
            this.server.execute(new BashCommand(`lvs --reportformat json --units B`))
              .map((proc) => proc.getStdout())
              .andThen(safeJsonParse<LogicalVolumeInfoJson>)
              .map((logicalVolumeInfo) => logicalVolumeInfo?.report?.flatMap((report) => report.lv))
              .andThen((lvList) =>
                ResultAsync.combine(
                  lvList!.flatMap((lvInfo) =>
                    this.server.execute(new BashCommand(`pvs -S vgname=${lvInfo.vg_name} --reportformat json --units B`))
                      .map((proc) => proc.getStdout())
                      .andThen(safeJsonParse<VolumeGroupInfoJson>)
                      .map((volumeGroupEntries) => volumeGroupEntries!.report!.flatMap((report) => report.pv))
                      .map((pvList) => {
                        const physicalVolumes = pvList
                          .map((rbdItem) => mappedBlockDevices.find((rbd) => rbd.filePath === rbdItem.pv_name))
                          .filter((item): item is RadosBlockDevice => !!item)
                          .map((rbd) => new PhysicalVolume(rbd));
                        return new VolumeGroup(lvInfo.vg_name, physicalVolumes);
                      })
                      .map((vg) => new LogicalVolume(
                        lvInfo.lv_name,
                        0,
                        vg,
                        StringToIntCaster()(lvInfo.lv_size).some()
                      ))
                  )
                )
              )
              .map((LogicalVolumes) =>
                LogicalVolumes.filter((volume) => volume.volumeGroup.volumes.length !== 0)
              )
          );
      }
      
    fetchExistingImageNames() {
        return this.server.execute(new BashCommand(`rbd list`))
        .map((proc) => proc.getStdout())
        .map((output) => output.trim().split('\n'));
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
    application_metadata: {
        rbd: {}
    }
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