import {
  Server,
  Command,
  type CommandOptions,
  ProcessError,
  ParsingError,
  type KeyValueData,
  IniSyntax,
  keyValueDiff,
  File,
  RegexSnippets,
} from "@45drives/houston-common-lib";
import {
  type SambaGlobalConfig,
  type SambaShareConfig,
} from "@/tabs/samba/data-types";
import { SmbConfParser, SmbGlobalParser, SmbShareParser } from "@/tabs/samba/smb-conf-parser";
import { Result, ok, err, ResultAsync, okAsync, errAsync } from "neverthrow";
import { executeHookCallbacks, Hooks } from "@/common/hooks";

export interface ISambaManager {
  getGlobalConfig(): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError>;

  editGlobal(globalConfig: SambaGlobalConfig): ResultAsync<this, ProcessError>;

  listShareNames(): ResultAsync<string[], ProcessError>;

  getShareProperty(shareName: string, property: string): ResultAsync<string, ProcessError>;

  getShare(shareName: string): ResultAsync<SambaShareConfig, ParsingError | ProcessError>;

  getShares(): ResultAsync<SambaShareConfig[], ParsingError | ProcessError>;

  addShare(share: SambaShareConfig): ResultAsync<this, ProcessError>;

  editShare(share: SambaShareConfig): ResultAsync<this, ProcessError>;

  removeShare(share: SambaShareConfig): ResultAsync<this, ProcessError>;

  exportConfig(): ResultAsync<string, ProcessError>;

  importConfig(config: string): ResultAsync<this, ProcessError>;

  checkIfSmbConfIncludesRegistry(smbConfPath: string): ResultAsync<boolean, ProcessError>;

  patchSmbConfIncludeRegistry(smbConfPath: string): ResultAsync<this, ProcessError>;

  importFromSmbConf(smbConfPath: string): ResultAsync<this, ProcessError>;
}

export class SambaManager implements ISambaManager {
  private commandOptions: CommandOptions;

  constructor(private server: Server) {
    this.commandOptions = {
      superuser: "try",
    };
  }

  private netConfCommand(...args: string[]) {
    return new Command(["net", "conf", ...args], this.commandOptions);
  }

  private listShareNamesCommand() {
    return this.netConfCommand("listshares");
  }

  private addShareCommand(name: string, path: string) {
    return this.netConfCommand("addshare", name, path);
  }

  private getParmCommand(section: string, param: string) {
    return this.netConfCommand("getparm", section, param);
  }

  private setParmCommand(section: string, param: string, value: string) {
    return this.netConfCommand("setparm", section, param, value);
  }

  private delParmCommand(section: string, param: string) {
    return this.netConfCommand("delparm", section, param);
  }

  private showShareCommand(section: string) {
    return this.netConfCommand("showshare", section);
  }

  private showShareParse(commandOutput: string): Result<SambaShareConfig, ParsingError> {
    return IniSyntax()
      .apply(commandOutput)
      .andThen((shareIniData) => {
        const objKeys = Object.keys(shareIniData);
        const [shareName] = objKeys;
        if (shareName === undefined) {
          return err(
            new ParsingError(`net conf showshare returned invalid data:\n${commandOutput}`)
          );
        }
        return SmbShareParser(shareName).apply(shareIniData[shareName]!);
      });
  }

  private delShareCommand(section: string) {
    return this.netConfCommand("delshare", section);
  }

  private setSectionParams(section: string, params: KeyValueData) {
    return ResultAsync.combine(
      Object.entries(params).map(([key, value]) =>
        this.server.execute(this.setParmCommand(section, key, value), true)
      )
    );
  }

  private delSectionParms(section: string, params: string[]) {
    return ResultAsync.combine(
      params.map((param) => this.server.execute(this.delParmCommand(section, param), true))
    );
  }

  getGlobalConfig() {
    return this.server
      .execute(this.showShareCommand("global"))
      .map((p) => p.getStdout())
      .andThen(SmbConfParser().apply)
      .map(({ global }) => global);
  }

  editGlobal(globalConfig: SambaGlobalConfig) {
    const globalParser = SmbGlobalParser();
    return this.getGlobalConfig()
      .andThen(globalParser.unapply)
      .andThen((originalGlobalKV) =>
        globalParser
          .unapply(globalConfig)
          .map((globalKV) => keyValueDiff(originalGlobalKV, globalKV))
      )
      .andThen(({ added, removed, changed }) =>
        this.setSectionParams("global", { ...added, ...changed }).andThen(() =>
          this.delSectionParms("global", Object.keys(removed))
        )
      )
      .map(() => this);
  }

  listShareNames() {
    return this.server
      .execute(this.listShareNamesCommand())
      .map((p) => p.getStdout().trim())
      .map((shareNames) =>
        shareNames
          .split(RegexSnippets.newlineSplitter)
          .filter((shareName) => shareName.toLowerCase() !== "global")
      );
  }

  getShareProperty(shareName: string, property: string) {
    return this.server
      .execute(this.getParmCommand(shareName, property))
      .map((p) => p.getStdout().trim());
  }

  getShare(shareName: string) {
    return this.server
      .execute(this.showShareCommand(shareName))
      .map((p) => p.getStdout())
      .andThen(this.showShareParse);
  }

  getShares() {
    return this.listShareNames().andThen((shareNames) =>
      ResultAsync.combine(shareNames.map((shareName) => this.getShare(shareName)))
    );
  }

  addShare(share: SambaShareConfig) {
    return executeHookCallbacks(Hooks.BeforeAddShare, this.server, share)
      .andThen(() => SmbShareParser(share.name).unapply(share))
      .andThen((shareParams) =>
        this.server
          .execute(this.addShareCommand(share.name, share.path), true)
          .andThen(() => this.setSectionParams(share.name, shareParams))
      )
      .andThen(() => executeHookCallbacks(Hooks.AfterAddShare, this.server, share))
      .map(() => this);
  }

  editShare(share: SambaShareConfig) {
    const shareParser = SmbShareParser("");
    return executeHookCallbacks(Hooks.BeforeEditShare, this.server, share)
      .andThen(() => this.getShare(share.name))
      .andThen(shareParser.unapply)
      .andThen((originalShareKV) =>
        shareParser.unapply(share).map((shareKV) => keyValueDiff(originalShareKV, shareKV))
      )
      .andThen(({ added, removed, changed }) =>
        this.setSectionParams(share.name, { ...added, ...changed }).andThen(() =>
          this.delSectionParms(share.name, Object.keys(removed))
        )
      )
      .andThen(() => executeHookCallbacks(Hooks.AfterEditShare, this.server, share))
      .map(() => this);
  }

  removeShare(share: SambaShareConfig) {
    const shareName = typeof share === "string" ? share : share.name;
    return executeHookCallbacks(Hooks.BeforeRemoveShare, this.server, share)
      .andThen(() => this.server.execute(this.delShareCommand(shareName)))
      .andThen(() => executeHookCallbacks(Hooks.AfterRemoveShare, this.server, share))
      .map(() => this);
  }

  exportConfig() {
    return this.server.execute(this.netConfCommand("list")).map((proc) => proc.getStdout());
  }

  importConfig(config: string) {
    return File.makeTemp(this.server)
      .andThen((confFile) =>
        confFile.write(
          // remove include = registry or config backend = registry
          config.replace(/^[ \t]*(include|config backend)[ \t]*=[ \t]*registry.*$\n?/im, "")
        )
      )
      .andThen((confFile) => this.server.execute(this.netConfCommand("import", confFile.path)))
      .map(() => this);
  }

  checkIfSmbConfIncludesRegistry(smbConfPath: string) {
    return new File(this.server, smbConfPath)
      .assertExists()
      .andThen((smbConf) => smbConf.read())
      .andThen(IniSyntax({ duplicateKey: "ignore" }).apply)
      .map((smbConf) => smbConf.global?.include === "registry");
  }

  patchSmbConfIncludeRegistry(smbConfPath: string) {
    return new File(this.server, smbConfPath)
      .assertExists()
      .andThen((smbConf) =>
        smbConf.replace(
          (currentConfig) =>
            currentConfig.replace(
              // last line of [global] section
              /^\s*\[ ?global ?\]\s*$(?:\n^(?!;?\s*\[).*$)*/im,
              "$&\n\t# inclusion of net registry, inserted by cockpit-file-sharing:\n\tinclude = registry\n"
            ),
          this.commandOptions
        )
      )
      .map(() => this);
  }

  importFromSmbConf(smbConfPath: string) {
    return new File(this.server, smbConfPath)
      .assertExists()
      .andThen((smbConfFile) =>
        smbConfFile
          .read(this.commandOptions)
          .andThen((smbConf) => this.importConfig(smbConf))
          .andThen(() =>
            smbConfFile.replace(
              "# this config was generated by cockpit-file-sharing after importing smb.conf\n" +
                `# original smb.conf location: ${smbConfPath}.~N~\n` +
                "[global]\n" +
                "	include = registry\n",
              { ...this.commandOptions, backup: true }
            )
          )
      )
      .map(() => this);
  }
}
