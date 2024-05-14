import {
  Server,
  Command,
  type CommandOptions,
  ProcessError,
  ParsingError,
  type KeyValueData,
  IniSyntax,
  keyValueDiff,
} from "@45drives/houston-common-lib";
import {
  type SambaConfig,
  type SambaGlobalConfig,
  type SambaShareConfig,
} from "@/tabs/samba/data-types";
import { SmbConfParser, SmbGlobalParser, SmbShareParser } from "@/tabs/samba/smb-conf-parser";
import { Result, ok, err, ResultAsync, okAsync, errAsync } from "neverthrow";

export namespace SambaManager {
  const netConfCommandOptions: CommandOptions = {
    superuser: "try",
  };

  const loadSettingsCommand = new Command(["net", "conf", "list"], netConfCommandOptions);
  const loadSettingsParse = (commandOutput: string) => SmbConfParser().apply(commandOutput);

  const addShareCommand = (name: string, path: string) =>
    new Command(["net", "conf", "addshare", name, path], netConfCommandOptions);

  const setParmCommand = (section: string, param: string, value: string) =>
    new Command(["net", "conf", "setparm", section, param, value], netConfCommandOptions);

  const delParmCommand = (section: string, param: string) =>
    new Command(["net", "conf", "delparm", section, param], netConfCommandOptions);

  const showShareCommand = (section: string) =>
    new Command(["net", "conf", "showshare", section], netConfCommandOptions);
  const showShareParse = (commandOutput: string): Result<SambaShareConfig, ParsingError> => {
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
  };

  const delShareCommand = (section: string) =>
    new Command(["net", "conf", "delshare", section], netConfCommandOptions);

  const setSectionParams = (server: Server, section: string, params: KeyValueData) =>
    ResultAsync.combine(
      Object.entries(params).map(([key, value]) =>
        server.execute(setParmCommand(section, key, value), true)
      )
    );

  const delSectionParms = (server: Server, section: string, params: string[]) =>
    ResultAsync.combine(
      params.map((param) => server.execute(delParmCommand(section, param), true))
    );

  export function loadSettings(
    server: Server
  ): ResultAsync<SambaConfig, ProcessError | ParsingError> {
    return server
      .execute(loadSettingsCommand)
      .map((proc) => proc.getStdout())
      .andThen(loadSettingsParse);
  }

  export function getGlobalConfig(
    server: Server
  ): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError> {
    return server
      .execute(showShareCommand("global"))
      .map((p) => p.getStdout())
      .andThen(SmbConfParser().apply)
      .map(({ global }) => global);
  }

  export function getShare(
    server: Server,
    shareName: string
  ): ResultAsync<SambaShareConfig, ParsingError | ProcessError> {
    return server
      .execute(showShareCommand(shareName))
      .map((p) => p.getStdout())
      .andThen(showShareParse);
  }

  export function addShare(server: Server, share: SambaShareConfig) {
    return SmbShareParser(share.name)
      .unapply(share)
      .asyncAndThen((shareParams) => {
        return server
          .execute(addShareCommand(share.name, share.path), true)
          .andThen(() => setSectionParams(server, share.name, shareParams));
      });
  }

  export function editShare(server: Server, share: SambaShareConfig) {
    const shareParser = SmbShareParser("");
    return getShare(server, share.name)
      .andThen(shareParser.unapply)
      .andThen((originalShareKV) =>
        shareParser.unapply(share).map((shareKV) => keyValueDiff(originalShareKV, shareKV))
      )
      .andThen(({ added, removed, changed }) =>
        setSectionParams(server, share.name, { ...added, ...changed }).andThen(() =>
          delSectionParms(server, share.name, Object.keys(removed))
        )
      );
  }

  export function removeShare(server: Server, share: SambaShareConfig) {
    return server.execute(delShareCommand(share.name));
  }

  export function editGlobal(server: Server, globalConfig: SambaGlobalConfig) {
    const globalParser = SmbGlobalParser();
    return getGlobalConfig(server)
      .andThen(globalParser.unapply)
      .andThen((originalGlobalKV) =>
        globalParser
          .unapply(globalConfig)
          .map((globalKV) => keyValueDiff(originalGlobalKV, globalKV))
      )
      .andThen(({ added, removed, changed }) =>
        setSectionParams(server, "global", { ...added, ...changed }).andThen(() =>
          delSectionParms(server, "global", Object.keys(removed))
        )
      );
  }
}
