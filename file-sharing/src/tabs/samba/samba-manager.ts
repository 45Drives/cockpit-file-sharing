import {
  SambaShareConfig,
  type ISambaManager,
  SambaManagerNet as __SambaManager,
  ProcessError,
  ParsingError,
  Server,
  Command,
} from "@45drives/houston-common-lib";
import { executeHookCallbacks, Hooks } from "@/common/hooks";
import {
  ShareManagerMixin,
  type IShareManager,
  type ShareBase,
  type ShareDefinition,
} from "@/common/share-common";
import { okAsync, type ResultAsync } from "neverthrow";

class _SambaManager
  extends __SambaManager
  implements ISambaManager, IShareManager<SambaShareConfig>
{
  type = "samba" as const;

  constructor(public servers: Server | [Server, ...Server[]]) {
    super([servers].flat()[0]);
  }

  wrapShareModificationOutsideMixin(
    share: ShareDefinition<SambaShareConfig>,
    action: (
      share: ShareDefinition<SambaShareConfig>
    ) => ResultAsync<ShareDefinition<SambaShareConfig>, ProcessError | ParsingError>
  ): ResultAsync<ShareDefinition<SambaShareConfig>, ProcessError | ParsingError> {
    return action(share);
  }

  listShares() {
    return super.getShares();
  }

  labelPathForSamba(share: ShareDefinition<SambaShareConfig>) {
    const server = Array.isArray(this.servers) ? this.servers[0] : this.servers;
    const commandOptions = { superuser: "try" as const };

    return server
      .execute(
        new Command(
          ["findmnt", "--noheadings", "--output", "TARGET,FSTYPE", "--target", share.path],
          commandOptions
        )
      )
      .map((process) => process.getStdout().trim().split(/\s+/))
      .andThen(([mountpoint, filesystemType]) => {
        if (filesystemType !== "zfs") {
          return okAsync(share);
        }
        const pattern = `${mountpoint.replace(/[.[\]{}()*+?^$\\|]/g, "\\$&")}(/.*)?`;
        const addContext = new Command(
          ["semanage", "fcontext", "-a", "-t", "samba_share_t", pattern],
          commandOptions
        );
        const modifyContext = new Command(
          ["semanage", "fcontext", "-m", "-t", "samba_share_t", pattern],
          commandOptions
        );

        return server
          .execute(addContext)
          .orElse(() => server.execute(modifyContext))
          .andThen(() =>
            server.execute(new Command(["restorecon", "-Rv", mountpoint], commandOptions))
          )
          .map(() => share);
      });
  }

  addShare(share: ShareDefinition<SambaShareConfig>) {
    const { mountpointOptions, type, selinuxLabelForSamba, ...sambaShare } = share;
    const result = super.addShare(sambaShare) as ResultAsync<
      ShareDefinition<SambaShareConfig>,
      ProcessError | ParsingError
    >;
    const saveShare = () =>
      result.map((share) => ({ ...share, mountpointOptions, type, selinuxLabelForSamba }));
    const shouldLabel = selinuxLabelForSamba !== false;
    return shouldLabel ? this.labelPathForSamba(share).andThen(saveShare) : saveShare();
  }

  editShare(share: ShareDefinition<SambaShareConfig>) {
    const { mountpointOptions, type, selinuxLabelForSamba, ...sambaShare } = share;
    const result = super.editShare(sambaShare) as ResultAsync<
      ShareDefinition<SambaShareConfig>,
      ProcessError | ParsingError
    >;
    const saveShare = () =>
      result.map((share) => ({ ...share, mountpointOptions, type, selinuxLabelForSamba }));
    const shouldLabel = selinuxLabelForSamba !== false;
    return shouldLabel ? this.labelPathForSamba(share).andThen(saveShare) : saveShare();
  }

  removeShare(share: ShareDefinition<SambaShareConfig>) {
    const { mountpointOptions, type, selinuxLabelForSamba, ...sambaShare } = share;
    const result = super.removeShare(sambaShare) as ResultAsync<
      ShareDefinition<SambaShareConfig>,
      ProcessError | ParsingError
    >;
    return result.map((share) => ({ ...share, mountpointOptions, type, selinuxLabelForSamba }));
  }
}

export const SambaManager = ShareManagerMixin<SambaShareConfig, typeof _SambaManager>(
  _SambaManager
);

// class HookedSambaManager extends _SambaManager implements ISambaManager {
//   addShare(share: SambaShareConfig) {
//     return executeHookCallbacks(Hooks.BeforeAddShare, this.server, share)
//       .andThen(() => super.addShare(share))
//       .andThen(() => executeHookCallbacks(Hooks.AfterAddShare, this.server, share))
//       .map(() => share);
//   }

//   editShare(share: SambaShareConfig) {
//     return executeHookCallbacks(Hooks.BeforeEditShare, this.server, share)
//       .andThen(() => super.editShare(share))
//       .andThen(() => executeHookCallbacks(Hooks.AfterEditShare, this.server, share))
//       .map(() => share);
//   }

//   removeShare(share: SambaShareConfig) {
//     return executeHookCallbacks(Hooks.BeforeRemoveShare, this.server, share)
//       .andThen(() => super.removeShare(share))
//       .andThen(() => executeHookCallbacks(Hooks.AfterRemoveShare, this.server, share))
//       .map(() => share);
//   }
// }
