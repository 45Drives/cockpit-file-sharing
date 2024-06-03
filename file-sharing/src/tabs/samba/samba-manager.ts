import {
  Server,
  Command,
  type CommandOptions,
  ProcessError,
  ParsingError,
  type KeyValueData,
  IniSyntax,
  keyValueDiff,
  getServer,
  File,
  RegexSnippets,
} from "@45drives/houston-common-lib";
import {
  type SambaConfig,
  type SambaGlobalConfig,
  type SambaShareConfig,
} from "@/tabs/samba/data-types";
import { SmbConfParser, SmbGlobalParser, SmbShareParser } from "@/tabs/samba/smb-conf-parser";
import { Result, ok, err, ResultAsync, okAsync, errAsync } from "neverthrow";
import { executeHookCallbacks, Hooks } from "@/common/hooks";

export interface ISambaManager {
  getGlobalConfig(): ResultAsync<SambaGlobalConfig, ParsingError | ProcessError>;

  editGlobal(globalConfig: SambaGlobalConfig): ResultAsync<null, ProcessError>;

  listShareNames(): ResultAsync<string[], ProcessError>;

  getShareProperty(shareName: string, property: string): ResultAsync<string, ProcessError>;

  getShare(shareName: string): ResultAsync<SambaShareConfig, ParsingError | ProcessError>;

  getShares(): ResultAsync<SambaShareConfig[], ParsingError | ProcessError>;

  addShare(share: SambaShareConfig): ResultAsync<null, ProcessError>;

  editShare(share: SambaShareConfig): ResultAsync<null, ProcessError>;

  removeShare(share: SambaShareConfig): ResultAsync<null, ProcessError>;
}

export namespace SambaManagerImplementation {
  const netConfCommandOptions: CommandOptions = {
    superuser: "try",
  };

  // const loadSettingsCommand = new Command(["net", "conf", "list"], netConfCommandOptions);
  // const loadSettingsParse = (commandOutput: string) => SmbConfParser().apply(commandOutput);

  const listShareNamesCommand = new Command(["net", "conf", "listshares"], netConfCommandOptions);

  const addShareCommand = (name: string, path: string) =>
    new Command(["net", "conf", "addshare", name, path], netConfCommandOptions);

  const getParmCommand = (section: string, param: string) =>
    new Command(["net", "conf", "getparm", section, param], netConfCommandOptions);

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

  export const getGlobalConfig = (server: Server) =>
    server
      .execute(showShareCommand("global"))
      .map((p) => p.getStdout())
      .andThen(SmbConfParser().apply)
      .map(({ global }) => global);
  export const editGlobal = (server: Server, globalConfig: SambaGlobalConfig) => {
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
  };
  export const listShareNames = (server: Server) =>
    server
      .execute(listShareNamesCommand)
      .map((p) => p.getStdout().trim())
      .map((shareNames) =>
        shareNames
          .split(RegexSnippets.newlineSplitter)
          .filter((shareName) => shareName.toLowerCase() !== "global")
      );
  export const getShareProperty = (server: Server, shareName: string, property: string) =>
    server.execute(getParmCommand(shareName, property)).map((p) => p.getStdout().trim());
  export const getShare = (server: Server, shareName: string) =>
    server
      .execute(showShareCommand(shareName))
      .map((p) => p.getStdout())
      .andThen(showShareParse);
  export const getShares = (server: Server) =>
    listShareNames(server).andThen((shareNames) =>
      ResultAsync.combine(shareNames.map((shareName) => getShare(server, shareName)))
    );
  export const addShare = (server: Server, share: SambaShareConfig) => {
    return executeHookCallbacks(Hooks.BeforeAddShare)
      .andThen(() => SmbShareParser(share.name).unapply(share))
      .andThen((shareParams) =>
        server
          .execute(addShareCommand(share.name, share.path), true)
          .andThen(() => setSectionParams(server, share.name, shareParams))
      )
      .andThen(() => executeHookCallbacks(Hooks.AfterAddShare));
  };
  export const editShare = (server: Server, share: SambaShareConfig) => {
    const shareParser = SmbShareParser("");
    return executeHookCallbacks(Hooks.BeforeEditShare)
      .andThen(() => getShare(server, share.name))
      .andThen(shareParser.unapply)
      .andThen((originalShareKV) =>
        shareParser.unapply(share).map((shareKV) => keyValueDiff(originalShareKV, shareKV))
      )
      .andThen(({ added, removed, changed }) =>
        setSectionParams(server, share.name, { ...added, ...changed }).andThen(() =>
          delSectionParms(server, share.name, Object.keys(removed))
        )
      )
      .andThen(() => executeHookCallbacks(Hooks.AfterEditShare));
  };
  export const removeShare = (server: Server, share: SambaShareConfig) => {
    const shareName = typeof share === "string" ? share : share.name;
    return executeHookCallbacks(Hooks.BeforeRemoveShare)
      .andThen(() => server.execute(delShareCommand(shareName)))
      .andThen(() => executeHookCallbacks(Hooks.AfterRemoveShare));
  };
}

export function SambaManagerSingleServer(server: Server): ISambaManager {
  return {
    getGlobalConfig: () => SambaManagerImplementation.getGlobalConfig(server),
    editGlobal: (globalConfig: SambaGlobalConfig) =>
      SambaManagerImplementation.editGlobal(server, globalConfig).map(() => null),
    listShareNames: () => SambaManagerImplementation.listShareNames(server),
    getShareProperty: (shareName: string, property: string) =>
      SambaManagerImplementation.getShareProperty(server, shareName, property),
    getShare: (shareName: string) => SambaManagerImplementation.getShare(server, shareName),
    getShares: () => SambaManagerImplementation.getShares(server),
    addShare: (share: SambaShareConfig) =>
      SambaManagerImplementation.addShare(server, share).map(() => null),
    editShare: (share: SambaShareConfig) =>
      SambaManagerImplementation.editShare(server, share).map(() => null),
    removeShare: (share: SambaShareConfig) =>
      SambaManagerImplementation.removeShare(server, share).map(() => null),
  };
}

// CTDB automatically manages config on all nodes
// export function SambaManagerClustered(servers: [Server, ...Server[]]): ISambaManager {
//   const getterServer = servers[0];
//   return {
//     getGlobalConfig: () => SambaManagerImplementation.getGlobalConfig(getterServer),
//     editGlobal: (globalConfig: SambaGlobalConfig) =>
//       ResultAsync.combine(
//         servers.map((server) => SambaManagerImplementation.editGlobal(server, globalConfig))
//       ).map(() => null),
//     listShareNames: () => SambaManagerImplementation.listShareNames(getterServer),
//     getShareProperty: (shareName: string, property: string) =>
//       SambaManagerImplementation.getShareProperty(getterServer, shareName, property),
//     getShare: (shareName: string) => SambaManagerImplementation.getShare(getterServer, shareName),
//     getShares: () => SambaManagerImplementation.getShares(getterServer),
//     addShare: (share: SambaShareConfig) =>
//       ResultAsync.combine(
//         servers.map((server) => SambaManagerImplementation.addShare(server, share))
//       ).map(() => null),
//     editShare: (share: SambaShareConfig) =>
//       ResultAsync.combine(
//         servers.map((server) => SambaManagerImplementation.editShare(server, share))
//       ).map(() => null),
//     removeShare: (share: SambaShareConfig | string) =>
//       ResultAsync.combine(
//         servers.map((server) => SambaManagerImplementation.removeShare(server, share))
//       ).map(() => null),
//   };
// }

export function getSambaManager(server: Server): ISambaManager {
  return SambaManagerSingleServer(server);
  // clusterScope = [clusterScope].flat() as [Server, ...Server[]];
  // if (clusterScope.length === 1) {
  //   return SambaManagerSingleServer(clusterScope[0]);
  // }
  // return SambaManagerClustered(clusterScope);
}
