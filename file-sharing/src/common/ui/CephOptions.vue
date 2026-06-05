<script setup lang="ts">
import { inject, computed, ref, watchEffect, watch, reactive } from "vue";
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
import { ok, ResultAsync, okAsync } from "neverthrow";
import { useTempObjectStaging } from "@45drives/houston-common-ui";

const _ = cockpit.gettext;

const props = defineProps<{
  path: string;
  newShare: boolean;
  layoutPools: string[];
  remountManagedByFileSharing: boolean;
}>();

const remount = defineModel<boolean>("remount", { required: true });
const quotaBytes = defineModel<number | null>("quotaBytes", { required: true });
const layoutPool = defineModel<string | null>("layoutPool", { required: true });

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
  if (quotaBytes.value === null) {
    return;
  }
  const currentExponent = Math.floor(Math.log(quotaBytes.value) / Math.log(quotaUnitBase));
  quotaUnitExponentInput.value = Math.max(
    Math.min(currentExponent, quotaUnitExponentRange.max),
    quotaUnitExponentRange.min
  );
});
const quotaInputMultiplier = computed(() => quotaUnitBase ** quotaUnitExponentInput.value);
const quotaInput = computed<string>({
  get: () =>
    Maybe.fromNull(quotaBytes.value)
      .map((quota) => quota / quotaInputMultiplier.value)
      .cata(
        () => "",
        (quota) => quota.toString(10)
      ),
  set: (newQuota) =>
    (quotaBytes.value = Maybe.fromEmpty(newQuota)
      .flatMap(StringToIntCaster(10))
      .map((q) => Math.round(q * quotaInputMultiplier.value))
      .orNull()),
});

const layoutPoolOptions = computed<SelectMenuOption<string | null>[]>(() => [
  { label: "None", value: null },
  ...props.layoutPools.map((poolName) => ({ label: poolName, value: poolName })),
]);
</script>

<template>
  <div class="space-y-content">
    <ToggleSwitch v-if="remountManagedByFileSharing" v-model="remount">
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
      <SelectMenu v-model="layoutPool" :options="layoutPoolOptions" />
    </InputLabelWrapper>
  </div>
</template>
