import {
  type IniConfigData,
  ProcessError,
  ParsingError,
  type Server,
  Command,
  getServer,
  IniSyntax,
  File,
  RegexSnippets,
  FileSystemNode,
  type SyntaxParser,
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
  setServiceManager(serviceManager: "system" | "user"): this;
  getServiceManager(): "system" | "user";
  listUnits(): ResultAsync<SystemdUnit[], ProcessError | ParsingError>;
  listUnits<T extends SystemdUnitType>(
    type: T
  ): ResultAsync<SystemdUnit<T>[], ProcessError | ParsingError>;
  createUnit<T extends SystemdUnitType>(
    unit: SystemdUnit<T>,
    settings: SystemdUnitSettings<T>
  ): ResultAsync<typeof unit, ProcessError | ParsingError>;
  removeUnit(unit: SystemdUnit): ResultAsync<typeof unit, ProcessError | ParsingError>;
  checkEnabled(unit: SystemdUnit): ResultAsync<boolean, ProcessError | ParsingError>;
  enable(unit: SystemdUnit, now?: "now"): ResultAsync<typeof unit, ProcessError | ParsingError>;
  disable(unit: SystemdUnit, now?: "now"): ResultAsync<typeof unit, ProcessError | ParsingError>;
  checkActive(unit: SystemdUnit): ResultAsync<boolean, ProcessError | ParsingError>;
  start(unit: SystemdUnit): ResultAsync<typeof unit, ProcessError | ParsingError>;
  restart(unit: SystemdUnit): ResultAsync<typeof unit, ProcessError | ParsingError>;
  stop(unit: SystemdUnit): ResultAsync<typeof unit, ProcessError | ParsingError>;
  getSettings<T extends SystemdUnitType>(
    unit: SystemdUnit<T>
  ): ResultAsync<SystemdUnitSettings<T>, ProcessError | ParsingError>;
  setSettings<T extends SystemdUnitType>(
    unit: SystemdUnit<T>,
    settings: SystemdUnitSettings<T>
  ): ResultAsync<typeof unit, ProcessError | ParsingError>;
  escape(
    text: string,
    opts?: { path?: boolean; suffix?: SystemdUnitType }
  ): ResultAsync<string, ProcessError>;
  unescape(text: string, opts?: { path?: boolean }): ResultAsync<string, ProcessError>;
  pathToMountUnitName(path: string): ResultAsync<SystemdUnit<"mount">["name"], ProcessError>;
  mountUnitNameToPath(unitName: SystemdUnit<"mount">["name"]): ResultAsync<string, ProcessError>;
}

export class SystemdManagerSingleServer implements ISystemdManager {
  private unitFileDirectory: string;
  private iniParser: SyntaxParser<IniConfigData<string | [string, ...string[]]>>;

  constructor(
    private server: Server,
    private serviceManager: "system" | "user" = "system"
  ) {
    this.unitFileDirectory = `/etc/systemd/${serviceManager}`;
    this.iniParser = IniSyntax({ duplicateKey: "append", paramIndent: "" });
  }

  private systemctlCommand(command: string, ...args: string[]) {
    return new Command(["systemctl", `--${this.serviceManager}`, command, ...args], {
      superuser: this.serviceManager === "system" ? "try" : undefined,
    });
  }

  private getUnitProperty(unit: SystemdUnit, property: string) {
    return this.server
      .execute(this.systemctlCommand("show", unit.name, `--property=${property}`, "--value"))
      .map((proc) => proc.getStdout().trim());
  }

  private getUnitFilePath(unit: SystemdUnit) {
    return this.getUnitProperty(unit, "FragmentPath").andThen((filePath) =>
      filePath === ""
        ? err(new ParsingError(`Failed to get unit file path for ${unit.name}`))
        : ok(filePath)
    );
  }

  setServiceManager(serviceManager: "system" | "user") {
    this.serviceManager = serviceManager;
    this.unitFileDirectory = `/etc/systemd/${serviceManager}`;
    return this;
  }

  getServiceManager() {
    return this.serviceManager;
  }

  listUnits<T extends SystemdUnitType>(
    type?: T
  ): ResultAsync<SystemdUnit<T>[], ProcessError | ParsingError> {
    return this.server
      .execute(
        this.systemctlCommand(
          "list-unit-files",
          ...(type ? [`--type=${type}`] : []),
          "--output=json"
        )
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
  }

  createUnit<T extends SystemdUnitType>(
    unit: SystemdUnit<T>,
    settings: SystemdUnitSettings<T>
  ): ResultAsync<typeof unit, ProcessError | ParsingError> {
    return new File(this.server, `${this.unitFileDirectory}/${unit.name}`)
      .assertExists(false)
      .andThen((unitFile) => unitFile.create(false, { superuser: "try" }))
      .andThen(() => this.setSettings(unit, settings))
      .map(() => unit);
  }

  removeUnit(unit: SystemdUnit): ResultAsync<typeof unit, ProcessError | ParsingError> {
    return this.checkActive(unit)
      .andThen((isActive) =>
        isActive ? err(new ProcessError(`Cannot remove active unit: ${unit.name}`)) : ok(unit)
      )
      .andThen((unit) =>
        this.checkEnabled(unit).andThen((isEnabled) =>
          isEnabled ? err(new ProcessError(`Cannot remove enabled unit: ${unit.name}`)) : ok(unit)
        )
      )
      .andThen((unit) => this.getUnitFilePath(unit).map((path) => new File(this.server, path)))
      .andThen((unitFile) => unitFile.assertIsFile())
      .andThen((unitFile) => unitFile.remove({ superuser: "try" }))
      .andThen(() => this.server.execute(this.systemctlCommand("daemon-reload")))
      .map(() => unit);
  }

  checkEnabled(unit: SystemdUnit): ResultAsync<boolean, ProcessError | ParsingError> {
    return this.server
      .execute(this.systemctlCommand("is-enabled", unit.name), false)
      .map((proc) => proc.exitStatus === 0);
  }

  enable(unit: SystemdUnit, now?: "now"): ResultAsync<typeof unit, ProcessError | ParsingError> {
    return this.server
      .execute(this.systemctlCommand("enable", ...(now ? ["--now"] : []), unit.name), true)
      .map(() => unit);
  }

  disable(unit: SystemdUnit, now?: "now"): ResultAsync<typeof unit, ProcessError | ParsingError> {
    return this.server
      .execute(this.systemctlCommand("disable", ...(now ? ["--now"] : []), unit.name), true)
      .map(() => unit);
  }

  checkActive(unit: SystemdUnit): ResultAsync<boolean, ProcessError | ParsingError> {
    return this.server
      .execute(this.systemctlCommand("is-active", unit.name), false)
      .map((proc) => proc.exitStatus === 0);
  }

  start(unit: SystemdUnit): ResultAsync<typeof unit, ProcessError | ParsingError> {
    return this.server.execute(this.systemctlCommand("start", unit.name), true).map(() => unit);
  }

  restart(unit: SystemdUnit): ResultAsync<typeof unit, ProcessError | ParsingError> {
    return this.server.execute(this.systemctlCommand("restart", unit.name), true).map(() => unit);
  }

  stop(unit: SystemdUnit): ResultAsync<typeof unit, ProcessError | ParsingError> {
    return this.server.execute(this.systemctlCommand("stop", unit.name), true).map(() => unit);
  }

  getSettings<T extends SystemdUnitType>(
    unit: SystemdUnit<T>
  ): ResultAsync<SystemdUnitSettings<T>, ProcessError | ParsingError> {
    return this.server
      .execute(this.systemctlCommand("cat", unit.name))
      .map((proc) => proc.getStdout())
      .andThen((unitSettingsText) =>
        this.iniParser.apply(unitSettingsText).map((settings) => settings as SystemdUnitSettings<T>)
      )
      .andThen((settings) => {
        if (isMount(unit) && !isMountSettings(settings)) {
          return errAsync(new ParsingError("Systemd mount unit settings malformed"));
        }
        return okAsync(settings);
      });
  }

  setSettings<T extends SystemdUnitType>(
    unit: SystemdUnit<T>,
    settings: SystemdUnitSettings<T>
  ): ResultAsync<typeof unit, ProcessError | ParsingError> {
    return isMount(unit) && !isMountSettings(settings)
      ? errAsync(new ParsingError("Systemd mount unit settings malformed"))
      : this.iniParser
          .unapply(settings)
          .asyncAndThen((settingsText) =>
            this.getUnitFilePath(unit)
              .andThen((filePath) =>
                filePath.startsWith("/run")
                  ? err(new ProcessError(`Tried to set settings on volatile unit: ${filePath}`))
                  : ok(filePath)
              )
              .andThen((filePath) =>
                new File(this.server, filePath).write(settingsText, { superuser: "try" })
              )
          )
          .andThen(() => this.server.execute(this.systemctlCommand("daemon-reload")))
          .map(() => unit);
  }

  escape(
    text: string,
    opts?: { path?: boolean; suffix?: SystemdUnitType }
  ): ResultAsync<string, ProcessError> {
    return this.server
      .execute(
        new Command([
          "systemd-escape",
          ...(opts?.path ? ["--path"] : []),
          ...(opts?.suffix ? [`--suffix=${opts.suffix}`] : []),
          text,
        ])
      )
      .map((proc) => proc.getStdout().trim());
  }

  unescape(text: string, opts?: { path?: boolean }): ResultAsync<string, ProcessError> {
    return this.server
      .execute(
        new Command(["systemd-escape", "--unescape", ...(opts?.path ? ["--path"] : []), text])
      )
      .map((proc) => proc.getStdout().trim());
  }

  pathToMountUnitName(path: string): ResultAsync<SystemdUnit<"mount">["name"], ProcessError> {
    return this.escape(path, { path: true }).map<`${string}.mount`>(
      (mountUnitName) => `${mountUnitName}.mount`
    );
  }
  mountUnitNameToPath(unitName: SystemdUnit<"mount">["name"]): ResultAsync<string, ProcessError> {
    return this.unescape(unitName.replace(/\.mount$/, ""), { path: true });
  }
}

export class SystemdManagerClustered implements ISystemdManager {
  private managers: [SystemdManagerSingleServer, ...SystemdManagerSingleServer[]];
  private getterManager: SystemdManagerSingleServer;

  constructor(servers: [Server, ...Server[]], serviceManager: "system" | "user" = "system") {
    this.managers = servers.map((s) => new SystemdManagerSingleServer(s, serviceManager)) as [
      SystemdManagerSingleServer,
      ...SystemdManagerSingleServer[],
    ];
    this.getterManager = this.managers[0];
  }

  setServiceManager(serviceManager: "system" | "user") {
    this.managers.forEach((m) => m.setServiceManager(serviceManager));
    return this;
  }

  getServiceManager() {
    return this.getterManager.getServiceManager();
  }

  listUnits<T extends SystemdUnitType>(type?: T) {
    return this.getterManager.listUnits(type);
  }

  createUnit<T extends SystemdUnitType>(unit: SystemdUnit<T>, settings: SystemdUnitSettings<T>) {
    return ResultAsync.combine(this.managers.map((m) => m.createUnit(unit, settings))).map(
      ([unit]) => unit!
    );
  }

  removeUnit(...args: Parameters<ISystemdManager["removeUnit"]>) {
    return ResultAsync.combine(this.managers.map((m) => m.removeUnit(...args))).map(
      ([unit]) => unit!
    );
  }

  checkEnabled(...args: Parameters<ISystemdManager["checkEnabled"]>) {
    return ResultAsync.combine(this.managers.map((m) => m.checkEnabled(...args))).map((results) =>
      results.every((r) => r)
    );
  }

  enable(...args: Parameters<ISystemdManager["enable"]>) {
    return ResultAsync.combine(this.managers.map((m) => m.enable(...args))).map(([unit]) => unit!);
  }

  disable(...args: Parameters<ISystemdManager["disable"]>) {
    return ResultAsync.combine(this.managers.map((m) => m.disable(...args))).map(([unit]) => unit!);
  }

  checkActive(...args: Parameters<ISystemdManager["checkActive"]>) {
    return ResultAsync.combine(this.managers.map((m) => m.checkActive(...args))).map((results) =>
      results.every((r) => r)
    );
  }

  start(...args: Parameters<ISystemdManager["start"]>) {
    return ResultAsync.combine(this.managers.map((m) => m.start(...args))).map(([unit]) => unit!);
  }

  restart(...args: Parameters<ISystemdManager["restart"]>) {
    return ResultAsync.combine(this.managers.map((m) => m.restart(...args))).map(([unit]) => unit!);
  }

  stop(...args: Parameters<ISystemdManager["stop"]>) {
    return ResultAsync.combine(this.managers.map((m) => m.stop(...args))).map(([unit]) => unit!);
  }

  getSettings<T extends SystemdUnitType>(unit: SystemdUnit<T>) {
    return this.getterManager.getSettings(unit);
  }

  setSettings<T extends SystemdUnitType>(unit: SystemdUnit<T>, settings: SystemdUnitSettings<T>) {
    return ResultAsync.combine(this.managers.map((m) => m.setSettings(unit, settings))).map(
      ([unit]) => unit!
    );
  }

  escape(...args: Parameters<ISystemdManager["escape"]>) {
    return this.getterManager.escape(...args);
  }

  unescape(...args: Parameters<ISystemdManager["unescape"]>) {
    return this.getterManager.unescape(...args);
  }

  pathToMountUnitName(...args: Parameters<ISystemdManager["pathToMountUnitName"]>) {
    return this.getterManager.pathToMountUnitName(...args);
  }

  mountUnitNameToPath(...args: Parameters<ISystemdManager["mountUnitNameToPath"]>) {
    return this.getterManager.mountUnitNameToPath(...args);
  }
}

export function getSystemdManager(
  server: Server | [Server],
  serviceManager?: "system" | "user"
): SystemdManagerSingleServer;
export function getSystemdManager(
  servers: [Server, ...Server[]],
  serviceManager?: "system" | "user"
): SystemdManagerClustered;
export function getSystemdManager(
  servers: Server | [Server, ...Server[]],
  serviceManager: "system" | "user" = "system"
): SystemdManagerSingleServer | SystemdManagerClustered {
  if (Array.isArray(servers)) {
    return servers.length === 1
      ? new SystemdManagerSingleServer(servers[0], serviceManager)
      : new SystemdManagerClustered(servers, serviceManager);
  }
  return new SystemdManagerSingleServer(servers, serviceManager);
}
