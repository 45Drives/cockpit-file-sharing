import {
  SambaShareConfig,
  type ISambaManager,
  SambaManagerNet as __SambaManager,
  ProcessError,
  ParsingError,
  Server,
  Command,
  BashCommand,
} from "@45drives/houston-common-lib";
import { executeHookCallbacks, Hooks } from "@/common/hooks";
import {
  ShareManagerMixin,
  type IShareManager,
  type ShareBase,
  type ShareDefinition,
} from "@/common/share-common";
import type { ResultAsync } from "neverthrow";

export type ActiveDirectoryConfigurationCheck = {
  enabled: boolean;
  joinHealthy: boolean;
  trustHealthy: boolean;
  toolsAvailable: boolean;
  sambaConfigured: boolean;
};

export type SambaSelinuxCheck = {
  status: "disabled" | "missing" | "labeled" | "needs-label" | "review";
  mode: string;
  actualType: string;
  expectedType: string;
};

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

  checkSambaSelinuxLabel(path: string) {
    const server = Array.isArray(this.servers) ? this.servers[0] : this.servers;
    const script = `
      command -v getenforce >/dev/null 2>&1 || { printf 'mode=Disabled\\n'; exit 0; }
      mode=$(getenforce 2>/dev/null) || exit 1
      printf 'mode=%s\\n' "$mode"
      if [ "$mode" = Disabled ]; then exit 0; fi
      if [ ! -e "$1" ]; then printf 'missing=true\\n'; exit 0; fi
      actual=$(stat -c %C -- "$1") || exit 1
      expected=$(matchpathcon -n -- "$1") || exit 1
      printf 'actual=%s\\nexpected=%s\\n' "$actual" "$expected"
    `;
    return server.execute(new BashCommand(script, [path], { superuser: "try" })).map((process) => {
      const values = Object.fromEntries(
        process.getStdout().trim().split("\n").map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        })
      );
      const contextType = (context: string) => context.split(":")[2] ?? "";
      const actualType = contextType(values.actual ?? "");
      const expectedType = contextType(values.expected ?? "");
      const status = values.mode === "Disabled" ? "disabled" :
        values.missing === "true" ? "missing" :
        actualType === "samba_share_t" ? "labeled" :
        expectedType === "samba_share_t" || ["unlabeled_t", "default_t"].includes(actualType)
          ? "needs-label" : "review";
      return { status, mode: values.mode ?? "", actualType, expectedType } as SambaSelinuxCheck;
    });
  }

  checkActiveDirectoryConfiguration() {
    const server = Array.isArray(this.servers) ? this.servers[0] : this.servers;
    const commandOptions = { superuser: "try" as const };
    const script = `
      security=$(testparm -s --parameter-name=security 2>/dev/null) || exit 1
      printf 'security=%s\\n' "$security"
      case "$security" in [Aa][Dd][Ss]) ;; *) exit 0 ;; esac
      workgroup=$(testparm -s --parameter-name=workgroup 2>/dev/null) || exit 1
      realm=$(testparm -s --parameter-name=realm 2>/dev/null) || exit 1
      printf 'configured=%s\\n' "$( [ -n "$workgroup" ] && [ -n "$realm" ] && printf true || printf false )"
      for tool in net wbinfo; do command -v "$tool" >/dev/null 2>&1 || { printf 'toolsAvailable=false\\n'; exit 0; }; done
      printf 'toolsAvailable=true\\n'
      if net ads testjoin >/dev/null 2>&1; then
        printf 'joinHealthy=true\\n'
      else
        printf 'joinHealthy=false\\n'
      fi
      if wbinfo -t >/dev/null 2>&1; then
        printf 'trustHealthy=true\\n'
      else
        printf 'trustHealthy=false\\n'
      fi
    `;

    return server.execute(new BashCommand(script, [], commandOptions)).map((process) => {
      const values = Object.fromEntries(
        process
          .getStdout()
          .trim()
          .split("\n")
          .map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator), line.slice(separator + 1)];
          })
      );
      const enabled = (value: string) => values[value] === "true";

      return {
        enabled: (values.security ?? "").toLowerCase() === "ads",
        toolsAvailable: enabled("toolsAvailable"),
        joinHealthy: enabled("joinHealthy"),
        trustHealthy: enabled("trustHealthy"),
        sambaConfigured: enabled("configured"),
      };
    });
  }

  labelPathForSamba(share: ShareDefinition<SambaShareConfig>) {
    const server = Array.isArray(this.servers) ? this.servers[0] : this.servers;
    const commandOptions = { superuser: "try" as const };
    const pattern = `${share.path.replace(/[.[\]{}()*+?^$\\|]/g, "\\$&")}(/.*)?`;
    const addContext = new Command(
      ["semanage", "fcontext", "-a", "-t", "samba_share_t", pattern],
      commandOptions
    );
    const modifyContext = new Command(
      ["semanage", "fcontext", "-m", "-t", "samba_share_t", pattern],
      commandOptions
    );

    return server
      .execute(
        addContext
      )
      .orElse(() => server.execute(modifyContext))
      .andThen(() =>
        server.execute(new Command(["restorecon", "-Rv", share.path], commandOptions))
      )
      .map(() => share);
  }

  addShare(share: ShareDefinition<SambaShareConfig>) {
    const { mountpointOptions, type, ...sambaShare } = share;
    const result = super.addShare(sambaShare) as ResultAsync<
      ShareDefinition<SambaShareConfig>,
      ProcessError | ParsingError
    >;
    return result.map((share) => ({ ...share, mountpointOptions, type }));
  }

  editShare(share: ShareDefinition<SambaShareConfig>) {
    const { mountpointOptions, type, ...sambaShare } = share;
    const result = super.editShare(sambaShare) as ResultAsync<
      ShareDefinition<SambaShareConfig>,
      ProcessError | ParsingError
    >;
    return result.map((share) => ({ ...share, mountpointOptions, type }));
  }

  removeShare(share: ShareDefinition<SambaShareConfig>) {
    const { mountpointOptions, type, ...sambaShare } = share;
    const result = super.removeShare(sambaShare) as ResultAsync<
      ShareDefinition<SambaShareConfig>,
      ProcessError | ParsingError
    >;
    return result.map((share) => ({ ...share, mountpointOptions, type }));
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
