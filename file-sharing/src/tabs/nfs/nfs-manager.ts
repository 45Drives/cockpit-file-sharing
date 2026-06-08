import { type NFSExport } from "@/tabs/nfs/data-types";
import {
  ParsingError,
  ProcessError,
  Server,
  File,
  type CommandOptions,
  Command,
} from "@45drives/houston-common-lib";
import { err, ok, okAsync, ResultAsync } from "neverthrow";
import { NFSExportsParser } from "@/tabs/nfs/exports-parser";
import {
  SystemdManagerClustered,
  SystemdManagerSingleServer,
  type ISystemdManager,
} from "@/common/systemd-manager";
import {
  ShareManagerMixin,
  type IShareManager,
  type ShareDefinition,
} from "@/common/share-common";

export interface INFSManager extends IShareManager<NFSExport> {
  exportConfig(): ResultAsync<string, ProcessError>;
  importConfig(config: string): ResultAsync<this, ProcessError>;
  onExportsFileChanged(callback: () => void): { remove: () => void };
}

// function resultLogger(context: any): <T>(x: T) => T {
//   return (x) => {
//     console.log(context, x);
//     return x;
//   };
// }

class NFSManagerSingleServerDriver {
  private exportsFile: File;
  private commandOptions: CommandOptions = { superuser: "try" };
  private nfsExportsParser = new NFSExportsParser();

  constructor(
    public server: Server,
    exportsFilePath: string
  ) {
    this.exportsFile = new File(this.server, exportsFilePath);
  }

  private ensureExportsFile(): ResultAsync<File, ProcessError> {
    return this.exportsFile
      .assertExists(true)
      .orElse(() => this.exportsFile.create(true, this.commandOptions))
      .andThen((file) => file.assertIsFile());
  }

  private setExports(exports: NFSExport[]): ResultAsync<this, ProcessError | ParsingError> {
    return this.nfsExportsParser
      .unapply(exports)
      .asyncAndThen((newExportsContent) =>
        this.ensureExportsFile().andThen((exportsFile) =>
          exportsFile.replace(newExportsContent, this.commandOptions)
        )
      )
      .andThen(() => this.server.execute(new Command(["exportfs", "-ra"], this.commandOptions)))
      .map(() => this);
  }

  modifyExports(
    modifier: (exports: NFSExport[]) => NFSExport[]
  ): ResultAsync<this, ProcessError | ParsingError> {
    return (
      this.getExports()
        // .map(resultLogger("Original Exports"))
        // .mapErr(resultLogger("Original Exports"))
        .andThen((exports) => {
          const originalExports = structuredClone(exports);
          const modifiedExports = modifier(exports);
          return (
            this.setExports(modifiedExports)
              // .map(resultLogger("Set exports result"))
              // .mapErr(resultLogger("Set exports result"))
              .orElse((error) => {
                // Attempt to revert to original exports if setting modified exports fails
                return (
                  this.setExports(originalExports)
                    // .map(resultLogger("Revert exports result"))
                    // .mapErr(resultLogger("Revert exports result"))
                    .andThen(() => err(error))
                    .mapErr((error2) => {
                      error.message += `\nFailed to revert changes: ${error2.message}`;
                      return error;
                    })
                );
              })
          );
        })
    );
  }

  getExports(): ResultAsync<NFSExport[], ProcessError | ParsingError> {
    return this.ensureExportsFile()
      .andThen((exportsFile) => exportsFile.read(this.commandOptions))
      .andThen((exportsFileContents) => this.nfsExportsParser.apply(exportsFileContents));
  }

  addExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return this.modifyExports((exports) => [...exports, nfsExport]).map(() => nfsExport);
  }

  editExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return this.modifyExports((exports) =>
      exports.map((e) => (e.path === nfsExport.path ? nfsExport : e))
    ).map(() => nfsExport);
  }

  removeExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return this.modifyExports((exports) => exports.filter((e) => e.path !== nfsExport.path)).map(
      () => nfsExport
    );
  }

  exportConfig(): ResultAsync<string, ProcessError> {
    return this.ensureExportsFile().andThen((exportsFile) => exportsFile.read(this.commandOptions));
  }

  importConfig(config: string): ResultAsync<this, ProcessError> {
    return this.ensureExportsFile()
      .andThen((exportsFile) =>
        exportsFile.replace(config, { ...this.commandOptions, backup: true })
      )
      .map(() => this);
  }

  onExportsFileChanged(callback: () => void) {
    return cockpit
      .file(this.exportsFile.path, { host: this.server.host })
      .watch((_1, _2) => callback(), { read: false });
  }
}

const NFS_SERVICE_NAME = "nfs-server.service";

class _NFSManager implements INFSManager {
  public readonly type = "nfs" as const;
  public servers: Server | [Server, ...Server[]];
  private managers: [NFSManagerSingleServerDriver, ...NFSManagerSingleServerDriver[]];
  private primaryManager: NFSManagerSingleServerDriver;
  private systemdManager: ISystemdManager;

  constructor(server: Server | [Server, ...Server[]], exportsFilePath: string) {
    this.servers = server;
    this.managers = (Array.isArray(this.servers) ? this.servers : [this.servers]).map(
      (server) => new NFSManagerSingleServerDriver(server, exportsFilePath)
    ) as [NFSManagerSingleServerDriver, ...NFSManagerSingleServerDriver[]];
    this.primaryManager = this.managers[0];
    this.systemdManager = Array.isArray(this.servers)
      ? new SystemdManagerClustered(this.servers)
      : new SystemdManagerSingleServer(this.servers);
  }

  private ensureNFSServiceStaysRunning<T, E>(
    action: () => ResultAsync<T, E>
  ): ResultAsync<T, E | ProcessError | ParsingError> {
    return this.systemdManager.checkActive({ name: NFS_SERVICE_NAME }).andThen((wasActive) => {
      return action().andThen((result) => {
        if (wasActive) {
          return this.systemdManager.start({ name: NFS_SERVICE_NAME }).map(() => result);
        }
        return okAsync(result);
      });
    });
  }

  wrapShareModificationOutsideMixin(
    share: ShareDefinition<NFSExport>,
    action: (
      share: ShareDefinition<NFSExport>
    ) => ResultAsync<ShareDefinition<NFSExport>, ProcessError | ParsingError>
  ): ResultAsync<ShareDefinition<NFSExport>, ProcessError | ParsingError> {
    return this.ensureNFSServiceStaysRunning(() => action(share));
  }

  listShares() {
    return this.primaryManager.getExports();
  }

  addShare(
    nfsExport: ShareDefinition<NFSExport>
  ): ResultAsync<ShareDefinition<NFSExport>, ProcessError | ParsingError> {
    return ResultAsync.combineWithAllErrors(this.managers.map((m) => m.addExport(nfsExport)))
      .map(() => nfsExport)
      .mapErr((errors) => new ProcessError(errors.map((e) => e.message).join(";\n")));
  }

  editShare(
    nfsExport: ShareDefinition<NFSExport>
  ): ResultAsync<ShareDefinition<NFSExport>, ProcessError | ParsingError> {
    return ResultAsync.combineWithAllErrors(this.managers.map((m) => m.editExport(nfsExport)))
      .map(() => nfsExport)
      .mapErr((errors) => new ProcessError(errors.map((e) => e.message).join(";\n")));
  }

  removeShare(
    nfsExport: ShareDefinition<NFSExport>
  ): ResultAsync<ShareDefinition<NFSExport>, ProcessError | ParsingError> {
    return ResultAsync.combineWithAllErrors(this.managers.map((m) => m.removeExport(nfsExport)))
      .map(() => nfsExport)
      .mapErr((errors) => new ProcessError(errors.map((e) => e.message).join(";\n")));
  }

  exportConfig(): ResultAsync<string, ProcessError> {
    return this.primaryManager.exportConfig();
  }

  importConfig(config: string): ResultAsync<this, ProcessError> {
    return this.ensureNFSServiceStaysRunning(() =>
      ResultAsync.combineWithAllErrors(this.managers.map((m) => m.importConfig(config)))
        .map(() => this)
        .mapErr((errors) => new ProcessError(errors.map((e) => e.message).join(";\n")))
    );
  }

  onExportsFileChanged(
    callback: () => void,
    anyInCluster: boolean = false
  ): { remove: () => void } {
    if (anyInCluster && this.managers.length > 1) {
      const handles = this.managers.map((m) => m.onExportsFileChanged(callback));
      return {
        remove: () => handles.forEach((h) => h.remove()),
      };
    }
    return this.primaryManager.onExportsFileChanged(callback);
  }

  clusterConfigInSync(): ResultAsync<boolean, ParsingError | ProcessError> {
    if (this.managers.length === 1) {
      return okAsync(true);
    }
    return ResultAsync.combineWithAllErrors(this.managers.map((m) => m.getExports()))
      .mapErr((errors) => new ProcessError(errors.map((e) => e.message).join(";\n")))
      .map((exportsList) => {
        const [firstExports, ...otherExports] = exportsList as [NFSExport[], ...NFSExport[][]];
        const firstExportsString = JSON.stringify(
          firstExports.sort((a, b) => a.path.localeCompare(b.path))
        );
        return otherExports.every(
          (exports) =>
            JSON.stringify(exports.sort((a, b) => a.path.localeCompare(b.path))) ===
            firstExportsString
        );
      });
  }

  mergeClusterConfigs(): ResultAsync<this, ProcessError | ParsingError> {
    if (this.managers.length === 1) {
      return okAsync(this);
    }
    return ResultAsync.combineWithAllErrors(this.managers.map((m) => m.getExports()))
      .mapErr((errors) => new ProcessError(errors.map((e) => e.message).join(";\n")))
      .andThen((exportsList) => {
        const merged = [
          ...new Map<string, NFSExport>(
            exportsList
              .flat(1)
              .reverse()
              .map((e) => [e.path, e])
          ).values(),
        ];
        return this.ensureNFSServiceStaysRunning(() =>
          ResultAsync.combineWithAllErrors(this.managers.map((m) => m.modifyExports((_) => merged)))
            .mapErr((errors) => new ProcessError(errors.map((e) => e.message).join(";\n")))
            .map(() => this)
        );
      });
  }

  overwriteClusterConfigs(): ResultAsync<this, ProcessError | ParsingError> {
    if (this.managers.length === 1) {
      return okAsync(this);
    }
    return this.primaryManager.getExports().andThen((exports) =>
      this.ensureNFSServiceStaysRunning(() =>
        ResultAsync.combineWithAllErrors(
          this.managers.slice(1).map((m) => m.modifyExports((_) => exports))
        )
          .mapErr((errors) => new ProcessError(errors.map((e) => e.message).join(";\n")))
          .map(() => this)
      )
    );
  }
}

export const NFSManager = ShareManagerMixin<NFSExport, typeof _NFSManager>(_NFSManager);
