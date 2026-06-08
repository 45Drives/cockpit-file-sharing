type MountpointOptionsBase = {
  fsType: string;
};

export type ZFSOptions = MountpointOptionsBase & {
  fsType: "zfs";
};

export type CephOptions = MountpointOptionsBase & {
  fsType: "ceph";
  remount: boolean;
  remountManagedByFileSharing: boolean;
  quotaBytes: number | null;
  layoutPool: string | null;
  possibleLayoutPools: string[];
};

export type MountpointOptions = ZFSOptions | CephOptions | MountpointOptionsBase;

export const isZFSOptions = (opts: MountpointOptions): opts is ZFSOptions => opts.fsType === "zfs";
export const isCephOptions = (opts: MountpointOptions): opts is CephOptions =>
  opts.fsType === "ceph";
