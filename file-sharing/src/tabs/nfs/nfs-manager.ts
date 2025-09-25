import { type NFSExport } from "@/tabs/nfs/data-types";
import {
  ParsingError,
  ProcessError,
  Server,
  File,
  type CommandOptions,
  Command,
} from "@45drives/houston-common-lib";
import { ResultAsync } from "neverthrow";
import { NFSExportsParser } from "@/tabs/nfs/exports-parser";
import { Hooks, executeHookCallbacks } from "@/common/hooks";

export interface INFSManager {
  server: Server;
  getExports(): ResultAsync<NFSExport[], ProcessError | ParsingError>;
  addExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError>;
  editExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError>;
  removeExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError>;
  exportConfig(): ResultAsync<string, ProcessError>;
  importConfig(config: string): ResultAsync<this, ProcessError>;
  onExportsFileChanged(callback: () => void): { remove: () => void };
}

export class NFSManagerSingleServer implements INFSManager {
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

  getExports(): ResultAsync<NFSExport[], ProcessError | ParsingError> {
    return this.ensureExportsFile()
      .andThen((exportsFile) => exportsFile.read(this.commandOptions))
      .andThen((exportsFileContents) => this.nfsExportsParser.apply(exportsFileContents));
  }

  addExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return this.getExports()
      .map((exports) => [...exports, nfsExport])
      .andThen((exports) => this.setExports(exports))
      .map(() => nfsExport);
  }

  editExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return this.getExports()
      .map((exports) => exports.map((e) => (e.path === nfsExport.path ? nfsExport : e)))
      .andThen((exports) => this.setExports(exports))
      .map(() => nfsExport);
  }

  removeExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return this.getExports()
      .map((exports) => exports.filter((e) => e.path !== nfsExport.path))
      .andThen((exports) => this.setExports(exports))
      .map(() => nfsExport);
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

export class NFSManagerClustered implements INFSManager {
  private managers: [NFSManagerSingleServer, ...NFSManagerSingleServer[]];
  private getterManager: NFSManagerSingleServer;
  public server: Server;

  constructor(servers: [Server, ...Server[]], exportsFilePath: string) {
    this.managers = servers.map(
      (server) => new NFSManagerSingleServer(server, exportsFilePath)
    ) as [NFSManagerSingleServer, ...NFSManagerSingleServer[]];
    this.getterManager = this.managers[0];
    this.server = this.getterManager.server;
  }

  getExports(...args: Parameters<NFSManagerSingleServer["getExports"]>) {
    return this.getterManager.getExports(...args);
  }

  addExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return ResultAsync.combine(this.managers.map((m) => m.addExport(nfsExport))).map(
      () => nfsExport
    );
  }

  editExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return ResultAsync.combine(this.managers.map((m) => m.editExport(nfsExport))).map(
      () => nfsExport
    );
  }

  removeExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return ResultAsync.combine(this.managers.map((m) => m.removeExport(nfsExport))).map(
      () => nfsExport
    );
  }

  exportConfig(): ResultAsync<string, ProcessError> {
    return this.getterManager.exportConfig();
  }

  importConfig(config: string): ResultAsync<this, ProcessError> {
    return ResultAsync.combine(this.managers.map((m) => m.importConfig(config))).map(() => this);
  }

  onExportsFileChanged(callback: () => void): { remove: () => void } {
    return this.getterManager.onExportsFileChanged(callback);
  }
}

function _getNFSManager(
  servers: Server | [Server, ...Server[]],
  exportsFilePath: string
): INFSManager {
  if (Array.isArray(servers)) {
    return servers.length === 1
      ? new NFSManagerSingleServer(servers[0], exportsFilePath)
      : new NFSManagerClustered(servers, exportsFilePath);
  }
  return new NFSManagerSingleServer(servers, exportsFilePath);
}

class HookedNFSManager implements INFSManager {
  public server: Server;
  constructor(private mgr: INFSManager) {
    this.server = mgr.server;
  }

  getExports(...args: Parameters<NFSManagerSingleServer["getExports"]>) {
    return this.mgr.getExports(...args);
  }

  addExport(...args: Parameters<NFSManagerSingleServer["addExport"]>) {
    return executeHookCallbacks(Hooks.BeforeAddShare, this.server, args[0])
      .andThen(() => this.mgr.addExport(...args))
      .andThen((r) => executeHookCallbacks(Hooks.AfterAddShare, this.server, args[0]).map(() => r));
  }

  editExport(...args: Parameters<NFSManagerSingleServer["editExport"]>) {
    return executeHookCallbacks(Hooks.BeforeEditShare, this.server, args[0])
      .andThen(() => this.mgr.editExport(...args))
      .andThen((r) =>
        executeHookCallbacks(Hooks.AfterEditShare, this.server, args[0]).map(() => r)
      );
  }

  removeExport(...args: Parameters<NFSManagerSingleServer["removeExport"]>) {
    return executeHookCallbacks(Hooks.BeforeRemoveShare, this.server, args[0])
      .andThen(() => this.mgr.removeExport(...args))
      .andThen((r) =>
        executeHookCallbacks(Hooks.AfterRemoveShare, this.server, args[0]).map(() => r)
      );
  }

  exportConfig(...args: Parameters<NFSManagerSingleServer["exportConfig"]>) {
    return this.mgr.exportConfig(...args);
  }

  importConfig(...args: Parameters<NFSManagerSingleServer["importConfig"]>) {
    return this.mgr.importConfig(...args).map(() => this);
  }

  onExportsFileChanged(...args: Parameters<NFSManagerSingleServer["onExportsFileChanged"]>) {
    return this.mgr.onExportsFileChanged(...args);
  }
}

export function getNFSManager(
  servers: Server | [Server, ...Server[]],
  exportsFilePath: string
): INFSManager {
  return new HookedNFSManager(_getNFSManager(servers, exportsFilePath));
}
