<script setup lang="ts">
import {
  inject,
  defineProps,
  computed,
  ref,
  watchEffect,
  type Ref,
  watch,
  reactive,
  defineModel,
} from "vue";
import { serverClusterInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";
import { Process, StringToIntCaster } from "@45drives/houston-common-lib";
import {
  wrapActions,
  ToggleSwitch,
  InputLabelWrapper,
  InputField,
  reportSuccess,
  SelectMenu,
  type SelectMenuOption,
  confirm,
} from "@45drives/houston-common-ui";
import { Maybe } from "monet";
import { getCephOptionManager } from "@/common/ceph-option-manager";
import { Hooks, useHookCallback } from "@/common/hooks";
import { ok, ResultAsync, okAsync } from "neverthrow";
import { useTempObjectStaging } from "@45drives/houston-common-ui";

const _ = cockpit.gettext;

const props = defineProps<{
  path: string;
  newShare: boolean;
}>();

const serverCluster = inject(serverClusterInjectionKey);
if (serverCluster === undefined) {
  throw new Error("serverCluster not provided!");
}

const cephClientName = inject(cephClientNameInjectionKey);
if (cephClientName === undefined) {
  throw new Error("clientKeyringPath not provided!");
}

const modifiedModel = defineModel<boolean>("modified", { default: false });

const path = computed(() => props.path);

const cephOptionManager = serverCluster.map((serverCluster) =>
  getCephOptionManager(serverCluster, cephClientName.value)
);

type CephOptions = {
  remounted: boolean;
  quota: number | undefined;
  layoutPool: string | undefined;
};

const currentOptions: CephOptions = reactive({
  remounted: false,
  quota: undefined,
  layoutPool: undefined,
});

const {
  tempObject: tempOptions,
  modified,
  resetChanges,
} = useTempObjectStaging(
  computed(() => currentOptions),
  (o) => {
    if (props.newShare) {
      o.remounted = true;
    }
    return o;
  }
);

watchEffect(() => (modifiedModel.value = modified.value));

const layoutPools = ref<string[]>([]);

const remountManagedByFileSharing = ref(false);

// ACTIONS SETUP
const loadPathIsMountpoint = () =>
  cephOptionManager
    .andThen((m) => m.pathIsMountpoint(path.value))
    .orElse((_) => ok(false))
    .map((v) => (currentOptions.remounted = v));

const loadPathMountpathMountpointManagedByFileSharing = () =>
  cephOptionManager
    .andThen((m) => m.pathMountpointManagedByFileSharing(path.value))
    .orElse((_) => ok(false))
    .map((v) => (remountManagedByFileSharing.value = v));

const loadQuota = () =>
  cephOptionManager
    .andThen((m) => m.getQuotaMaxBytes(path.value))
    .map((maybeQuota) => maybeQuota.orUndefined())
    .map((v) => (currentOptions.quota = v));

const loadLayoutPools = () =>
  cephOptionManager.andThen((m) => m.getLayoutPools()).map((v) => (layoutPools.value = v));

const loadLayoutPool = () =>
  cephOptionManager
    .andThen((m) => m.getLayoutPool(path.value))
    .map((maybePool) => maybePool.orUndefined())
    .map((v) => (currentOptions.layoutPool = v));

const remountPath = () =>
  cephOptionManager
    .andThen((m) => m.remountPath(path.value))
    .andThen(() => loadPathIsMountpoint())
    .andThen(() => loadPathMountpathMountpointManagedByFileSharing())
    .map(() => reportSuccess(_("Remouted") + ` ${path.value}`));

const removeRemount = () =>
  cephOptionManager
    .andThen((m) => m.removeRemount(path.value))
    .andThen(() => loadPathIsMountpoint())
    .andThen(() => loadPathMountpathMountpointManagedByFileSharing())
    .map(() => reportSuccess(_("Removed remount for") + ` ${path.value}`));

const setQuotaMaxBytes = (quota: number) =>
  cephOptionManager
    .andThen((m) => m.setQuotaMaxBytes(path.value, quota))
    .andThen(() => loadQuota())
    .map(() => reportSuccess(_("Set quota for") + ` ${path.value}`));

const removeQuotaMaxBytes = () =>
  cephOptionManager
    .andThen((m) => m.removeQuotaMaxBytes(path.value))
    .andThen(() => loadQuota())
    .map(() => reportSuccess(_("Removed quota for") + ` ${path.value}`));

const setLayoutPool = (pool: string) =>
  cephOptionManager
    .andThen((m) => m.setLayoutPool(path.value, pool))
    .andThen(() => loadLayoutPool())
    .map(() => reportSuccess(_("Set layout pool for") + ` ${path.value}`));

const removeLayoutPool = () =>
  cephOptionManager
    .andThen((m) => m.removeLayoutPool(path.value))
    .andThen(() => loadLayoutPool())
    .map(() => reportSuccess(_("Removed layout pool for") + ` ${path.value}`));

const actions = wrapActions({
  loadPathIsMountpoint,
  loadPathMountpathMountpointManagedByFileSharing,
  loadQuota,
  loadLayoutPools,
  loadLayoutPool,
  remountPath,
  removeRemount,
  setQuotaMaxBytes,
  removeQuotaMaxBytes,
  setLayoutPool,
  removeLayoutPool,
});

actions.loadLayoutPools();

watch(
  path,
  () => {
    loadPathIsMountpoint();
    loadPathMountpathMountpointManagedByFileSharing();
    loadQuota();
    loadLayoutPool();
  },
  { immediate: true }
);

useHookCallback([Hooks.BeforeAddShare, Hooks.BeforeEditShare], (_, share) => {
  if (!modified.value || share.path != path.value) {
    return okAsync(undefined);
  }
  const results = [] as ResultAsync<void, Error>[];
  if (tempOptions.value.remounted && !currentOptions.remounted) {
    results.push(actions.remountPath());
  } else if (!tempOptions.value.remounted && currentOptions.remounted) {
    results.push(actions.removeRemount());
  }
  if (tempOptions.value.quota !== currentOptions.quota) {
    results.push(
      Maybe.fromUndefined(tempOptions.value.quota).cata(
        () => actions.removeQuotaMaxBytes(),
        (quota) => actions.setQuotaMaxBytes(quota)
      )
    );
  }
  if (tempOptions.value.layoutPool !== currentOptions.layoutPool) {
    results.push(
      Maybe.fromUndefined(tempOptions.value.layoutPool).cata(
        () => actions.removeLayoutPool(),
        (pool) => actions.setLayoutPool(pool)
      )
    );
  }
  return ResultAsync.combine(results).map(() => {});
});

useHookCallback(Hooks.AfterRemoveShare, (_server, share) => {
  if (
    share.path != path.value ||
    !(currentOptions.remounted && remountManagedByFileSharing.value)
  ) {
    return okAsync(undefined);
  }
  return confirm({
    header: _("Remove Ceph Remount?"),
    body: _(
      `Share was remounted by File Sharing for proper reporting of quotas.
If this path is shared in another tab, you may want to keep it.`
    ),
    dangerous: true,
    confirmButtonText: _("Remove"),
    cancelButtonText: _("Keep"),
  }).andThen((remove) => {
    if (remove) {
      return actions.removeRemount();
    }
    return okAsync(undefined);
  });
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
  if (tempOptions.value.quota === undefined) {
    return;
  }
  const currentExponent = Math.floor(Math.log(tempOptions.value.quota) / Math.log(quotaUnitBase));
  quotaUnitExponentInput.value = Math.max(
    Math.min(currentExponent, quotaUnitExponentRange.max),
    quotaUnitExponentRange.min
  );
});
const quotaInputMultiplier = computed(() => quotaUnitBase ** quotaUnitExponentInput.value);
const quotaInput = computed<string>({
  get: () =>
    Maybe.fromUndefined(tempOptions.value.quota)
      .map((quota) => quota / quotaInputMultiplier.value)
      .cata(
        () => "",
        (quota) => quota.toString(10)
      ),
  set: (newQuota) =>
    (tempOptions.value.quota = Maybe.fromEmpty(newQuota)
      .flatMap(StringToIntCaster(10))
      .map((q) => Math.round(q * quotaInputMultiplier.value))
      .orUndefined()),
});

const layoutPoolOptions = computed<SelectMenuOption<string | undefined>[]>(() => [
  { label: "None", value: undefined },
  ...layoutPools.value.map((poolName) => ({ label: poolName, value: poolName })),
]);

defineExpose({
  resetChanges,
});
</script>

<template>
  <div class="space-y-content">
    <ToggleSwitch
      v-if="!currentOptions.remounted || remountManagedByFileSharing"
      v-model="tempOptions.remounted"
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
      <SelectMenu v-model="tempOptions.layoutPool" :options="layoutPoolOptions" />
    </InputLabelWrapper>
  </div>
</template>
