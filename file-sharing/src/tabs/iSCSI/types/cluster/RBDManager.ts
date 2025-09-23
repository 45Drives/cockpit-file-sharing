import { VirtualDevice } from './../VirtualDevice';
import { VolumeGroup } from './VolumeGroup';
import { PhysicalVolume } from './PhysicalVolume';
import { LogicalVolume } from '@/tabs/iSCSI/types/cluster/LogicalVolume';
import { RadosBlockDevice } from './RadosBlockDevice';
import { Pool, PoolType } from "@/tabs/iSCSI/types/cluster/Pool";
import { BashCommand, ProcessError, safeJsonParse, Server, StringToIntCaster } from '@45drives/houston-common-lib';
import { err, errAsync, ok, okAsync, ResultAsync, safeTry } from 'neverthrow';

export class RBDManager {

  server: Server;
  allServers: Server[] = []
    constructor(server: Server) {
        this.server = server;
    }
    initialize(): ResultAsync<void, ProcessError> {
      return this.getOnlineClusterNodes()
          .map((servers) => {
              this.allServers = servers;
          })
          .mapErr((err) => {
              console.error("Failed to fetch online cluster nodes:", err);
              this.allServers = [];
              return new ProcessError("Failed to fetch online cluster nodes");
          });
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
                        return okAsync(newRbd)
                    return errAsync(new ProcessError("Unable to determine block size of RBD"));
                })
            )
        )
    }
    getOnlineClusterNodes(): ResultAsync<Server[], ProcessError> {
      return this.server
          .execute(new BashCommand(`pcs status xml`))
          .andThen((proc) => {
              const output = proc.getStdout();
              const parser = new DOMParser();
              const doc = parser.parseFromString(output, "text/xml");
  
              const nodeElements = Array.from(doc.getElementsByTagName("node"));
              const servers = nodeElements
                  .filter(el => el.getAttribute("online") === "true")
                  .map(el => el.getAttribute("name"))
                  .filter((name): name is string => !!name)
                  .map(name => new Server(name));
              if (servers.length === 0) {
                  return errAsync(new ProcessError("No online cluster nodes found."));
              }
  
              return okAsync(servers);
          });
  }

  getPrimaryServer(){
    return this.allServers[0]
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
        console.log(`Creating logical volume ${logicalVolumeName} in volume group ${volumeGroupName} from RBDs: ${rbdPaths}`);
        return ResultAsync.combine(rbds.map((rbd) => this.server.execute(new BashCommand(`pvcreate ${rbd.filePath}`)).map(() => new PhysicalVolume(rbd))))
        .andThen((physicalVolumes) => this.server.execute(new BashCommand(`vgcreate ${volumeGroupName} ${rbdPaths}`)).map(() => new VolumeGroup(volumeGroupName, physicalVolumes,this.server)))
        .andThen((volumeGroup) => this.server.execute(new BashCommand(`lvcreate -i ${rbds.length} -I 64 -l 100%FREE -n ${logicalVolumeName} ${volumeGroupName} ${rbdPaths}`))
            .andThen(() => this.server.execute(new BashCommand(`lvdisplay /dev/${volumeGroupName}/${logicalVolumeName} --units B | grep 'LV Size' | awk '{print $3, $4}'`))
                .map((proc) => proc.getStdout())
                .map((maximumSize) => {
                    createdLogicalVolume = new LogicalVolume(logicalVolumeName, 0, volumeGroup, StringToIntCaster()(maximumSize!).some(),this.server)
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

    fetchAvaliablePools(server: Server = this.server): ResultAsync<Pool[], ProcessError> {
        return server.execute(new BashCommand(`ceph osd pool ls detail --format json`))
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

    // fetchAvaliableRadosBlockDevices(): ResultAsync<RadosBlockDevice[], ProcessError> {
    //   const self = this;
    
    //   if (this.cachedRBDs !== null) {
    //     return okAsync(this.cachedRBDs);
    //   }
    
    //   return ResultAsync.combine([
    //     this.server.execute(new BashCommand(`rbd showmapped --format json`))
    //       .map((proc) => proc.getStdout())
    //       .andThen(safeJsonParse<MappedRBDJson>)
    //       .mapErr((err) => new ProcessError(`Unable to get current mapped Rados Block Devices: ${err}`)),
    
    //     this.server.execute(new BashCommand(`pvs --reportformat json -o pv_name,vg_name`))
    //       .map((proc) => proc.getStdout())
    //       .andThen(safeJsonParse<PVToVGJson>)
    //       .map((parsed) => {
    //         const map = new Map<string, string>();
    //         parsed.report.forEach(report => {
    //           report.pv.forEach(entry => {
    //             if (entry.vg_name) {
    //               map.set(entry.pv_name, entry.vg_name);
    //             }
    //           });
    //         });
    //         return map;
    //       })
    //   ])
    //   .andThen(([rbdEntries, pvToVGMap]) => {
    //     return ResultAsync.combine(
    //       rbdEntries.filter(Boolean).map((entry) => {
    //         return new ResultAsync(safeTry(async function* () {
    //           const devicePath = entry.device;
    //           const vgName = pvToVGMap.get(devicePath);
    
    //           const blockSize = yield* self.getBlockSizeFromDevicePath(devicePath).safeUnwrap();
    //           const maximumSize = yield* self.getMaximumSizeFromRBDName(entry.name).safeUnwrap();
    
    //           const parentPool = yield* self.fetchAvaliablePools()
    //             .map(pools => pools.find(pool => pool.name === entry.pool))
    //             .safeUnwrap();
    
    //           if (parentPool) {
    //             if (parentPool.poolType === PoolType.Replication) {
    //               return ok(new RadosBlockDevice(entry.name, devicePath, blockSize, maximumSize, parentPool, undefined, vgName));
    //             } else if (parentPool.poolType === PoolType.ErasureCoded) {
    //               const dataPool = yield* self.getDataPoolForRBDName(entry.name, parentPool).safeUnwrap();
    //               if (dataPool) {
    //                 return ok(new RadosBlockDevice(entry.name, devicePath, blockSize, maximumSize, parentPool, dataPool, vgName));
    //               }
    //             }
    //           }
    
    //           return err(new ProcessError("Unable to get Block Device information."));
    //         }));
    //       })
    //     ).map((rbdList) => {
    //       self.cachedRBDs = rbdList; // ✅ cache result
    //       return rbdList;
    //     });
    //   });
    // }
    // fetchAvaliableRadosBlockDevices(): ResultAsync<RadosBlockDevice[], ProcessError> {
    //   const self = this;
    
    //   // simple cache
    //   if (this.cachedRBDs !== null) {
    //     return okAsync(this.cachedRBDs);
    //   }
    
    //   // helper: normalize various showmapped JSON shapes to a uniform array
    //   const normalizeMapped = (json: any): Array<{
    //     id?: number | string;
    //     pool: string;
    //     name: string;
    //     snap?: string;
    //     device: string;
    //   }> => {
    //     if (!json) return [];
    //     if (Array.isArray(json)) return json;
    //     if (Array.isArray(json.mapped)) return json.mapped;
    //     if (typeof json === "object") {
    //       return Object.values(json).filter((e: any) => e && e.device && e.name);
    //     }
    //     return [];
    //   };
    
    //   return ResultAsync
    //     .combine(
    //       this.allServers.map((server) => {
    //         console.log(`Fetching mapped RBDs from ${server ?? String(server)}`);
    
    //         // Per-server: run showmapped + pvs concurrently
    //         return ResultAsync
    //           .combine([
    //             server.execute(
    //               new BashCommand(`bash -lc 'PATH="$PATH:/usr/sbin:/sbin"; rbd showmapped --format json'`)
    //             )
    //               .map((p) => p.getStdout())
    //               .andThen(safeJsonParse<any>)
    //               .map(normalizeMapped)
    //               .mapErr((err) => new ProcessError(`Unable to get mapped RBDs from ${server}: ${err}`)),
    
    //             server.execute(
    //               new BashCommand(`bash -lc 'PATH="$PATH:/usr/sbin:/sbin"; pvs --reportformat json -o pv_name,vg_name'`)
    //             )
    //               .map((p) => p.getStdout())
    //               .andThen(safeJsonParse<PVToVGJson>)
    //               .map((parsed) => {
    //                 const map = new Map<string, string>();
    //                 parsed.report?.forEach((r: any) => {
    //                   r.pv?.forEach((e: any) => {
    //                     if (e?.vg_name) map.set(e.pv_name, e.vg_name);
    //                   });
    //                 });
    //                 return map;
    //               }),
    //           ])
    //           // Build this server's RadosBlockDevice[] in parallel
    //           .andThen(([entries, pvToVGMap]) =>
    //             ResultAsync.combine(
    //               entries.map((entry) =>
    //                 new ResultAsync(
    //                   safeTry(async function* () {
    //                     const devicePath = entry.device;
    //                     const vgName = pvToVGMap.get(devicePath);
    
    //                     const blockSize   = yield* self.getBlockSizeFromDevicePath(devicePath, server).safeUnwrap();
    //                     const maximumSize = yield* self.getMaximumSizeFromRBDName(entry.name, server).safeUnwrap();
    
    //                     const parentPool = yield* self
    //                       .fetchAvaliablePools(server)
    //                       .map((pools) => pools.find((p) => p.name === entry.pool))
    //                       .safeUnwrap();
    
    //                     if (parentPool) {
    //                       if (parentPool.poolType === PoolType.Replication) {
    //                         return ok(
    //                           new RadosBlockDevice(
    //                             entry.name, devicePath, blockSize, maximumSize,
    //                             parentPool, server,undefined, vgName
    //                           )
    //                         );
    //                       } else if (parentPool.poolType === PoolType.ErasureCoded) {
    //                         const dataPool = yield* self.getDataPoolForRBDName(entry.name, parentPool, server).safeUnwrap();
    //                         if (dataPool) {
    //                           return ok(
    //                             new RadosBlockDevice(
    //                               entry.name, devicePath, blockSize, maximumSize,
    //                               parentPool, server, undefined, vgName
    //                             )
    //                           );
    //                         }
    //                       }
    //                     }
    
    //                     return err(
    //                       new ProcessError(`Unable to resolve block device info for ${entry.name} on ${server.name}`)
    //                     );
    //                   })
    //                 )
    //               )
    //             )
    //           );
    //       })
    //     )
    //     // Flatten all servers' results and cache
    //     .map((perServerLists) => {
    //       const flat = perServerLists.flat();
    //       this.cachedRBDs = flat;
    //       return flat;
    //     });
    // }

    fetchAvaliableRadosBlockDevices(): ResultAsync<RadosBlockDevice[], ProcessError> {
      const self = this;
    
      return ResultAsync.combine(
        this.allServers.map((server) => {
    
          return ResultAsync.combine([
            server.execute(new BashCommand(`rbd showmapped --format json`))
              .map((proc) => proc.getStdout())
              .andThen(safeJsonParse<MappedRBDJson>)
              .mapErr((err) => new ProcessError(`Unable to get mapped RBDs from ${server}: ${err}`)),
    
            server.execute(new BashCommand(`pvs --reportformat json -o pv_name,vg_name`))
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
              }),
          ])
          .andThen(([rbdEntries, pvToVGMap]) => {
            return ResultAsync.combine(
              rbdEntries.map((entry) => {
                return new ResultAsync(safeTry(async function* () {
                  const devicePath = entry.device;
                  const vgName = pvToVGMap.get(devicePath);
    
                  const blockSize = yield* self.getBlockSizeFromDevicePath(devicePath,server).safeUnwrap();
    
                  const parentPool = yield* self.fetchAvaliablePools(server)
                    .map(pools => pools.find(pool => pool.name === entry.pool))
                    .safeUnwrap();
    
                  if (parentPool) {
                    if (parentPool.poolType === PoolType.Replication) {
                      const maximumSize = yield* self.getMaximumSizeFromRBDName(entry.name,parentPool,server).safeUnwrap();
                      return ok(new RadosBlockDevice(entry.name, devicePath, blockSize, maximumSize, parentPool, server, undefined, vgName));
                    } else if (parentPool.poolType === PoolType.ErasureCoded) {
                      const dataPool = yield* self.getDataPoolForRBDName(entry.name, parentPool,server).safeUnwrap();
                      if (dataPool) {
                        return ok(new RadosBlockDevice(entry.name, devicePath, blockSize, maximumSize, parentPool,server, dataPool, vgName));
                      }
                    }
                  }
    
                  return err(new ProcessError(`Unable to resolve block device info for ${entry.name} on ${server.name}`));
                }));
              })
            );
          });
        })
      ).map((resultsPerServer) => resultsPerServer.flat());
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

    // fetchAvaliableLogicalVolumes(): ResultAsync<LogicalVolume[], ProcessError> {
    //   const self = this;
    //   return ResultAsync.combine(
    //     this.allServers.map((server) =>
    //       server.execute(new BashCommand(`lvs --reportformat json --units B`))
    //         .map((proc) => proc.getStdout())
    //         .andThen(safeJsonParse<LogicalVolumeInfoJson>)
    //         .map((logicalVolumeInfo) =>
    //           logicalVolumeInfo?.report?.flatMap((report) => report.lv) ?? []
    //         )
    //         .andThen((lvList) =>
    //           ResultAsync.combine(
    //             lvList.map((lvInfo) =>
    //               server.execute(new BashCommand(`pvs -S vgname=${lvInfo.vg_name} --reportformat json --units B`))
    //                 .map((proc) => proc.getStdout())
    //                 .andThen(safeJsonParse<VolumeGroupInfoJson>)
    //                 .map((vgInfo) => vgInfo.report?.flatMap((report) => report.pv) ?? [])
    //                 .andThen((pvList) =>
    //                   new ResultAsync(safeTry(async function* () {
    //                     const mappedBlockDevices = yield* self.fetchAvaliableRadosBlockDevices().safeUnwrap();
    //                     const physicalVolumes = pvList
    //                       .map((pv) => mappedBlockDevices.find((rbd) => rbd.filePath === pv.pv_name && rbd.server === server))
    //                       .filter((item): item is RadosBlockDevice => !!item)
    //                       .map((rbd) => new PhysicalVolume(rbd));
    //                     return okAsync(physicalVolumes);
    //                   }))
    //                 )
    //                 .map((volumes) => new VolumeGroup(lvInfo.vg_name, volumes,server))
    //                 .map((vg) =>
    //                   new LogicalVolume(
    //                     lvInfo.lv_name,
    //                     0,
    //                     vg,
    //                     StringToIntCaster()(lvInfo.lv_size).some(),
    //                     server
    //                   )
    //                 )
    //             )
    //           )
    //         )
    //     )
    //   ).map((perServerLVs) =>
    //     perServerLVs
    //       .flat()
    //       .filter((lv) => lv.volumeGroup.volumes.length !== 0)
    //   );
    // }      


     fetchAvaliableLogicalVolumes(): ResultAsync<LogicalVolume[], ProcessError> {
      const self = this;
    
      return ResultAsync.combine(
        this.allServers.map((server) =>
          // 1) get all LVs for this server
          server.execute(  new BashCommand(
            `lvs --reportformat json --units B \
             -o lv_name,vg_name,lv_size,lv_path,lv_attr \
             -S 'vg_name!="rl" && lv_name!~"^(root|home|swap)$"'`
          ))
            .map(p => p.getStdout())
            .andThen(safeJsonParse<LogicalVolumeInfoJson>)
            .map(info => info?.report?.flatMap(r => r.lv) ?? [])
            // 2) get PV->VG data ONCE (not per-LV)
            .andThen(lvList =>
              ResultAsync.combine([
                okAsync(lvList),
                server.execute(new BashCommand(`pvs --reportformat json --units B -o pv_name,vg_name`))
                  .map(p => p.getStdout())
                  .andThen(safeJsonParse<PVToVGJson>)
              ])
            )
            // 3) get ALL mapped RBDs ONCE (not per-LV), for ALL servers, and reuse
            .andThen(([lvList, pvJson]) =>
              ResultAsync.combine([
                okAsync(lvList),
                okAsync(pvJson.report?.flatMap(r => r.pv) ?? []),
                self.fetchAvaliableRadosBlockDevices()  // <-- once
              ])
            )
            .andThen(([lvList, pvList, allRBDs]) => {
              const rbdByServer = new Map<Server, RadosBlockDevice[]>();
              for (const rbd of allRBDs) {
                const arr = rbdByServer.get(rbd.server) ?? [];
                arr.push(rbd);
                rbdByServer.set(rbd.server, arr);
              }
              const rbdHere = rbdByServer.get(server) ?? [];
    
              // Build PV objects by matching to RBDs on THIS server
              const pvsForServer = pvList
                .map(pv => rbdHere.find(r => r.filePath === pv.pv_name))
                .filter((x): x is RadosBlockDevice => !!x)
                .map(rbd => new PhysicalVolume(rbd));
    
              // De-dup VGs so we don't rebuild per-LV
              const vgCache = new Map<string, VolumeGroup>();
              function getVG(vgName: string): VolumeGroup {
                const hit = vgCache.get(vgName);
                if (hit) return hit;
                const vg = new VolumeGroup(vgName, pvsForServer, server);
                vgCache.set(vgName, vg);
                return vg;
              }
    
              const lvs = lvList.map(lvInfo =>
                new LogicalVolume(
                  lvInfo.lv_name,
                  0,
                  getVG(lvInfo.vg_name),
                  StringToIntCaster()(lvInfo.lv_size).some(),
                  server
                )
              );
    
              return okAsync(lvs);
            })
        )
      ).map(perServer => perServer.flat()
         // keep only LVs whose VG actually has backing PVs (RBD-backed)
         .filter(lv => lv.volumeGroup.volumes.length !== 0)
      );
    }
    
    fetchExistingImageNames() {
        return this.server.execute(new BashCommand(`rbd list`))
        .map((proc) => proc.getStdout())
        .map((output) => output.trim().split('\n'));
    }

    getBlockSizeFromDevicePath(path: Pick<VirtualDevice, "filePath"> | string, server: Server) {
        return server.execute(new BashCommand(`blockdev --getbsz ${path}`))
                    .map((proc) => StringToIntCaster()(proc.getStdout()))
                    .andThen((maybeNumber) => maybeNumber.isSome() ? okAsync(maybeNumber.some()) : errAsync(new ProcessError(`Unable to determine block size for device: ${path}`)))
    }

    getMaximumSizeFromRBDName(rbdName: Pick<VirtualDevice, "deviceName"> | string,parentPool: Pool, server: Server) {
        return server.execute(new BashCommand(`rbd info ${parentPool.name}/${rbdName} --format json`))
                    .map((proc) => proc.getStdout())
                    .andThen(safeJsonParse<RBDInfoJson>)
                    .map((rbdInfoEntry) => StringToIntCaster()(rbdInfoEntry.size!))
                    .map((number) => number.some())
                    .mapErr(() => new ProcessError(`Unable to determine maximum size of RBD: ${rbdName}`))
    }

    getDataPoolForRBDName(rbdName: Pick<VirtualDevice, "deviceName"> | string, parentPool: Pool, server: Server) {
        return server.execute(new BashCommand(`rbd info ${parentPool.name}/${rbdName}`))
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