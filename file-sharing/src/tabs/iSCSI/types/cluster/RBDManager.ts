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


    /**
     * Creates a striped logical volume across freshly created Rados Block Devices.
     *
     * `requestedSizeBytes` is the size the user asked for. The images are created by the
     * caller using a simple division of that size, which leaves the volume short: LVM
     * reserves `pe_start` bytes at the front of every device for its own metadata, so a
     * device of exactly one stripe's worth of bytes yields one extent less than intended.
     *
     * Rather than guessing LVM's alignment up front (the volume group does not exist yet,
     * and `pe_start` depends on the device's reported I/O hints), the group is created
     * first, its real geometry is read back, and any image that came up short is grown
     * before `lvcreate` runs. This is self-correcting and hardcodes no assumptions.
     */
    createLogicalVolumeFromRadosBlockDevices(
        logicalVolumeName: string,
        volumeGroupName: string,
        rbds: RadosBlockDevice[],
        requestedSizeBytes?: number
    ) {
        const rbdPaths = rbds.map((rbd) => rbd.filePath).join(' ');
        const stripeCount = rbds.length;
        let createdLogicalVolume: LogicalVolume | null = null;
        return ResultAsync.combine(rbds.map((rbd) => this.server.execute(new BashCommand(`pvcreate ${rbd.filePath}`)).map(() => new PhysicalVolume(rbd))))
        .andThen((physicalVolumes) => this.server.execute(new BashCommand(`vgcreate ${volumeGroupName} ${rbdPaths}`)).map(() => new VolumeGroup(volumeGroupName, physicalVolumes,this.server)))
        .andThen((volumeGroup) => this.alignRadosBlockDevicesToRequestedSize(volumeGroupName, rbds, requestedSizeBytes)
            .andThen((allocation) => this.server.execute(new BashCommand(
                allocation === undefined
                    // No size was requested, so fall back to consuming the group entirely.
                    ? `lvcreate -i ${stripeCount} -I 64 -l 100%FREE -n ${logicalVolumeName} ${volumeGroupName} ${rbdPaths}`
                    // Extent-aligned explicit size, so the user gets exactly what was asked
                    // for instead of whatever happens to be left after metadata overhead.
                    : `lvcreate -i ${stripeCount} -I 64 -L ${allocation.targetLvSize}B -n ${logicalVolumeName} ${volumeGroupName} ${rbdPaths}`
            )))
            .andThen(() => this.server.execute(new BashCommand(`lvdisplay /dev/${volumeGroupName}/${logicalVolumeName} --units B | grep 'LV Size' | awk '{print $3, $4}'`))
                .map((proc) => proc.getStdout())
                .map((maximumSize) => {
                  
                  return this.server.getIpAddress(false).map((/* ip */) => {
                    createdLogicalVolume = new LogicalVolume(
                      logicalVolumeName,
                      0,
                      volumeGroup,
                      StringToIntCaster()(maximumSize).some(),
                      this.server // now has up-to-date ipAddress cached
                    );
                  });
                                })
            )
        )
        .map(() => createdLogicalVolume!);
    }

    /**
     * Grows freshly created images so that a striped logical volume of exactly
     * `requestedSizeBytes` can be carved out of the volume group.
     *
     * Returns the extent-aligned logical volume size to create, or `undefined` when no
     * size was requested (in which case the caller should consume the whole group).
     */
    alignRadosBlockDevicesToRequestedSize(
        volumeGroupName: string,
        rbds: RadosBlockDevice[],
        requestedSizeBytes?: number
    ): ResultAsync<{ targetLvSize: number } | undefined, ProcessError> {
        if (requestedSizeBytes === undefined || rbds.length === 0) {
            return okAsync(undefined);
        }

        const stripeCount = rbds.length;

        return this.fetchVolumeGroupGeometry(volumeGroupName, this.server)
            .andThen(({ extentSize, maxMetadataOffset }) => {
                // Same arithmetic as expandLogicalVolume: every stripe must contribute the
                // same whole number of extents, and each device additionally has to carry
                // LVM's metadata header before its first usable extent.
                const extentsPerStripe = Math.ceil(requestedSizeBytes / stripeCount / extentSize);
                const targetLvSize = extentsPerStripe * extentSize * stripeCount;
                const requiredRbdSize = extentsPerStripe * extentSize + maxMetadataOffset;

                console.log(`[createLogicalVolume] ${volumeGroupName}: requested ` +
                    `${requestedSizeBytes}B -> LV target ${targetLvSize}B across ${stripeCount} ` +
                    `stripe(s); each image must be >= ${requiredRbdSize}B ` +
                    `(extent ${extentSize}B, pe_start ${maxMetadataOffset}B)`);

                return ResultAsync.combine(rbds.map((rbd) => {
                    if (requiredRbdSize <= (rbd.maximumSize ?? 0)) {
                        return okAsync(undefined);
                    }

                    return this.expandRadosBlockDevice(rbd, requiredRbdSize, this.server)
                        .map(() => { rbd.maximumSize = requiredRbdSize; })
                        // Let LVM pick up the extra capacity before the volume is carved out.
                        .andThen(() => this.server.execute(new BashCommand(`pvresize ${rbd.filePath}`)))
                        .map(() => undefined);
                }))
                    .map(() => ({ targetLvSize }));
            });
    }

    expandRadosBlockDevice(device: RadosBlockDevice, newSizeBytes: number, server: Server = this.server) {
        // Always fully qualify the image as <pool>/<image>; without the pool prefix
        // `rbd resize` only ever resolves images in the default "rbd" pool.
        const imageSpec = device.parentPool?.name
            ? `${device.parentPool.name}/${device.deviceName}`
            : device.deviceName;

        return server.execute(new BashCommand(`rbd resize --size ${newSizeBytes}B ${imageSpec}`));
    }

    /**
     * Finds the node that currently has a logical volume active.
     *
     * Pacemaker activates each volume group exclusively on a single node and is free
     * to move it (e.g. when a LUN is added, or after a failover). LVM commands only
     * work where the RBDs are mapped, so the owning node has to be discovered at call
     * time rather than assuming the primary or trusting a cached node list.
     *
     * Note that shared LVM metadata is visible from every node, so merely finding the
     * volume group is not enough - the logical volume's activation state is what says
     * where `pvresize`/`lvextend` will actually work.
     */
    findServerForLogicalVolume(vgName: string, lvName: string): ResultAsync<Server, ProcessError> {
        // Re-read the membership instead of reusing the list captured at startup: nodes
        // can join, leave or be put in standby while the page is open.
        return this.getOnlineClusterNodes()
            .orElse(() => okAsync(this.allServers.length > 0 ? this.allServers : [this.server]))
            .andThen((candidates) => ResultAsync.combine(
                candidates.map((candidate) =>
                    // `lv_active` reports "active" for volumes activated anywhere in the
                    // cluster, so it cannot distinguish the owning node. `lv_active_locally`
                    // is specifically about this host. `--binary` yields 1/0 rather than
                    // locale-dependent words.
                    // Failures (including "not found", exit code 5) simply mean "not here".
                    candidate.execute(new BashCommand(
                        `lvs --noheadings --binary -o lv_active_locally ${vgName}/${lvName} 2>/dev/null || true`
                    ))
                        .map((proc) => ({
                            server: candidate,
                            active: proc.getStdout().trim() === "1",
                        }))
                        .orElse(() => okAsync({ server: candidate, active: false }))
                )
            ))
            .andThen((results) => {
                const owners = results.filter((result) => result.active);

                if (owners.length === 0) {
                    return errAsync(new ProcessError(
                        `${vgName}/${lvName} is not active on any online cluster node. ` +
                        `Check \`pcs status\` - the volume may be stopped, blocked or mid-failover.`
                    ));
                }

                // Exclusive activation should make this impossible. If it happens the
                // cluster is in a split state and writing to either node risks corruption,
                // so refuse rather than silently picking the first.
                if (owners.length > 1) {
                    return errAsync(new ProcessError(
                        `${vgName}/${lvName} is active on multiple nodes ` +
                        `(${owners.map((o) => o.server.host).join(", ")}). Refusing to resize: ` +
                        `exclusive activation appears to have been lost.`
                    ));
                }

                return okAsync(owners[0]!.server);
            });
    }

    /**
     * Maps "<pool>/<image>" to the kernel device path currently backing it.
     *
     * Kernel device numbers are handed out at map time, so /dev/rbdN is not stable
     * across an unmap/remap (which happens whenever Pacemaker takes over or moves a
     * resource). Cached paths therefore go stale and must be re-resolved before use.
     */
    fetchMappedDevicePaths(server: Server): ResultAsync<Map<string, string>, ProcessError> {
        return server.execute(new BashCommand(`rbd showmapped --format json`))
            .map((proc) => proc.getStdout())
            .andThen(safeJsonParse<MappedRBDJson>)
            .map((entries) => {
                const paths = new Map<string, string>();
                for (const entry of entries ?? []) {
                    paths.set(`${entry.pool}/${entry.name}`, entry.device);
                }
                return paths;
            });
    }

    /**
     * Reads the live size of every given RBD image straight from Ceph.
     *
     * Cached sizes go stale as soon as any resize partially succeeds, so decisions
     * about whether an image needs growing must be based on current values.
     */
    fetchRadosBlockDeviceSizes(
        rbds: RadosBlockDevice[],
        server: Server
    ): ResultAsync<Map<string, number>, ProcessError> {
        return ResultAsync.combine(rbds.map((rbd) => {
            const poolName = rbd.parentPool?.name ?? "rbd";
            const imageSpec = `${poolName}/${rbd.deviceName}`;

            return server.execute(new BashCommand(`rbd info ${imageSpec} --format json`))
                .map((proc) => proc.getStdout())
                .andThen(safeJsonParse<RBDInfoJson>)
                .andThen((info) => {
                    const size = StringToIntCaster()(`${info.size}`);

                    if (size.isNone()) {
                        return errAsync(new ProcessError(
                            `Unable to read the current size of ${imageSpec}.`
                        ));
                    }

                    return okAsync([imageSpec, size.some()] as const);
                });
        })).map((entries) => new Map(entries));
    }

    /**
     * Reads the volume group's extent size and the offset at which usable extents
     * begin on each physical volume.
     *
     * Both are needed to translate "the logical volume should be N bytes" into "each
     * backing image must be M bytes": the LV can only use whole extents on every
     * stripe, and the start of each device is reserved for LVM's own metadata.
     */
    fetchVolumeGroupGeometry(
        vgName: string,
        server: Server
    ): ResultAsync<{ extentSize: number; maxMetadataOffset: number }, ProcessError> {
        return server.execute(new BashCommand(
            `vgs --noheadings --units b --nosuffix -o vg_extent_size ${vgName}`
        ))
            .map((proc) => StringToIntCaster()(proc.getStdout().trim()))
            .andThen((extent) => extent.isSome()
                ? okAsync(extent.some())
                : errAsync(new ProcessError(`Unable to read the extent size of ${vgName}.`)))
            .andThen((extentSize) => server.execute(new BashCommand(
                `pvs --noheadings --units b --nosuffix -o pe_start -S vgname=${vgName}`
            ))
                .map((proc) => {
                    // `pe_start` is the fixed byte offset of the first usable extent, i.e.
                    // exactly the space LVM reserves for its metadata header.
                    //
                    // Deliberately NOT derived as `dev_size - pv_size`: if an image was
                    // enlarged but `pvresize` had not yet run, the physical volume would
                    // still report its old size and the not-yet-imported capacity would be
                    // mistaken for metadata, inflating every subsequent resize.
                    const offsets = proc.getStdout()
                        .split("\n")
                        .map((line) => StringToIntCaster()(line.trim()))
                        .filter((offset) => offset.isSome())
                        .map((offset) => offset.some());

                    return {
                        extentSize,
                        maxMetadataOffset: offsets.length > 0 ? Math.max(...offsets) : 0,
                    };
                }));
    }

    expandLogicalVolume(volume: LogicalVolume, newSizeBytes: number) {
        const physicalVolumes = volume.volumeGroup.volumes;

        if (physicalVolumes.length === 0) {
            return errAsync(new ProcessError(
                `Unable to expand ${volume.filePath}: no Rados Block Devices backing volume group ${volume.volumeGroup.name}.`
            ));
        }

        const stripeCount = physicalVolumes.length;

        return this.findServerForLogicalVolume(volume.volumeGroup.name, volume.deviceName)
            .andThen((targetServer) => ResultAsync.combine([
                this.fetchMappedDevicePaths(targetServer),
                this.fetchRadosBlockDeviceSizes(physicalVolumes.map((pv) => pv.rbd), targetServer),
                this.fetchVolumeGroupGeometry(volume.volumeGroup.name, targetServer),
            ] as const).map(([devicePaths, liveSizes, geometry]) =>
                ({ targetServer, devicePaths, liveSizes, geometry })))
            .andThen(({ targetServer, devicePaths, liveSizes, geometry }) => {
                const imageSpecOf = (rbd: RadosBlockDevice) =>
                    `${rbd.parentPool?.name ?? "rbd"}/${rbd.deviceName}`;
                const resolvePath = (rbd: RadosBlockDevice) =>
                    devicePaths.get(imageSpecOf(rbd));

                // Refuse to fall back to the cached path. Kernel device numbers are
                // reused, so a stale /dev/rbdN may now belong to a different image and
                // running `pvresize` against it would target the wrong volume.
                const unmapped = physicalVolumes
                    .filter((pv) => resolvePath(pv.rbd) === undefined)
                    .map((pv) => imageSpecOf(pv.rbd));

                if (unmapped.length > 0) {
                    return errAsync(new ProcessError(
                        `Cannot expand ${volume.filePath}: image(s) ${unmapped.join(", ")} are not ` +
                        `mapped on ${targetServer.host}. Refusing to use cached device paths, which ` +
                        `may now point at a different image.`
                    ));
                }

                const { extentSize, maxMetadataOffset } = geometry;

                // A striped logical volume consumes the same number of whole extents on
                // every stripe, so round the per-stripe share up to an extent boundary
                // and add the fixed offset at which usable extents start on each device.
                // Deriving the image size from the LV target this way is what makes the
                // requested "New Size" actually achievable; dividing the raw byte count
                // between the images leaves the LV short.
                const extentsPerStripe = Math.ceil(newSizeBytes / stripeCount / extentSize);
                const targetLvSize = extentsPerStripe * extentSize * stripeCount;
                const requiredRbdSize = extentsPerStripe * extentSize + maxMetadataOffset;

                console.log(`[expandLogicalVolume] ${volume.filePath} on ${targetServer.host}: ` +
                    `requested ${newSizeBytes}B -> LV target ${targetLvSize}B across ${stripeCount} ` +
                    `stripe(s); each image must be >= ${requiredRbdSize}B ` +
                    `(extent ${extentSize}B, pe_start ${maxMetadataOffset}B); live: ` +
                    physicalVolumes.map((pv) =>
                        `${pv.rbd.deviceName}=${liveSizes.get(imageSpecOf(pv.rbd))}B@${resolvePath(pv.rbd)}`
                    ).join(", "));

                return ResultAsync.combine(physicalVolumes.map((physicalVolume) => {
                    const rbd = physicalVolume.rbd;
                    const devicePath = resolvePath(rbd)!;
                    // Use the freshly read size, never the cached one: a previous attempt
                    // may have grown some images and failed on others, and acting on a
                    // stale value would ask Ceph to shrink an image that already grew.
                    const currentSize = liveSizes.get(imageSpecOf(rbd)) ?? 0;

                    // Keep the objects in step with what we just observed.
                    rbd.filePath = devicePath;
                    rbd.maximumSize = currentSize;

                    if (requiredRbdSize <= currentSize) {
                        // Already large enough; just make sure LVM sees the device size.
                        return targetServer.execute(new BashCommand(`pvresize ${devicePath}`));
                    }

                    return this.expandRadosBlockDevice(rbd, requiredRbdSize, targetServer)
                        .map(() => { rbd.maximumSize = requiredRbdSize; })
                        .andThen(() => targetServer.execute(new BashCommand(`pvresize ${devicePath}`)));
                }))
                // Extend to an explicit size rather than `+100%FREE`. Consuming every free
                // extent would overshoot whenever the volume group has spare capacity (for
                // example after a partially completed resize), handing back a volume larger
                // than the user asked for.
                .andThen(() => targetServer.execute(new BashCommand(
                    `lvextend -L ${targetLvSize}B ${volume.filePath}`
                ))
                    .orElse((error) => {
                        // `lvextend` exits non-zero (5) with "No size change." when the logical
                        // volume is already at the requested size. That is the desired end
                        // state, not a failure, so treat it as success.
                        // The text can appear on stdout or stderr depending on lvm2 version,
                        // so inspect the whole error rather than just `message`.
                        const details = [
                            (error as any)?.message,
                            (error as any)?.stderr,
                            (error as any)?.stdout,
                            (error as any)?.proc?.getStderr?.(),
                            (error as any)?.proc?.getStdout?.(),
                            String(error),
                        ].filter(Boolean).join("\n");

                        if (/no size change|matches existing size/i.test(details)) {
                            return okAsync(undefined as any);
                        }

                        return errAsync(error);
                    })
                )
                // Refresh the in-memory sizes from the actual post-resize state so the UI
                // reflects reality without a full page reload. A failure here means we no
                // longer know the real size, so surface it.
                .andThen(() => this.refreshLogicalVolumeSizes(volume, targetServer))
                .andThen(() => {
                    // Confirm we actually landed on the computed target. `targetLvSize` is
                    // already extent-aligned, so anything other than an exact match means
                    // LVM could not satisfy the request and the caller must not be told
                    // the volume is now the size they asked for.
                    const achieved = volume.maximumSize ?? 0;

                    if (achieved < targetLvSize) {
                        return errAsync(new ProcessError(
                            `${volume.filePath} only reached ${achieved}B of the requested ` +
                            `${newSizeBytes}B (target ${targetLvSize}B). The backing images were ` +
                            `resized, but LVM could not allocate the full amount.`
                        ));
                    }

                    return okAsync(undefined as any);
                });
            })
            .mapErr((error) => new ProcessError(
                `Failed to expand ${volume.filePath}: ${error instanceof Error ? error.message : error}`
            ));
    }

    /**
     * Re-reads the on-disk size of a logical volume and of each RBD backing it, and
     * writes the values back onto the existing objects so the UI reflects reality
     * without needing to re-enumerate every device on every cluster node.
     */
    refreshLogicalVolumeSizes(volume: LogicalVolume, server: Server = this.server) {
        const sizeQueries = volume.volumeGroup.volumes.map((physicalVolume) => {
            const rbd = physicalVolume.rbd;
            const imageSpec = rbd.parentPool?.name
                ? `${rbd.parentPool.name}/${rbd.deviceName}`
                : rbd.deviceName;

            return server.execute(new BashCommand(`rbd info ${imageSpec} --format json`))
                .map((proc) => proc.getStdout())
                .andThen(safeJsonParse<RBDInfoJson>)
                .map((info) => {
                    const size = StringToIntCaster()(`${info.size}`);
                    if (size.isSome()) {
                        rbd.maximumSize = size.some();
                    }
                });
        });

        return ResultAsync.combine(sizeQueries)
            .andThen(() => server.execute(new BashCommand(
                `lvs --reportformat json --units B --noheadings -o lv_size ${volume.filePath}`
            )))
            .map((proc) => proc.getStdout())
            .andThen(safeJsonParse<LogicalVolumeInfoJson>)
            .map((info) => {
                const lvSize = info?.report?.flatMap((r) => r.lv)?.[0]?.lv_size;
                const parsed = lvSize === undefined ? undefined : StringToIntCaster()(lvSize);

                if (parsed !== undefined && parsed.isSome()) {
                    volume.maximumSize = parsed.some();
                }
            });
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


    private cachedRBDs: RadosBlockDevice[] | null = null;

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

     fetchAvaliableLogicalVolumes(): ResultAsync<LogicalVolume[], ProcessError> {
      const self = this;
    // console.log("this.allservers ", this.allServers)
      return ResultAsync.combine(
        this.allServers.map((server) =>
          // 1) get all LVs for this server
          server.execute(  new BashCommand(
            `lvs --reportformat json --units B \
             -o lv_name,vg_name,lv_size,lv_path,lv_attr \
             -S 'vg_name!="rl" && lv_name!~"^(root|home|swap)$"'`
          ))
            .map(p => {
              const out = p.getStdout()
              // console.log("LVS raw stdout: ", out);
              // console.log("server ", server)
              return out;
            })
            .andThen(safeJsonParse<LogicalVolumeInfoJson>)
            .map(info => {
              // console.log("LVS PARSED JSON:", info);
              return info?.report?.flatMap(r => r.lv) ?? [];
            })            // 2) get PV->VG data ONCE (not per-LV)
            .andThen(lvList =>
              ResultAsync.combine([
                okAsync(lvList),
                server.execute(new BashCommand(`pvs --reportformat json --units B -o pv_name,vg_name`))
                  .map(p => {
                    const out = p.getStdout()
                    // console.log("pvs raw stdout: ", out);
                    return out;
                  })
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
              // console.log("rbdByserver ", rbdByServer)
              const rbdHere = rbdByServer.get(server) ?? [];
    
              // De-dup VGs so we don't rebuild per-LV
              const vgCache = new Map<string, VolumeGroup>();
              function getVG(vgName: string): VolumeGroup {
                const hit = vgCache.get(vgName);
                if (hit) return hit;

                // Only include the physical volumes that actually belong to this
                // volume group. Handing every PV on the server to every VG made
                // unrelated volumes look like they shared backing devices, which
                // caused expandLogicalVolume to divide the requested size by the
                // wrong count and to resize another volume's RBDs.
                const pvsForVG = pvList
                  .filter(pv => pv.vg_name === vgName)
                  .map(pv => rbdHere.find(r => r.filePath === pv.pv_name))
                  .filter((x): x is RadosBlockDevice => !!x)
                  .map(rbd => new PhysicalVolume(rbd));

                const vg = new VolumeGroup(vgName, pvsForVG, server);
                vgCache.set(vgName, vg);
                // console.log("vgName ", vg)
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
              console.log("lvs  ", lvs)
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