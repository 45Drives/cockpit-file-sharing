import { SystemdManagerSingleServer, type SystemdMountSettings } from "@/common/systemd-manager";
import {
  Command,
  FileSystemNode,
  ParsingError,
  ProcessError,
  StringToIntCaster,
  safeJsonParse,
  type CommandOptions,
  type Server,
} from "@45drives/houston-common-lib";
import { ResultAsync, err, ok } from "neverthrow";
import { Maybe } from "monet";

export interface ICephOptionManager {
  pathIsMountpoint(path: string): ResultAsync<boolean, ProcessError | ParsingError>;
  pathMountpointManagedByFileSharing(
    path: string
  ): ResultAsync<boolean, ProcessError | ParsingError>;
  remountPath(path: string): ResultAsync<this, ProcessError | ParsingError>;
  removeRemount(path: string): ResultAsync<this, ProcessError | ParsingError>;
  getQuotaMaxBytes(path: string): ResultAsync<Maybe<number>, ProcessError | ParsingError>;
  setQuotaMaxBytes(
    path: string,
    quotaMaxBytes: number
  ): ResultAsync<this, ProcessError | ParsingError>;
  removeQuotaMaxBytes(path: string): ResultAsync<this, ProcessError | ParsingError>;
  getLayoutPools(): ResultAsync<string[], ProcessError | ParsingError>;
  getLayoutPool(path: string): ResultAsync<Maybe<string>, ProcessError | ParsingError>;
  setLayoutPool(path: string, layoutPool: string): ResultAsync<this, ProcessError | ParsingError>;
  removeLayoutPool(path: string): ResultAsync<this, ProcessError | ParsingError>;
}

const SYSTEMD_MOUNT_DESCRIPTION = "share remount created by cockpit-file-sharing";
const CEPH_QUOTA_MAX_BYTES_ATTRIBUTE_NAME = "ceph.quota.max_bytes";
const CEPH_DIR_LAYOUT_ATTRIBUTE_NAME = "ceph.dir.layout";
const CEPH_DIR_LAYOUT_POOL_ATTRIBUTE_NAME = CEPH_DIR_LAYOUT_ATTRIBUTE_NAME + ".pool";

export class CephOptionManagerSingleServer implements ICephOptionManager {
  private systemdManager: SystemdManagerSingleServer;
  private commandOptions: CommandOptions;
  private stringToIntCaster = StringToIntCaster(10);
  constructor(
    private server: Server,
    private clientName: `client.${string}`
  ) {
    this.systemdManager = new SystemdManagerSingleServer(this.server, "system");
    this.commandOptions = { superuser: "try" };
  }

  private getResolvedNode(path: string) {
    return new FileSystemNode(this.server, path).resolve(true);
  }

  private getMountUnit(pathNode: FileSystemNode) {
    return this.systemdManager.pathToMountUnitName(pathNode.path).map((name) => ({ name }));
  }

  pathIsMountpoint(path: string) {
    return this.getResolvedNode(path)
      .andThen((node) => node.getFilesystemMount().map((mount) => ({ node, mount })))
      .map(({ node, mount }) => node.path === mount.mountpoint);
  }

  pathMountpointManagedByFileSharing(path: string) {
    return this.getResolvedNode(path)
      .andThen((node) => this.getMountUnit(node))
      .andThen((unit) => this.systemdManager.getSettings(unit))
      .map((mountSettings) => mountSettings.Unit?.Description === SYSTEMD_MOUNT_DESCRIPTION);
  }

  private enableRemount(pathNode: FileSystemNode) {
    return this.getMountUnit(pathNode).andThen((mountUnit) =>
      this.systemdManager.enable(mountUnit, "now")
    );
  }

  private createRemount(pathNode: FileSystemNode) {
    const ancestorMountpoint = pathNode
      .getFilesystemMount()
      .andThen(({ filesystem: { type }, mountpoint }) =>
        type !== "ceph"
          ? err(new ProcessError(`Not a ceph filesystem: ${mountpoint}`))
          : ok(mountpoint)
      );
    const ancestorMountSettings = ancestorMountpoint
      .andThen((ancestorMountpoint) => this.getResolvedNode(ancestorMountpoint))
      .andThen((ancestorNode) => this.getMountUnit(ancestorNode))
      .andThen((ancestorMountUnit) => this.systemdManager.getSettings(ancestorMountUnit));
    const newMountpointSource = ancestorMountSettings.andThen((ancestorMountSettings) => {
      const ancestorMountpoint = ancestorMountSettings.Mount.Where;
      if (!pathNode.path.startsWith(ancestorMountpoint)) {
        return err(
          new ProcessError(
            `Share path is not within ancestor mount path:\n${pathNode.path}\n${ancestorMountpoint}`
          )
        );
      }
      const pathRelativeToAncestorMountpoint = pathNode.path.replace(ancestorMountpoint, "");
      if (!pathRelativeToAncestorMountpoint.startsWith("/")) {
        return err(
          new ProcessError(
            `Path relative to ancestor mountpoint doesn't start with '/': ${pathRelativeToAncestorMountpoint}`
          )
        );
      }
      return ok(
        ancestorMountSettings.Mount.What +
          (ancestorMountSettings.Mount.What.endsWith("/")
            ? pathRelativeToAncestorMountpoint.slice(1)
            : pathRelativeToAncestorMountpoint)
      );
    });
    const newMountSettings = ResultAsync.combine([ancestorMountSettings, newMountpointSource]).map(
      ([ancestorMountSettings, newMountpointSource]) => {
        return {
          Unit: {
            DefaultDependencies: "no",
            After: ["remote-fs-pre.target", "network.target", "network-online.target"],
            Wants: ["network.target", "network-online.target"],
            Conflicts: ["umount.target"],
            Before: ["umount.target", "ctdb.service"],
            Description: SYSTEMD_MOUNT_DESCRIPTION,
          },
          Mount: {
            What: newMountpointSource,
            Where: pathNode.path,
            Options: ancestorMountSettings.Mount.Options,
            Type: "ceph",
            LazyUnmount: "true",
          },
          Install: {
            WantedBy: "remote-fs.target",
          },
        } as SystemdMountSettings;
      }
    );
    return ResultAsync.combine([this.getMountUnit(pathNode), newMountSettings]).andThen(
      ([mountUnit, mountSettings]) =>
        this.systemdManager
          .createUnit(mountUnit, mountSettings)
          .andThen((unit) => this.systemdManager.enable(unit, "now"))
    );
  }

  remountPath(path: string): ResultAsync<this, ProcessError | ParsingError> {
    return this.getResolvedNode(path)
      .andThen((pathNode) =>
        this.pathMountpointManagedByFileSharing(path)
          .andThen((managedbyFileSharing) =>
            managedbyFileSharing
              ? this.enableRemount(pathNode)
              : err(new Error("Mount not managed by File Sharing!"))
          )
          .orElse((e) => (e instanceof ProcessError ? this.createRemount(pathNode) : err(e)))
      )
      .map(() => this);
  }

  removeRemount(path: string): ResultAsync<this, ProcessError | ParsingError> {
    return this.getResolvedNode(path)
      .andThen((node) => this.getMountUnit(node))
      .andThen((unit) => this.systemdManager.disable(unit, "now"))
      .andThen((unit) => this.systemdManager.removeUnit(unit))
      .map(() => this);
  }

  getQuotaMaxBytes(path: string): ResultAsync<Maybe<number>, ProcessError | ParsingError> {
    return new FileSystemNode(this.server, path)
      .getExtendedAttribute(CEPH_QUOTA_MAX_BYTES_ATTRIBUTE_NAME, this.commandOptions)
      .map((attr) => attr.flatMap(this.stringToIntCaster));
  }

  setQuotaMaxBytes(
    path: string,
    quotaMaxBytes: number
  ): ResultAsync<this, ProcessError | ParsingError> {
    return new FileSystemNode(this.server, path)
      .setExtendedAttribute(
        CEPH_QUOTA_MAX_BYTES_ATTRIBUTE_NAME,
        quotaMaxBytes.toString(10),
        this.commandOptions
      )
      .map(() => this);
  }

  removeQuotaMaxBytes(path: string): ResultAsync<this, ProcessError | ParsingError> {
    return new FileSystemNode(this.server, path)
      .setExtendedAttribute(CEPH_QUOTA_MAX_BYTES_ATTRIBUTE_NAME, "0", this.commandOptions)
      .map(() => this);
  }

  getLayoutPools(): ResultAsync<string[], ProcessError | ParsingError> {
    return this.server
      .execute(
        new Command(
          [
            "ceph",
            "fs",
            "status",
            `--keyring=/etc/ceph/ceph.${this.clientName}.keyring`,
            "--name",
            this.clientName,
            "--format=json",
          ],
          this.commandOptions
        )
      )
      .orElse(() =>
        // fall back to default keyring
        this.server.execute(
          new Command(["ceph", "fs", "status", "--format=json"], this.commandOptions)
        )
      )
      .map((proc) => proc.getStdout())
      .andThen((jsonText) =>
        safeJsonParse<{ pools: { name: string; type: string }[] }>(jsonText).andThen(({ pools }) =>
          pools && pools.every((pool) => pool.name !== undefined && pool.type !== undefined)
            ? ok(pools)
            : err(new ParsingError(`Malformed output from ceph fs status:\n${jsonText}`))
        )
      )
      .map((pools) => pools.filter((pool) => pool.type === "data").map((pool) => pool.name));
  }

  getLayoutPool(path: string): ResultAsync<Maybe<string>, ProcessError | ParsingError> {
    return new FileSystemNode(this.server, path).getExtendedAttribute(
      CEPH_DIR_LAYOUT_POOL_ATTRIBUTE_NAME,
      this.commandOptions
    );
  }

  setLayoutPool(path: string, layoutPool: string): ResultAsync<this, ProcessError | ParsingError> {
    return new FileSystemNode(this.server, path)
      .setExtendedAttribute(CEPH_DIR_LAYOUT_POOL_ATTRIBUTE_NAME, layoutPool, this.commandOptions)
      .map(() => this);
  }

  removeLayoutPool(path: string): ResultAsync<this, ProcessError | ParsingError> {
    return new FileSystemNode(this.server, path)
      .removeExtendedAttribute(CEPH_DIR_LAYOUT_ATTRIBUTE_NAME, this.commandOptions)
      .map(() => this);
  }
}

export class CephOptionManagerClustered implements ICephOptionManager {
  private managers: [CephOptionManagerSingleServer, ...CephOptionManagerSingleServer[]];
  private getterManager: CephOptionManagerSingleServer;

  constructor(servers: [Server, ...Server[]], clientName: `client.${string}`) {
    this.managers = servers.map((s) => new CephOptionManagerSingleServer(s, clientName)) as [
      CephOptionManagerSingleServer,
      ...CephOptionManagerSingleServer[],
    ];
    this.getterManager = this.managers[0];
  }

  pathIsMountpoint(path: string): ResultAsync<boolean, ProcessError | ParsingError> {
    return ResultAsync.combine(this.managers.map((m) => m.pathIsMountpoint(path))).map((rs) =>
      rs.every((r) => r)
    );
  }

  pathMountpointManagedByFileSharing(
    path: string
  ): ResultAsync<boolean, ProcessError | ParsingError> {
    return ResultAsync.combine(
      this.managers.map((m) => m.pathMountpointManagedByFileSharing(path))
    ).map((rs) => rs.every((r) => r));
  }

  remountPath(path: string): ResultAsync<this, ProcessError | ParsingError> {
    return ResultAsync.combine(this.managers.map((m) => m.remountPath(path))).map(() => this);
  }

  removeRemount(path: string): ResultAsync<this, ProcessError | ParsingError> {
    return ResultAsync.combine(this.managers.map((m) => m.removeRemount(path))).map(() => this);
  }

  getQuotaMaxBytes(path: string): ResultAsync<Maybe<number>, ProcessError | ParsingError> {
    return this.getterManager.getQuotaMaxBytes(path);
  }

  setQuotaMaxBytes(
    path: string,
    quotaMaxBytes: number
  ): ResultAsync<this, ProcessError | ParsingError> {
    return this.getterManager.setQuotaMaxBytes(path, quotaMaxBytes).map(() => this);
  }

  removeQuotaMaxBytes(path: string): ResultAsync<this, ProcessError | ParsingError> {
    return this.getterManager.removeQuotaMaxBytes(path).map(() => this);
  }

  getLayoutPools(): ResultAsync<string[], ProcessError | ParsingError> {
    return this.getterManager.getLayoutPools();
  }

  getLayoutPool(path: string): ResultAsync<Maybe<string>, ProcessError | ParsingError> {
    return this.getterManager.getLayoutPool(path);
  }

  setLayoutPool(path: string, layoutPool: string): ResultAsync<this, ProcessError | ParsingError> {
    return this.getterManager.setLayoutPool(path, layoutPool).map(() => this);
  }

  removeLayoutPool(path: string): ResultAsync<this, ProcessError | ParsingError> {
    return this.getterManager.removeLayoutPool(path).map(() => this);
  }
}

export function getCephOptionManager(
  server: Server | [Server],
  clientName: `client.${string}`
): CephOptionManagerSingleServer;
export function getCephOptionManager(
  servers: [Server, ...Server[]],
  clientName: `client.${string}`
): CephOptionManagerClustered;
export function getCephOptionManager(
  servers: Server | [Server, ...Server[]],
  clientName: `client.${string}`
): ICephOptionManager {
  if (Array.isArray(servers)) {
    return servers.length === 1
      ? new CephOptionManagerSingleServer(servers[0], clientName)
      : new CephOptionManagerClustered(servers, clientName);
  }
  return new CephOptionManagerSingleServer(servers, clientName);
}
