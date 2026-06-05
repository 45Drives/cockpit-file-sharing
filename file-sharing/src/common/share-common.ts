import {
  FileSystemNode,
  SilentError,
  type ParsingError,
  type ProcessError,
  type Server,
} from "@45drives/houston-common-lib";
import { type MountpointOptions, type CephOptions, isCephOptions } from "./mountpoint-options";
import { okAsync, ResultAsync, ok } from "neverthrow";
import { getCephOptionManager } from "./ceph-option-manager";
import { confirm, reportError } from "@45drives/houston-common-ui";

const _ = cockpit.gettext;

export type ShareDefinition<T> = T & {
  readonly type: "samba" | "nfs";
  path: string;
  mountpointOptions: MountpointOptions;
};

export type ShareBase = {
  path: string;
};

export interface IShareManager<T extends ShareBase> {
  listShares(): ResultAsync<T[], ProcessError>;
  getShareDefinition(share: T): ResultAsync<ShareDefinition<T>, ProcessError>;
  addShare(share: ShareDefinition<T>): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError>;
  editShare(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError>;
  removeShare(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError>;
}



export class ShareManagerBase<T extends ShareBase> {
  public servers: Server | [Server, ...Server[]];
  private cephLayoutPoolCache: Record<string, ResultAsync<string[], ProcessError | ParsingError>> =
    {};
  constructor(servers: Server | [Server, ...Server[]]) {
    this.servers = servers;
  }

  getMountpointOptions(
    share: Omit<ShareDefinition<T>, "mountpointOptions">
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError> {
    const mainServer = Array.isArray(this.servers) ? this.servers[0] : this.servers;
    const fsNode = new FileSystemNode(mainServer, share.path);
    if (!fsNode.isAbsolute()) {
      return okAsync({ ...share, mountpointOptions: { fsType: "" } } as ShareDefinition<T>);
    }
    return fsNode
      .assertExists(true, { superuser: "try" })
      .mapErr((e) => new SilentError(e.message))
      .andThen((path) => path.getFilesystemMount({ superuser: "try" }))
      .andThen((mount) => {
        const fsType = mount.filesystem.realType;
        switch (fsType) {
          case "ceph":
            const client = `client.${share.type}` as const;
            const mgr = Array.isArray(this.servers)
              ? getCephOptionManager(this.servers, client)
              : getCephOptionManager(this.servers, client);
            const layoutPool = mgr.getLayoutPool(share.path).map((p) => p.orNull());
            const possibleLayoutPools =
              this.cephLayoutPoolCache[client] ??
              (this.cephLayoutPoolCache[client] = mgr.getLayoutPools());
            const quotaBytes = mgr.getQuotaMaxBytes(share.path).map((q) => q.orNull());
            const remount = mgr.pathIsMountpoint(share.path);
            const remountManagedByFileSharing = mgr.pathMountpointManagedByFileSharing(share.path).orElse(() => ok(true));
            return ResultAsync.combine([
              layoutPool,
              possibleLayoutPools,
              quotaBytes,
              remount,
              remountManagedByFileSharing,
            ]).map(
              ([
                layoutPool,
                possibleLayoutPools,
                quotaBytes,
                remount,
                remountManagedByFileSharing,
              ]) => {
                const result = {
                  ...share,
                  mountpointOptions: {
                    fsType,
                    layoutPool,
                    possibleLayoutPools,
                    quotaBytes,
                    remount,
                    remountManagedByFileSharing,
                  },
                } as ShareDefinition<T>;
                return result;
              }
            );
          default:
            break;
        }
        return ok({ ...share, mountpointOptions: { fsType } } as ShareDefinition<T>);
      })
      .orElse((error) => {
        if (!(error instanceof SilentError)) {
          reportError(error);
        }
        return ok({ ...share, mountpointOptions: { fsType: "" } } as ShareDefinition<T>);
      });
  }

  setMountpointOptions(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError> {
    if (isCephOptions(share.mountpointOptions)) {
      const cephOpts = share.mountpointOptions;
      const mgr = Array.isArray(this.servers)
        ? getCephOptionManager(this.servers, `client.${share.type}`)
        : getCephOptionManager(this.servers, `client.${share.type}`);
      return ResultAsync.combine([
        cephOpts.layoutPool
          ? mgr.setLayoutPool(share.path, cephOpts.layoutPool)
          : mgr.removeLayoutPool(share.path),
        cephOpts.quotaBytes !== null
          ? mgr.setQuotaMaxBytes(share.path, cephOpts.quotaBytes)
          : mgr.removeQuotaMaxBytes(share.path),
        cephOpts.remount ? mgr.remountPath(share.path) : mgr.removeRemount(share.path),
      ]).map(() => share);
    }
    return okAsync(share);
  }

  preAddShare(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError> {
    return this.setMountpointOptions(share);
  }
  postAddShare(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError> {
    return okAsync(share);
  }

  preEditShare(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError> {
    return this.setMountpointOptions(share);
  }
  postEditShare(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError> {
    return okAsync(share);
  }

  preRemoveShare(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError> {
    return okAsync(share);
  }
  postRemoveShare(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError> {
    if (isCephOptions(share.mountpointOptions) && share.mountpointOptions.remount) {
      return confirm({
        header: _("Remove Ceph Remount?"),
        body: _(
          `Share was remounted by File Sharing for proper reporting of quotas.
If this path is shared in another tab, you may want to keep it.`
        ),
        dangerous: true,
        confirmButtonText: _("Remove"),
        cancelButtonText: _("Keep"),
      }).andThen((remove) => {
        if (!remove) {
          return ok(share);
        }
        const mgr = Array.isArray(this.servers)
          ? getCephOptionManager(this.servers, `client.${share.type}`)
          : getCephOptionManager(this.servers, `client.${share.type}`);
        return mgr.removeRemount(share.path).map(() => share);
      });
    }
    return okAsync(share);
  }
}
