<script setup lang="ts">
import {
  getSystemdManager,
  type SystemdMountSettings,
  type SystemdUnit,
} from "@/common/systemd-manager";
import { inject, defineProps, computed, ref, watchEffect, type Ref, type ComputedRef } from "vue";
import { serverClusterInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";
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
import { getCephOptionManager } from "@/common/ceph-option-manager";

const _ = cockpit.gettext;

const props = defineProps<{
  path: string;
}>();

const serverCluster = inject(serverClusterInjectionKey);
if (serverCluster === undefined) {
  throw new Error("serverCluster not provided!");
}

const cephClientName = inject(cephClientNameInjectionKey);
if (cephClientName === undefined) {
  throw new Error("clientKeyringPath not provided!");
}

const path = computed(() => props.path);

const cephOptionManager = serverCluster.map((serverCluster) =>
  getCephOptionManager(serverCluster, cephClientName.value)
);

const [pathIsMountpoint, refetchPathIsMountpoint] = computedResult<boolean>(() => {
  const currentPath = path.value;
  return cephOptionManager.andThen((m) => m.pathIsMountpoint(currentPath));
}, false);

const [pathRemountedByFileSharing, refetchPathRemountedByFileSharing] = computedResult(() => {
  const currentPath = path.value;
  if (pathIsMountpoint.value === false) {
    return ok(false);
  }
  return cephOptionManager.andThen((m) => m.pathMountpointManagedByFileSharing(currentPath));
}, false);

const [currentQuota, refetchQuota] = computedResult(() => {
  const currentPath = path.value;
  return cephOptionManager
    .andThen((m) => m.getQuotaMaxBytes(currentPath))
    .map((maybeQuota) => maybeQuota.orUndefined());
});

const [layoutPools] = computedResult(
  () => cephOptionManager.andThen((m) => m.getLayoutPools()),
  []
);

const [currentLayoutPool, refetchCurrentLayoutPool] = computedResult(() => {
  const currentPath = path.value;
  return cephOptionManager
    .andThen((m) => m.getLayoutPool(currentPath))
    .map((maybeLayoutPool) => maybeLayoutPool.orUndefined());
});

// ACTIONS SETUP

const remountPath = (path: string) =>
  cephOptionManager
    .andThen((m) => m.remountPath(path))
    .andThen(() => refetchPathIsMountpoint())
    .andThen(() => refetchPathRemountedByFileSharing())
    .map(() => reportSuccess(_("Remouted") + ` ${path}`));

const removeRemount = (path: string) =>
  cephOptionManager
    .andThen((m) => m.removeRemount(path))
    .andThen(() => refetchPathIsMountpoint())
    .andThen(() => refetchPathRemountedByFileSharing())
    .map(() => reportSuccess(_("Removed remount for") + ` ${path}`));

const setQuotaMaxBytes = (path: string, quotaMaxBytes: number) =>
  cephOptionManager
    .andThen((m) => m.setQuotaMaxBytes(path, quotaMaxBytes))
    .andThen(() => refetchQuota())
    .map(() => reportSuccess(_("Set quota for") + ` ${path}`));

const removeQuotaMaxBytes = (path: string) =>
  cephOptionManager
    .andThen((m) => m.removeQuotaMaxBytes(path))
    .andThen(() => refetchQuota())
    .map(() => reportSuccess(_("Removed quota from") + ` ${path}`));

const setLayoutPool = (path: string, layoutPool: string) =>
  cephOptionManager
    .andThen((m) => m.setLayoutPool(path, layoutPool))
    .andThen(() => refetchCurrentLayoutPool())
    .map(() => reportSuccess(_("Set layout pool for") + ` ${path}`));

const removeLayoutPool = (path: string) =>
  cephOptionManager
    .andThen((m) => m.removeLayoutPool(path))
    .andThen(() => refetchCurrentLayoutPool())
    .map(() => reportSuccess(_("Removed layout pool from") + ` ${path}`));

const actions = wrapActions({
  remountPath,
  removeRemount,
  setQuotaMaxBytes,
  removeQuotaMaxBytes,
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
        () => actions.removeQuotaMaxBytes(path.value),
        (newQuota) => actions.setQuotaMaxBytes(path.value, newQuota)
      ),
});

const remountedForCephQuotasInput = computed<boolean>({
  get: () => pathIsMountpoint.value,
  set: (value) => (value ? actions.remountPath(path.value) : actions.removeRemount(path.value)),
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
      :disabled="actions.remountPath.processing.value || actions.removeRemount.processing.value"
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
