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
  getExports(): ResultAsync<NFSExport[], ProcessError | ParsingError>;
  addExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError>;
  editExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError>;
  removeExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError>;
}

export class NFSManagerSingleServer implements INFSManager {
  private exportsFile: File;
  private commandOptions: CommandOptions = { superuser: "try" };
  private nfsExportsParser = new NFSExportsParser();
  constructor(
    private server: Server,
    exportsFilePath: string
  ) {
    this.exportsFile = new File(this.server, exportsFilePath);
  }

  private setExports(exports: NFSExport[]): ResultAsync<this, ProcessError | ParsingError> {
    return this.nfsExportsParser
      .unapply(exports)
      .asyncAndThen((newExportsContent) =>
        this.exportsFile
          .assertIsFile(this.commandOptions)
          .andThen((exportsFile) => exportsFile.replace(newExportsContent))
      )
      .andThen(() => this.server.execute(new Command(["exportfs", "-ra"], this.commandOptions)))
      .map(() => this);
  }

  getExports(): ResultAsync<NFSExport[], ProcessError | ParsingError> {
    return this.exportsFile
      .assertIsFile(this.commandOptions)
      .andThen((exportsFile) => exportsFile.read(this.commandOptions))
      .andThen(this.nfsExportsParser.apply);
  }

  addExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return executeHookCallbacks(Hooks.BeforeAddShare, this.server, nfsExport)
      .andThen(() => this.getExports())
      .map((exports) => [...exports, nfsExport])
      .andThen((exports) => this.setExports(exports))
      .andThen(() => executeHookCallbacks(Hooks.AfterAddShare, this.server, nfsExport))
      .map(() => nfsExport);
  }

  editExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return executeHookCallbacks(Hooks.BeforeEditShare, this.server, nfsExport)
      .andThen(() => this.getExports())
      .map((exports) => exports.map((e) => (e.path === nfsExport.path ? nfsExport : e)))
      .andThen((exports) => this.setExports(exports))
      .andThen(() => executeHookCallbacks(Hooks.AfterEditShare, this.server, nfsExport))
      .map(() => nfsExport);
  }

  removeExport(nfsExport: NFSExport): ResultAsync<NFSExport, ProcessError | ParsingError> {
    return executeHookCallbacks(Hooks.BeforeRemoveShare, this.server, nfsExport)
      .andThen(() => this.getExports())
      .map((exports) => exports.filter((e) => e.path !== nfsExport.path))
      .andThen((exports) => this.setExports(exports))
      .andThen(() => executeHookCallbacks(Hooks.AfterRemoveShare, this.server, nfsExport))
      .map(() => nfsExport);
  }
}

// export class 
