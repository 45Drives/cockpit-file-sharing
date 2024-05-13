import {
  Server,
  Command,
  type Result,
  Ok,
  Err,
  isErr,
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

export namespace SambaManager {
  const netConfCommandOptions: CommandOptions = {
    superuser: "try",
  };

  const loadSettingsCommand = new Command(["net", "conf", "list"], netConfCommandOptions);
  const loadSettingsParse = (commandOutput: string): Result<SambaConfig, ParsingError> => {
    return SmbConfParser().apply(commandOutput);
  };

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
      .andThen((shareIniData): Result<[string, KeyValueData], ParsingError> => {
        const objKeys = Object.keys(shareIniData);
        const [shareName] = objKeys;
        if (shareName === undefined) {
          return Err(
            new ParsingError(
              `net conf showshare returned invalid data:\n${JSON.stringify(shareIniData)}`
            )
          );
        }
        return Ok([shareName, shareIniData[shareName]!]);
      })
      .andThen(([shareName, shareParams]) => SmbShareParser(shareName).apply(shareParams));
  };

  const delShareCommand = (section: string) =>
    new Command(["net", "conf", "delshare", section], netConfCommandOptions);

  const setSectionParams = async (
    server: Server,
    section: string,
    params: KeyValueData
  ): Promise<Result<null, ProcessError>> => {
    for (const [key, value] of Object.entries(params)) {
      const result = await server.execute(setParmCommand(section, key, value));
      if (isErr(result)) {
        return result;
      }
    }
    return Ok(null);
  };

  const delSectionParms = async (
    server: Server,
    section: string,
    params: string[]
  ): Promise<Result<null, ProcessError>> => {
    for (const param of params) {
      const result = await server.execute(delParmCommand(section, param));
      if (isErr(result)) {
        return result;
      }
    }
    return Ok(null);
  };

  export async function loadSettings(
    server: Server
  ): Promise<Result<SambaConfig, ProcessError | ParsingError>> {
    return (await server.execute(loadSettingsCommand))
      .map((proc) => proc.getStdout())
      .andThen(loadSettingsParse);
  }

  export async function getGlobalConfig(
    server: Server
  ): Promise<Result<SambaGlobalConfig, ParsingError | ProcessError>> {
    return (await server.execute(showShareCommand("global")))
      .map((p) => p.getStdout())
      .andThen(SmbConfParser().apply)
      .map(({ global }) => global);
  }

  export async function getShare(
    server: Server,
    shareName: string
  ): Promise<Result<SambaShareConfig, ParsingError | ProcessError>> {
    return (await server.execute(showShareCommand(shareName)))
      .map((p) => p.getStdout())
      .andThen(showShareParse);
  }

  export async function addShare(
    server: Server,
    share: SambaShareConfig
  ): Promise<Result<null, ProcessError>> {
    const addResult = await server.execute(addShareCommand(share.name, share.path.path));
    if (isErr(addResult)) {
      return addResult;
    }
    return await SmbShareParser(share.name)
      .unapply(share)
      .match({
        ok: (shareParams) => setSectionParams(server, share.name, shareParams),
        err: async (e) => Err(e),
      });
  }

  export async function editShare(
    server: Server,
    share: SambaShareConfig
  ): Promise<Result<null, ProcessError>> {
    return (await getShare(server, share.name))
      .andThen((originalShare) => SmbShareParser(originalShare.name).unapply(originalShare))
      .andThen((originalShareKV) =>
        SmbShareParser(share.name)
          .unapply(share)
          .map((shareKV) => ({ originalShareKV, shareKV }))
      )
      .map(({ originalShareKV, shareKV }) => keyValueDiff(originalShareKV, shareKV))
      .match({
        ok: async ({ added, removed, changed, same: _ }) => {
          const setResult = await setSectionParams(server, share.name, { ...added, ...changed });
          if (isErr(setResult)) {
            return setResult;
          }
          return await delSectionParms(server, share.name, Object.keys(removed));
        },
        err: async (e) => Err(e),
      });
  }

  export async function removeShare(
    server: Server,
    share: SambaShareConfig
  ): Promise<Result<null, ProcessError>> {
    return (await server.execute(delShareCommand(share.name))).map(() => null);
  }

  export async function editGlobal(
    server: Server,
    globalConfig: SambaGlobalConfig
  ): Promise<Result<null, ProcessError | ParsingError>> {
    const globalParser = SmbGlobalParser();
    return (await getGlobalConfig(server))
    .andThen(SmbGlobalParser().unapply)
    .andThen((originalGlobalKV) =>
      SmbGlobalParser()
        .unapply(globalConfig)
        .map((globalKV) => ({ originalGlobalKV, globalKV }))
    )
    .map(({ originalGlobalKV, globalKV }) => keyValueDiff(originalGlobalKV, globalKV))
    .match({
      ok: async ({ added, removed, changed, same: _ }) => {
        const setResult = await setSectionParams(server, "global", { ...added, ...changed });
        if (isErr(setResult)) {
          return setResult;
        }
        return await delSectionParms(server, "global", Object.keys(removed));
      },
      err: async (e) => Err(e),
    });
  }

  export const _testing = {
    loadSettingsParse,
  };
}
