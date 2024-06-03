<script setup lang="ts">
import {
  getSystemdManager,
  type SystemdMountSettings,
  type SystemdUnit,
} from "@/common/systemd-manager";
import { inject, defineProps, computed, ref, watchEffect, type Ref, type ComputedRef } from "vue";
import { clusterScopeInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";
import { useMountpointInfo } from "@/common/useMountpointInfo";
import { ResultAsync, okAsync, safeTry, ok, err, Result } from "neverthrow";
import {
  Command,
  ExitedProcess,
  FileSystemNode,
  ParsingError,
  ProcessError,
  Server,
  StringToIntCaster,
  getServer,
  safeJsonParse,
  type CommandOptions,
} from "@45drives/houston-common-lib";
import {
  wrapActions,
  ToggleSwitch,
  reportError,
  InputLabelWrapper,
  InputField,
} from "@45drives/houston-common-ui";
import {
  reportSuccess,
  assertConfirm,
  computedResult,
  SelectMenu,
  type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { Maybe, Some, None } from "monet";

const _ = cockpit.gettext;

const props = defineProps<{
  path: string;
}>();

const getServerResult = getServer();

const clusterScope = inject(clusterScopeInjectionKey);
if (clusterScope === undefined) {
  throw new Error("clusterScope not provided!");
}

const path = computed(() => props.path);

// PATH MOUNT/REMOUNTING

const SYSTEMD_MOUNT_DESCRIPTION = "share remount created by cockpit-file-sharing";

const pathMountInfoFactory = (server: Server) => {
  const getResolvedNode = (path: string) => new FileSystemNode(server, path).resolve(true);

  const pathIsMountpoint = (path: string) =>
    getResolvedNode(path)
      .andThen((node) => node.getFilesystemMount().map((mount) => ({ node, mount })))
      .map(({ node, mount }) => node.path === mount.mountpoint);

  const sdm = getSystemdManager([server], "system");

  const getSystemdMountSettings = (path: string) =>
    getResolvedNode(path)
      .andThen((node) => sdm.pathToMountUnitName(node.path))
      .andThen((mountUnitName) => sdm.getSettings({ name: mountUnitName }));

  const pathRemountedByFileSharing = (path: string) =>
    getSystemdMountSettings(path).map(
      (mountSettings) => mountSettings.Unit?.Description === SYSTEMD_MOUNT_DESCRIPTION
    );

  return {
    pathIsMountpoint,
    pathRemountedByFileSharing,
  };
};

const [mountInfoPerServer, updateMountInfoPerServer] = computedResult(
  () =>
    clusterScope.map((servers) =>
      servers.map((server) => {
        const f = pathMountInfoFactory(server);
        const [pathIsMountpoint, updatePathIsMountpoint] = computedResult(
          () => f.pathIsMountpoint(path.value),
          false
        );
        const [pathRemountedByFileSharing, updatePathRemoupathRemountedByFileSharing] =
          computedResult(() => f.pathRemountedByFileSharing(path.value), false);

        return {
          server,
          pathIsMountpoint,
          pathRemountedByFileSharing,
        };
      })
    ),
  []
);

const pathIsMountpoint = computed(() =>
  mountInfoPerServer.value.every(({ pathIsMountpoint }) => pathIsMountpoint)
);

const pathRemountedByFileSharing = computed(() =>
  mountInfoPerServer.value.every(({ pathRemountedByFileSharing }) => pathRemountedByFileSharing)
);

const systemdManager = clusterScope.map((scope) => getSystemdManager(scope, "system"));

const createRemounts = (path: string) =>
  systemdManager
    .andThen((sdm) => {
      const resolvedNode = clusterScope.andThen((servers) =>
        new FileSystemNode(servers[0], path).resolve(true)
      );
      const ancestorMount = resolvedNode.andThen((node) => node.getFilesystemMount());
      const ancestorMountSettings = ancestorMount
        .andThen(({ filesystem: { type }, mountpoint }) =>
          type !== "ceph"
            ? err(new ProcessError(`Not a ceph filesystem: ${mountpoint}`))
            : sdm.pathToMountUnitName(mountpoint)
        )
        .andThen((ancestorMountUnitName) => sdm.getSettings({ name: ancestorMountUnitName }));
      const newMountSettings = ResultAsync.combine([resolvedNode, ancestorMountSettings]).andThen(
        ([resolvedNode, ancestorMountSettings]) => {
          const ancestorMountpoint = ancestorMountSettings.Mount.Where;
          if (!resolvedNode.path.startsWith(ancestorMountpoint)) {
            return err(
              new ProcessError(
                `Share path is not within ancestor mount path:\n${resolvedNode.path}\n${ancestorMountpoint}`
              )
            );
          }
          const pathRelativeToAncestorMountpoint = resolvedNode.path.replace(
            ancestorMountpoint,
            ""
          );
          if (!pathRelativeToAncestorMountpoint.startsWith("/")) {
            return err(
              new ProcessError(
                `Path relative to ancestor mountpoint doesn't start with '/': ${pathRelativeToAncestorMountpoint}`
              )
            );
          }
          const newMountSource =
            ancestorMountSettings.Mount.What +
            (ancestorMountSettings.Mount.What.endsWith("/")
              ? pathRelativeToAncestorMountpoint.slice(1)
              : pathRelativeToAncestorMountpoint);
          return ok({
            Unit: {
              DefaultDependencies: "no",
              After: ["remote-fs-pre.target", "network.target", "network-online.target"],
              Wants: ["network.target", "network-online.target"],
              Conflicts: ["umount.target"],
              Before: ["umount.target", "ctdb.service"],
              Description: SYSTEMD_MOUNT_DESCRIPTION,
            },
            Mount: {
              What: newMountSource,
              Where: resolvedNode.path,
              Options: ancestorMountSettings.Mount.Options,
              Type: "ceph",
              LazyUnmount: "true",
            },
            Install: {
              WantedBy: "remote-fs.target",
            },
          } as SystemdMountSettings);
        }
      );
      const mountUnit = resolvedNode
        .andThen(({ path }) => sdm.pathToMountUnitName(path))
        .map((name) => ({ name }));
      return ResultAsync.combine([mountUnit, newMountSettings]).andThen(
        ([mountUnit, newMountSettings]) => {
          console.log("unit name:", mountUnit.name);
          console.log("settings:", newMountSettings);
          return sdm
            .createUnit(mountUnit, newMountSettings)
            .andThen(() => sdm.enable(mountUnit, "now"));
        }
      );
    })
    .map(() => updateMountInfoPerServer())
    .map(() => reportSuccess("Enabled Ceph share remount"));

const removeRemounts = (path: string) =>
  assertConfirm({
    header: _("Remove remount of Ceph share?"),
    body: _("Quotas may not behave properly for clients."),
    dangerous: true,
  })
    .andThen(() => systemdManager)
    .andThen((sdm) => {
      const resolvedNode = clusterScope.andThen((servers) =>
        new FileSystemNode(servers[0], path).resolve(true)
      );
      return resolvedNode
        .andThen(({ path }) => sdm.pathToMountUnitName(path).map((name) => ({ name })))
        .andThen((mountUnit) => {
          const managedByFileSharing = sdm
            .getSettings(mountUnit)
            .map(
              (mountUnitSettings) =>
                mountUnitSettings.Unit?.Description === SYSTEMD_MOUNT_DESCRIPTION
            );
          return managedByFileSharing.andThen((managedByFileSharing) =>
            !managedByFileSharing
              ? err(new ProcessError(`Mount not managed by File Sharing: ${mountUnit.name}`))
              : ok(mountUnit)
          );
        })
        .andThen((mountUnit) => sdm.disable(mountUnit, "now"))
        .andThen((mountUnit) => sdm.removeUnit(mountUnit));
    })
    .map(() => updateMountInfoPerServer())
    .map(() => reportSuccess("Disabled Ceph share remount"));

// QUOTA

const cephCommandOptions: CommandOptions = { superuser: "try" };

const pathNode = (path: string) =>
  getServerResult.map((server) => new FileSystemNode(server, path));

const cephQuotaMaxBytesAttributeName = "ceph.quota.max_bytes";

const [currentQuota, refetchQuota] = computedResult(() =>
  pathNode(path.value)
    .andThen((node) =>
      node.getExtendedAttribute(cephQuotaMaxBytesAttributeName, cephCommandOptions)
    )
    .map((quota) => {
      console.log(quota);

      return quota.flatMap(StringToIntCaster(10)).orUndefined();
    })
    .mapErr(reportError)
);

const setQuota = (path: string, quota: number) =>
  pathNode(path)
    .andThen((node) =>
      node.setExtendedAttribute(
        cephQuotaMaxBytesAttributeName,
        quota.toString(10),
        cephCommandOptions
      )
    )
    .map(() => reportSuccess(`Set ${cephQuotaMaxBytesAttributeName} for ${path} to ${quota}`))
    .map(() => refetchQuota());

const removeQuota = (path: string) =>
  pathNode(path)
    .andThen((node) =>
      node.setExtendedAttribute(cephQuotaMaxBytesAttributeName, "0", cephCommandOptions)
    )
    .map(() => reportSuccess(`Removed ${cephQuotaMaxBytesAttributeName} from ${path}`))
    .map(() => refetchQuota());

// LAYOUT POOL

const cephClientName = inject(cephClientNameInjectionKey);
if (cephClientName === undefined) {
  throw new Error("clientKeyringPath not provided!");
}

const getLayoutPools = () =>
  getServerResult
    .andThen((server) =>
      server
        .execute(
          new Command(
            [
              "ceph",
              "fs",
              "status",
              `--keyring=/etc/ceph/ceph.${cephClientName.value}.keyring`,
              "--name",
              cephClientName.value,
              "--format=json",
            ],
            cephCommandOptions
          )
        )
        .orElse(() =>
          // fall back to default keyring
          server.execute(new Command(["ceph", "fs", "status", "--format=json"], cephCommandOptions))
        )
        .map((proc) => proc.getStdout())
        .andThen((jsonText) =>
          safeJsonParse<{ pools: { name: string; type: string }[] }>(jsonText).andThen(
            ({ pools }) =>
              pools && pools.every((pool) => pool.name !== undefined && pool.type !== undefined)
                ? ok(pools)
                : err(new ParsingError(`Malformed output from ceph fs status:\n${jsonText}`))
          )
        )
        .map((pools) => pools.filter((pool) => pool.type === "data").map((pool) => pool.name))
    )
    .mapErr((e) => {
      e.message = "Failed to get Ceph layout pools: " + e.message;
      return reportError(e);
    });

const [layoutPools] = computedResult(getLayoutPools, []);

const cephDirLayoutAttributeName = "ceph.dir.layout";
const cephDirLayoutPoolAttributeName = cephDirLayoutAttributeName + ".pool";

const [currentLayoutPool, refetchCurrentLayoutPool] = computedResult(() => {
  return pathNode(path.value)
    .andThen((node) =>
      node.getExtendedAttribute(cephDirLayoutPoolAttributeName, cephCommandOptions)
    )
    .map((pool) => pool.orUndefined());
}, undefined);

const setLayoutPool = (path: string, pool: string) =>
  pathNode(path)
    .andThen((node) =>
      node.setExtendedAttribute(cephDirLayoutPoolAttributeName, pool, cephCommandOptions)
    )
    .map(() => reportSuccess(`Set ${cephDirLayoutPoolAttributeName} for ${path} to ${pool}`))
    .map(() => refetchCurrentLayoutPool());

const removeLayoutPool = (path: string) =>
  pathNode(path)
    .andThen((node) => node.removeExtendedAttribute(cephDirLayoutAttributeName, cephCommandOptions))
    .map(() => reportSuccess(`Removed ${cephDirLayoutPoolAttributeName} from ${path}`))
    .map(() => refetchCurrentLayoutPool());

// ACTIONS SETUP

const actions = wrapActions({
  createRemounts,
  removeRemounts,
  setQuota,
  removeQuota,
  setLayoutPool,
  removeLayoutPool,
});

const quotaUnitBase = 1024;
const quotaUnitExponentOptions: SelectMenuOption<number>[] = [
  { label: "MiB", value: 2 },
  { label: "GiB", value: 3 },
  { label: "TiB", value: 4 },
];
const quotaUnitExponentRange = quotaUnitExponentOptions
  .map(({ value }) => value)
  .reduce(
    ({ min, max }, exp) => {
      return {
        min: Math.min(min, exp),
        max: Math.max(max, exp),
      };
    },
    {
      min: Infinity,
      max: -Infinity,
    }
  );
const quotaUnitExponentInput = ref(3); // default to GiB
watchEffect(() => {
  if (currentQuota.value === undefined) {
    return;
  }
  const currentExponent = Math.floor(Math.log(currentQuota.value) / Math.log(quotaUnitBase));
  return Math.max(
    Math.min(currentExponent, quotaUnitExponentRange.max),
    quotaUnitExponentRange.min
  );
});
const quotaInputMultiplier = computed(() => quotaUnitBase ** quotaUnitExponentInput.value);
const quotaInput = computed<string>({
  get: () =>
    Maybe.fromUndefined(currentQuota.value)
      .map((quota) => quota / quotaInputMultiplier.value)
      .cata(
        () => "",
        (quota) => quota.toString(10)
      ),
  set: (newQuota) =>
    Maybe.fromEmpty(newQuota)
      .flatMap(StringToIntCaster(10))
      .map((q) => Math.round(q * quotaInputMultiplier.value))
      .cata(
        () => actions.removeQuota(path.value),
        (newQuota) => actions.setQuota(path.value, newQuota)
      ),
});

const remountedForCephQuotasInput = computed<boolean>({
  get: () => pathIsMountpoint.value,
  set: (value) => (value ? actions.createRemounts(path.value) : actions.removeRemounts(path.value)),
});

const layoutPoolInput = computed<string | undefined>({
  get: () => currentLayoutPool.value,
  set: (newPool) => {
    if (newPool === currentLayoutPool.value) {
      return;
    }
    Maybe.fromUndefined(newPool).cata(
      () => actions.removeLayoutPool(path.value),
      (newPool) => actions.setLayoutPool(path.value, newPool)
    );
  },
});
const layoutPoolOptions = computed<SelectMenuOption<string | undefined>[]>(() => [
  { label: "None", value: undefined },
  ...layoutPools.value.map((poolName) => ({ label: poolName, value: poolName })),
]);
</script>

<template>
  <div class="space-y-content">
    <ToggleSwitch
      v-if="!pathIsMountpoint || pathRemountedByFileSharing"
      v-model="remountedForCephQuotasInput"
      :disabled="actions.createRemounts.processing.value || actions.removeRemounts.processing.value"
    >
      {{ _("Enable Ceph Remount") }}
      <template #tooltip>
        {{
          _(
            "When creating a Ceph share, a new filesystem mount point is created on top of the share directory. This is needed for Windows to properly report quotas through Samba."
          )
        }}
      </template>
    </ToggleSwitch>
    <InputLabelWrapper>
      <template #label>
        {{ _("Ceph Quota") }}
      </template>
      <div class="min-w-40 inline-flex flex-row space-x-1">
        <InputField v-model.lazy="quotaInput" type="number" :placeholder="_('no quota')" />
        <SelectMenu v-model="quotaUnitExponentInput" :options="quotaUnitExponentOptions" />
      </div>
    </InputLabelWrapper>
    <InputLabelWrapper>
      <template #label>
        {{ _("Ceph Layout Pool") }}
      </template>
      <SelectMenu v-model="layoutPoolInput" :options="layoutPoolOptions" />
    </InputLabelWrapper>
  </div>
</template>
