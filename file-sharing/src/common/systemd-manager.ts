import {
  type IniConfigData,
  type ProcessError,
  ParsingError,
  type Server,
  Command,
  getServer,
  IniSyntax,
  File,
  RegexSnippets,
} from "@45drives/houston-common-lib";
import { ResultAsync, errAsync, okAsync, err, ok } from "neverthrow";

export type SystemdUnitType =
  | "service"
  | "mount"
  | "swap"
  | "socket"
  | "target"
  | "device"
  | "automount"
  | "timer"
  | "path"
  | "slice"
  | "scope";

export type SystemdUnit<T extends SystemdUnitType = SystemdUnitType> = {
  name: `${string}.${T}`;
};

export function isMount(unit: SystemdUnit): unit is SystemdUnit<"mount"> {
  return unit.name.endsWith(".mount");
}

export type SystemdUnitSettingsBase = IniConfigData<string | [string, ...string[]]> & {
  Unit?: {
    DefaultDependencies?: "yes" | "no";
    After?: string | [string, ...string[]];
    Wants?: string | [string, ...string[]];
    Conflicts?: string | [string, ...string[]];
    Before?: string | [string, ...string[]];
    Description?: string;
  };

  Install?: {
    Alias?: string | [string, ...string[]];
    WantedBy?: string | [string, ...string[]];
    RequiredBy?: string | [string, ...string[]];
    UpheldBy?: string | [string, ...string[]];
    Also?: string | [string, ...string[]];
  };
};

export type SystemdMountSettings = SystemdUnitSettingsBase & {
  Mount: {
    What: string;
    Where: string;
    Type?: string;
    Options?: string;
    LazyUnmount?: string;
  };
};

export type SystemdUnitSettings<T extends SystemdUnitType> = T extends "mount"
  ? SystemdMountSettings
  : SystemdUnitSettingsBase;

export function isMountSettings(
  settings: SystemdUnitSettingsBase
): settings is SystemdMountSettings {
  return (
    "Mount" in settings &&
    "What" in settings.Mount &&
    "Where" in settings.Mount &&
    typeof settings.Mount.What === "string" &&
    typeof settings.Mount.Where === "string"
  );
}

export interface ISystemdManager {
  listUnits(): ResultAsync<SystemdUnit[], ProcessError | ParsingError>;
  listUnits<T extends SystemdUnitType>(
    type: T
  ): ResultAsync<SystemdUnit<T>[], ProcessError | ParsingError>;
  checkEnabled(unit: SystemdUnit): ResultAsync<boolean, ProcessError | ParsingError>;
  enable(unit: SystemdUnit, now?: "now"): ResultAsync<null, ProcessError | ParsingError>;
  disable(unit: SystemdUnit, now?: "now"): ResultAsync<null, ProcessError | ParsingError>;
  checkActive(unit: SystemdUnit): ResultAsync<boolean, ProcessError | ParsingError>;
  start(unit: SystemdUnit): ResultAsync<null, ProcessError | ParsingError>;
  restart(unit: SystemdUnit): ResultAsync<null, ProcessError | ParsingError>;
  stop(unit: SystemdUnit): ResultAsync<null, ProcessError | ParsingError>;
  getSettings<T extends SystemdUnitType>(
    unit: SystemdUnit<T>
  ): ResultAsync<SystemdUnitSettings<T>, ProcessError | ParsingError>;
  setSettings<T extends SystemdUnitType>(
    unit: SystemdUnit<T>,
    settings: SystemdUnitSettings<T>
  ): ResultAsync<null, ProcessError | ParsingError>;
  escape(
    text: string,
    opts?: { path?: boolean; suffix?: SystemdUnitType }
  ): ResultAsync<string, ProcessError>;
  unescape(text: string, opts?: { path?: boolean }): ResultAsync<string, ProcessError>;
  pathToMountUnitName(path: string): ResultAsync<SystemdUnit<"mount">["name"], ProcessError>;
  mountUnitNameToPath(unitName: SystemdUnit<"mount">["name"]): ResultAsync<string, ProcessError>;
}

const SystemdManagerImplementation = (serviceManager: "system" | "user" = "system") => {
  const parser = IniSyntax({ duplicateKey: "append", paramIndent: "" });

  const systemctlCommand = (command: string, ...args: string[]) =>
    new Command(["systemctl", `--${serviceManager}`, command, ...args], {
      superuser: serviceManager === "system" ? "try" : undefined,
    });

  const getUnitProperty = (server: Server, unit: SystemdUnit, property: string) =>
    server
      .execute(systemctlCommand("show", unit.name, `--property=${property}`, "--value"))
      .map((proc) => proc.getStdout().trim());

  const getUnitFilePath = (server: Server, unit: SystemdUnit) =>
    getUnitProperty(server, unit, "FragmentPath");

  const listUnits = <T extends SystemdUnitType>(
    server: Server,
    type?: T
  ): ResultAsync<SystemdUnit<T>[], ProcessError | ParsingError> =>
    server
      .execute(
        systemctlCommand("list-unit-files", ...(type ? [`--type=${type}`] : []), "--output=json")
      )
      .map((proc) => proc.getStdout())
      .andThen((unitFilesJson) => {
        try {
          return ok(JSON.parse(unitFilesJson) as { unit_file: SystemdUnit<T>["name"] }[]);
        } catch (e) {
          if (e instanceof Error) {
            return err(new ParsingError(e.message));
          }
          return err(new ParsingError(`unknown error: ${e}`));
        }
      })
      .map((unitFiles) =>
        unitFiles.map((unitFile) => ({
          name: unitFile.unit_file,
        }))
      );

  const checkEnabled = (
    server: Server,
    unit: SystemdUnit
  ): ResultAsync<boolean, ProcessError | ParsingError> =>
    server
      .execute(systemctlCommand("is-enabled", unit.name), false)
      .map((proc) => proc.exitStatus === 0);

  const enable = (
    server: Server,
    unit: SystemdUnit,
    now?: "now"
  ): ResultAsync<null, ProcessError | ParsingError> =>
    server
      .execute(systemctlCommand("enable", ...(now ? ["--now"] : []), unit.name), true)
      .map(() => null);

  const disable = (
    server: Server,
    unit: SystemdUnit,
    now?: "now"
  ): ResultAsync<null, ProcessError | ParsingError> =>
    server
      .execute(systemctlCommand("disable", ...(now ? ["--now"] : []), unit.name), true)
      .map(() => null);

  const checkActive = (
    server: Server,
    unit: SystemdUnit
  ): ResultAsync<boolean, ProcessError | ParsingError> =>
    server
      .execute(systemctlCommand("is-active", unit.name), false)
      .map((proc) => proc.exitStatus === 0);

  const start = (
    server: Server,
    unit: SystemdUnit
  ): ResultAsync<null, ProcessError | ParsingError> =>
    server.execute(systemctlCommand("start", unit.name), true).map(() => null);

  const restart = (
    server: Server,
    unit: SystemdUnit
  ): ResultAsync<null, ProcessError | ParsingError> =>
    server.execute(systemctlCommand("restart", unit.name), true).map(() => null);

  const stop = (
    server: Server,
    unit: SystemdUnit
  ): ResultAsync<null, ProcessError | ParsingError> =>
    server.execute(systemctlCommand("stop", unit.name), true).map(() => null);

  const getSettings = <T extends SystemdUnitType>(
    server: Server,
    unit: SystemdUnit<T>
  ): ResultAsync<SystemdUnitSettings<T>, ProcessError | ParsingError> =>
    server
      .execute(systemctlCommand("cat", unit.name))
      .map((proc) => proc.getStdout())
      .andThen((unitSettingsText) =>
        parser.apply(unitSettingsText).map((settings) => settings as SystemdUnitSettings<T>)
      )
      .andThen((settings) => {
        if (isMount(unit) && !isMountSettings(settings)) {
          return errAsync(new ParsingError("Systemd mount unit settings malformed"));
        }
        return okAsync(settings);
      });

  const setSettings = <T extends SystemdUnitType>(
    server: Server,
    unit: SystemdUnit<T>,
    settings: SystemdUnitSettings<T>
  ): ResultAsync<null, ProcessError | ParsingError> =>
    isMount(unit) && !isMountSettings(settings)
      ? errAsync(new ParsingError("Systemd mount unit settings malformed"))
      : parser
          .unapply(settings)
          .asyncAndThen((settingsText) =>
            getUnitFilePath(server, unit).andThen((filePath) => {
              if (filePath === "") {
                return errAsync(new ParsingError(`Failed to get unit file path for ${unit.name}`));
              }
              return new File(server, filePath).write(settingsText);
            })
          )
          .map(() => null);

  const escape = (
    server: Server,
    text: string,
    opts?: { path?: boolean; suffix?: SystemdUnitType }
  ): ResultAsync<string, ProcessError> =>
    server
      .execute(
        new Command([
          "systemd-escape",
          ...(opts?.path ? ["--path"] : []),
          ...(opts?.suffix ? [`--suffix=${opts.suffix}`] : []),
          text,
        ])
      )
      .map((proc) => proc.getStdout().trim());

  const unescape = (
    server: Server,
    text: string,
    opts?: { path?: boolean }
  ): ResultAsync<string, ProcessError> =>
    server
      .execute(
        new Command(["systemd-escape", "--unescape", ...(opts?.path ? ["--path"] : []), text])
      )
      .map((proc) => proc.getStdout().trim());

  const pathToMountUnitName = (
    server: Server,
    path: string
  ): ResultAsync<SystemdUnit<"mount">["name"], ProcessError> =>
    escape(server, path, { path: true }).map<`${string}.mount`>(
      (mountUnitName) => `${mountUnitName}.mount`
    );
  const mountUnitNameToPath = (
    server: Server,
    unitName: SystemdUnit<"mount">["name"]
  ): ResultAsync<string, ProcessError> =>
    unescape(server, unitName.replace(/\.mount$/, ""), { path: true });

  return {
    listUnits,
    checkEnabled,
    enable,
    disable,
    checkActive,
    start,
    restart,
    stop,
    getSettings,
    setSettings,
    escape,
    unescape,
    pathToMountUnitName,
    mountUnitNameToPath,
  };
};

export function SystemdManagerSingleServer(
  server: Server,
  serviceManager: "system" | "user" = "system"
): ISystemdManager {
  const impl = SystemdManagerImplementation(serviceManager);
  return {
    listUnits: <T extends SystemdUnitType>(type?: T) => impl.listUnits(server, type),
    checkEnabled: (...args: Parameters<ISystemdManager["checkEnabled"]>) =>
      impl.checkEnabled(server, ...args),
    enable: (...args: Parameters<ISystemdManager["enable"]>) => impl.enable(server, ...args),
    disable: (...args: Parameters<ISystemdManager["disable"]>) => impl.disable(server, ...args),
    checkActive: (...args: Parameters<ISystemdManager["checkActive"]>) =>
      impl.checkActive(server, ...args),
    start: (...args: Parameters<ISystemdManager["start"]>) => impl.start(server, ...args),
    restart: (...args: Parameters<ISystemdManager["restart"]>) => impl.restart(server, ...args),
    stop: (...args: Parameters<ISystemdManager["stop"]>) => impl.stop(server, ...args),
    getSettings: <T extends SystemdUnitType>(unit: SystemdUnit<T>) =>
      impl.getSettings(server, unit),
    setSettings: <T extends SystemdUnitType>(
      unit: SystemdUnit<T>,
      settings: SystemdUnitSettings<T>
    ) => impl.setSettings(server, unit, settings),
    escape: (...args: Parameters<ISystemdManager["escape"]>) => impl.escape(server, ...args),
    unescape: (...args: Parameters<ISystemdManager["unescape"]>) => impl.unescape(server, ...args),
    pathToMountUnitName: (...args: Parameters<ISystemdManager["pathToMountUnitName"]>) =>
      impl.pathToMountUnitName(server, ...args),
    mountUnitNameToPath: (...args: Parameters<ISystemdManager["mountUnitNameToPath"]>) =>
      impl.mountUnitNameToPath(server, ...args),
  };
}

export function SystemdManagerClustered(
  servers: [Server, ...Server[]],
  serviceManager: "system" | "user" = "system"
): ISystemdManager {
  const getterServer = servers[0];
  const impl = SystemdManagerImplementation(serviceManager);
  return {
    listUnits: <T extends SystemdUnitType>(type?: T) => impl.listUnits(getterServer, type),
    checkEnabled: (...args: Parameters<ISystemdManager["checkEnabled"]>) =>
      ResultAsync.combine(servers.map((server) => impl.checkEnabled(server, ...args))).map(
        (results) => results.every((r) => r)
      ),
    enable: (...args: Parameters<ISystemdManager["enable"]>) =>
      ResultAsync.combine(servers.map((server) => impl.enable(server, ...args))).map(() => null),
    disable: (...args: Parameters<ISystemdManager["disable"]>) =>
      ResultAsync.combine(servers.map((server) => impl.disable(server, ...args))).map(() => null),
    checkActive: (...args: Parameters<ISystemdManager["checkActive"]>) =>
      ResultAsync.combine(servers.map((server) => impl.checkActive(server, ...args))).map(
        (results) => results.every((r) => r)
      ),
    start: (...args: Parameters<ISystemdManager["start"]>) =>
      ResultAsync.combine(servers.map((server) => impl.start(server, ...args))).map(() => null),
    restart: (...args: Parameters<ISystemdManager["restart"]>) =>
      ResultAsync.combine(servers.map((server) => impl.restart(server, ...args))).map(() => null),
    stop: (...args: Parameters<ISystemdManager["stop"]>) =>
      ResultAsync.combine(servers.map((server) => impl.stop(server, ...args))).map(() => null),
    getSettings: <T extends SystemdUnitType>(unit: SystemdUnit<T>) =>
      impl.getSettings(getterServer, unit),
    setSettings: <T extends SystemdUnitType>(
      unit: SystemdUnit<T>,
      settings: SystemdUnitSettings<T>
    ) =>
      ResultAsync.combine(servers.map((server) => impl.setSettings(server, unit, settings))).map(
        () => null
      ),
    escape: (...args: Parameters<ISystemdManager["escape"]>) => impl.escape(getterServer, ...args),
    unescape: (...args: Parameters<ISystemdManager["unescape"]>) =>
      impl.unescape(getterServer, ...args),
    pathToMountUnitName: (...args: Parameters<ISystemdManager["pathToMountUnitName"]>) =>
      impl.pathToMountUnitName(getterServer, ...args),
    mountUnitNameToPath: (...args: Parameters<ISystemdManager["mountUnitNameToPath"]>) =>
      impl.mountUnitNameToPath(getterServer, ...args),
  };
}

export function getSystemdManager(
  clusterScope: Server | [Server, ...Server[]],
  serviceManager: "system" | "user" = "system"
): ISystemdManager {
  clusterScope = [clusterScope].flat() as [Server, ...Server[]];
  if (clusterScope.length === 1) {
    return SystemdManagerSingleServer(clusterScope[0], serviceManager);
  }
  return SystemdManagerClustered(clusterScope, serviceManager);
}
