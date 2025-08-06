import { VirtualDevice } from './../VirtualDevice';
import { VolumeGroup } from './VolumeGroup';
import { PhysicalVolume } from './PhysicalVolume';
import { LogicalVolume } from '@/tabs/iSCSI/types/cluster/LogicalVolume';
import { RadosBlockDevice } from './RadosBlockDevice';
import { Pool, PoolType } from "@/tabs/iSCSI/types/cluster/Pool";
import { BashCommand, ProcessError, safeJsonParse, Server, StringToIntCaster } from '@45drives/houston-common-lib';
import { err, errAsync, ok, okAsync, ResultAsync, safeTry } from 'neverthrow';
import { ISCSIDriverClusteredServer } from '../drivers/ISCSIDriverClusteredServer';
import { get } from 'http';
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

    fetchAvaliablePools(server:Server) {
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
    fetchAvaliableRadosBlockDevices(): ResultAsync<RadosBlockDevice[], ProcessError> {
        const self = this;
      
        return ResultAsync.combine(
          this.allServers.map((server) => {
            console.log(`Fetching mapped RBDs from ${server}`);
      
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
                    const maximumSize = yield* self.getMaximumSizeFromRBDName(entry.name,server).safeUnwrap();
      
                    const parentPool = yield* self.fetchAvaliablePools(server)
                      .map(pools => pools.find(pool => pool.name === entry.pool))
                      .safeUnwrap();
      
                    if (parentPool) {
                      if (parentPool.poolType === PoolType.Replication) {
                        return ok(new RadosBlockDevice(entry.name, devicePath, blockSize, maximumSize, parentPool, undefined, vgName,server));
                      } else if (parentPool.poolType === PoolType.ErasureCoded) {
                        const dataPool = yield* self.getDataPoolForRBDName(entry.name, parentPool,server).safeUnwrap();
                        if (dataPool) {
                          return ok(new RadosBlockDevice(entry.name, devicePath, blockSize, maximumSize, parentPool, dataPool, vgName,server));
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
                console.log("Online cluster nodes:", servers);
                if (servers.length === 0) {
                    return errAsync(new ProcessError("No online cluster nodes found."));
                }
    
                return okAsync(servers);
            });
    }
    fetchAvaliableLogicalVolumes(): ResultAsync<LogicalVolume[], ProcessError> {
        const self = this;
        console.log(this.allServers)
        return ResultAsync.combine(
          this.allServers.map((server) =>
            server.execute(new BashCommand(`lvs --reportformat json --units B`))
              .map((proc) => proc.getStdout())
              .andThen(safeJsonParse<LogicalVolumeInfoJson>)
              .map((logicalVolumeInfo) =>
                logicalVolumeInfo?.report?.flatMap((report) => report.lv) ?? []
              )
              .andThen((lvList) =>
                ResultAsync.combine(
                  lvList.map((lvInfo) =>
                    server.execute(new BashCommand(`pvs -S vgname=${lvInfo.vg_name} --reportformat json --units B`))
                      .map((proc) => proc.getStdout())
                      .andThen(safeJsonParse<VolumeGroupInfoJson>)
                      .map((vgInfo) => vgInfo.report?.flatMap((report) => report.pv) ?? [])
                      .andThen((pvList) =>
                        new ResultAsync(safeTry(async function* () {
                          const mappedBlockDevices = yield* self.fetchAvaliableRadosBlockDevices().safeUnwrap();
      
                          const physicalVolumes = pvList
                            .map((pv) => mappedBlockDevices.find((rbd) => rbd.filePath === pv.pv_name))
                            .filter((item): item is RadosBlockDevice => !!item)
                            .map((rbd) => new PhysicalVolume(rbd));
      
                          return okAsync(physicalVolumes);
                        }))
                      )
                      .map((volumes) => new VolumeGroup(lvInfo.vg_name, volumes))
                      .map((vg) =>
                        new LogicalVolume(
                          lvInfo.lv_name,
                          0,
                          vg,
                          StringToIntCaster()(lvInfo.lv_size).some()
                        )
                      )
                  )
                )
              )
          )
        ).map((perServerLVs) =>
          perServerLVs
            .flat()
            .filter((lv) => lv.volumeGroup.volumes.length !== 0)
        );
      }
      

    fetchExistingImageNames() {
        return this.server.execute(new BashCommand(`rbd list`))
        .map((proc) => proc.getStdout())
        .map((output) => output.trim().split('\n'));
    }

    getBlockSizeFromDevicePath(path: Pick<VirtualDevice, "filePath"> | string,server:Server) {
        return server.execute(new BashCommand(`blockdev --getbsz ${path}`))
                    .map((proc) => StringToIntCaster()(proc.getStdout()))
                    .andThen((maybeNumber) => maybeNumber.isSome() ? okAsync(maybeNumber.some()) : errAsync(new ProcessError(`Unable to determine block size for device: ${path}`)))
    }

    getMaximumSizeFromRBDName(rbdName: Pick<VirtualDevice, "deviceName"> | string,server:Server) {
        return server.execute(new BashCommand(`rbd info ${rbdName} --format json`))
                    .map((proc) => proc.getStdout())
                    .andThen(safeJsonParse<RBDInfoJson>)
                    .map((rbdInfoEntry) => StringToIntCaster()(rbdInfoEntry.size!))
                    .map((number) => number.some())
                    .mapErr(() => new ProcessError(`Unable to determine maximum size of RBD: ${rbdName}`))
    }

    getDataPoolForRBDName(rbdName: Pick<VirtualDevice, "deviceName"> | string, parentPool: Pool,server:Server) {
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