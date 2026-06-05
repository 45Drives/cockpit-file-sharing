import {
  FileSystemNode,
  ProcessError,
  SilentError,
  type ParsingError,
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
  type: ShareDefinition<T>["type"];
  servers: Server | [Server, ...Server[]];
  /**
   * Outermost wrapping
   *
   * 1. wrapShareModificationOutsideMixin begin *
   * 2. mixin begin
   * 3. action
   * 4. mixin end
   * 5. wrapShareModificationOutsideMixin end *
   *
   * @param action
   */
  wrapShareModificationOutsideMixin(
    share: ShareDefinition<T>,
    action: (
      share: ShareDefinition<T>
    ) => ResultAsync<ShareDefinition<T>, ProcessError | ParsingError>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError>;
  listShares(): ResultAsync<T[], ProcessError>;
  addShare(share: ShareDefinition<T>): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError>;
  editShare(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError>;
  removeShare(
    share: ShareDefinition<T>
  ): ResultAsync<ShareDefinition<T>, ProcessError | ParsingError>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = {}> = new (...args: any[]) => T;

export function ShareManagerMixin<T extends ShareBase, TBase extends Constructor<IShareManager<T>>>(
  Base: TBase
) {
  return class ShareManager extends Base implements IShareManager<T> {
    /** @internal */
    _cephLayoutPoolCache: Record<string, ResultAsync<string[], ProcessError | ParsingError>> = {};

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
                this._cephLayoutPoolCache[client] ??
                (this._cephLayoutPoolCache[client] = mgr.getLayoutPools());
              const quotaBytes = mgr.getQuotaMaxBytes(share.path).map((q) => q.orNull());
              const remount = mgr.pathIsMountpoint(share.path);
              const remountManagedByFileSharing = mgr.pathMountpointManagedByFileSharing(
                share.path
              );
              return ResultAsync.combineWithAllErrors([
                layoutPool,
                possibleLayoutPools,
                quotaBytes,
                remount,
                remountManagedByFileSharing,
              ])
                .mapErr((errors) => new ProcessError(errors.map((e) => e.message).join(";\n")))
                .map(
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
        const results = [
          cephOpts.layoutPool
            ? mgr.setLayoutPool(share.path, cephOpts.layoutPool)
            : mgr.removeLayoutPool(share.path),
          cephOpts.quotaBytes !== null
            ? mgr.setQuotaMaxBytes(share.path, cephOpts.quotaBytes)
            : mgr.removeQuotaMaxBytes(share.path),
        ];
        if (cephOpts.remountManagedByFileSharing) {
          results.push(
            cephOpts.remount ? mgr.remountPath(share.path) : mgr.removeRemount(share.path)
          );
        }
        return ResultAsync.combineWithAllErrors(results)
          .mapErr((errors) => new ProcessError(errors.map((e) => e.message).join(";\n")))
          .map(() => share);
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
      if (
        isCephOptions(share.mountpointOptions) &&
        share.mountpointOptions.remount &&
        share.mountpointOptions.remountManagedByFileSharing
      ) {
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

    getShareDefinition(share: T) {
      return this.getMountpointOptions({ ...share, type: this.type } as Omit<
        ShareDefinition<T>,
        "mountpointOptions"
      >);
    }

    addShare(share: ShareDefinition<T>) {
      return this.wrapShareModificationOutsideMixin(share, (share) =>
        this.preAddShare(share)
          .andThen((share) => super.addShare(share))
          .andThen((share) => this.postAddShare(share))
      );
    }

    editShare(share: ShareDefinition<T>) {
      return this.wrapShareModificationOutsideMixin(share, (share) =>
        this.preEditShare(share)
          .andThen((share) => super.editShare(share))
          .andThen((share) => this.postEditShare(share))
      );
    }

    removeShare(share: ShareDefinition<T>) {
      return this.wrapShareModificationOutsideMixin(share, (share) =>
        this.preRemoveShare(share)
          .andThen((share) => super.removeShare(share))
          .andThen((share) => this.postRemoveShare(share))
      );
    }
  };
}
