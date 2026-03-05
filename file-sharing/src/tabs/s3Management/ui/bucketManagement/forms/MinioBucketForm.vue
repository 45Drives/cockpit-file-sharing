<!-- forms/MinioBucketForm.vue -->
<template>
    <div class="md:col-span-2 mt-2 border-t border-slate-800 pt-3 space-y-4">
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium font-semibold text-default">Object locking (--with-lock)</label>
        <div class="flex items-center gap-2">
          <input
            id="minioObjectLockEnabled"
            :disabled="mode === 'edit'"
            v-model="form.objectLock"
            type="checkbox"
            class="h-4 w-4 rounded border-slate-600 bg-default"
          />
          <label for="minioObjectLockEnabled" class="text-md font-semibold text-default">Enable</label>
        </div>
      </div>

      <div
        v-if="backend === 'rustfs' && (form.objectLock || (mode === 'edit' && !!bucket?.objectLockEnabled))"
        class="grid grid-cols-1 gap-2 md:grid-cols-2"
      >
        <div class="md:col-span-2 flex items-center justify-between">
          <label class="text-sm font-medium font-semibold text-default">Set default retention</label>
          <div class="flex items-center gap-2">
            <input
              id="rustfsRetentionEnabled"
              v-model="form.retentionEnabled"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-600 bg-default"
            />
            <label for="rustfsRetentionEnabled" class="text-md font-semibold text-default">Enable</label>
          </div>
        </div>

        <template v-if="form.retentionEnabled">
        <div>
          <label class="mb-1 block text-sm font-medium font-semibold text-default">Default retention mode</label>
          <select
            v-model="form.objectLockMode"
            class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:ring-1"
          >
            <option value="GOVERNANCE">GOVERNANCE</option>
            <option value="COMPLIANCE">COMPLIANCE</option>
          </select>
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium font-semibold text-default">Default retention days</label>
          <input
            v-model="form.objectLockRetentionDays"
            type="number"
            min="1"
            placeholder="e.g. 30"
            class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:ring-1"
          />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium font-semibold text-default">Unit</label>
          <select
            v-model="form.retentionUnit"
            class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:ring-1"
          >
            <option value="days">Days</option>
            <option value="years">Years</option>
          </select>
        </div>
        </template>
      </div>
  
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium font-semibold text-default">Versioning (--with-versioning)</label>
        <div class="flex items-center gap-2">
          <input
            id="minioVersioningEnabled"
            v-model="form.versioning"
            type="checkbox"
            class="h-4 w-4 rounded border-slate-600 bg-default"
          />
          <label for="minioVersioningEnabled" class="text-md font-semibold text-default">Enable</label>
        </div>
      </div>
  
      <div class="space-y-2">
        <label class="block text-md font-medium font-semibold text-default">Quota</label>
  
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <label class="mb-1 block text-sm font-medium font-semibold text-default">Max size</label>
            <div class="flex gap-2">
              <input
                v-model="form.quotaValue"
                type="number"
                min="0"
                placeholder="e.g. 100"
                class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:ring-1"
              />
              <select
                v-model="form.quotaUnit"
                class="w-24 rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:ring-1"
              >
                <option value="MiB">MiB</option>
                <option value="GiB">GiB</option>
                <option value="TiB">TiB</option>
              </select>
            </div>
            <button
              v-if="backend === 'rustfs' && mode === 'edit'"
              type="button"
              @click="disableQuota"
              class="mt-2 rounded-md border border-default bg-default px-3 py-1.5 text-sm font-medium text-default hover:bg-slate-800"
            >
              Disable quota
            </button>
          </div>
        </div>
      </div>
  
      <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
    </div>
</template>
  
  <script setup lang="ts">
  import { reactive, ref, watch } from "vue";
  import type { MinioBucket, RustfsBucket } from "../../../types/types";
  import type { BucketFormData } from "../../../bucketBackends/bucketBackend";
  import type { MinioBucketUpdateOptions } from "../../../types/types";
  import { splitBytesBinary } from "../../../bucketBackends/bucketUtils";
  
  const props = defineProps<{
    mode: "create" | "edit";
    backend?: "minio" | "rustfs";
    bucket: MinioBucket | RustfsBucket | null;
  }>();
  
  const error = ref<string | null>(null);
  
  const form = reactive({
    versioning: false,
    objectLock: false,
    retentionEnabled: false,
    objectLockMode: "GOVERNANCE" as "GOVERNANCE" | "COMPLIANCE",
    objectLockRetentionDays: "",
    retentionUnit: "days" as "days" | "years",
    quotaValue: "",
    quotaUnit: "GiB" as "MiB" | "GiB" | "TiB",
  });
  
  function reset() {
    error.value = null;
    form.versioning = false;
    form.objectLock = false;
    form.retentionEnabled = false;
    form.objectLockMode = "GOVERNANCE";
    form.objectLockRetentionDays = "";
    form.retentionUnit = "days";
    form.quotaValue = "";
    form.quotaUnit = "GiB";
  }
  
  function initFromProps() {
    reset();
  
    if (props.mode !== "edit") return;
    const b = props.bucket;
    if (!b) return;
  
    form.versioning = b.versioning === "Enabled";
    form.objectLock = !!b.objectLockEnabled;

    if (props.backend === "rustfs") {
      const mode = (b as any).objectLockMode;
      const retentionDays = (b as any).objectLockRetentionDays;
      if (mode === "GOVERNANCE" || mode === "COMPLIANCE") {
        form.objectLockMode = mode;
      }
      if (typeof retentionDays === "number" && Number.isFinite(retentionDays) && retentionDays > 0) {
        form.retentionEnabled = true;
        if (retentionDays % 365 === 0) {
          form.retentionUnit = "years";
          form.objectLockRetentionDays = String(Math.floor(retentionDays / 365));
        } else {
          form.retentionUnit = "days";
          form.objectLockRetentionDays = String(Math.floor(retentionDays));
        }
      }
    }
  
    const quotaBytes = b.quotaBytes;
    if (typeof quotaBytes === "number" && quotaBytes > 0) {
      const { value, unit } = splitBytesBinary(quotaBytes);
      form.quotaValue = String(value);
      form.quotaUnit = unit;
    }
  }
  
  watch(() => [props.mode, props.bucket], initFromProps, { immediate: true });
  
  function validate(): boolean {
    error.value = null;

    if (
      props.backend === "rustfs" &&
      form.retentionEnabled &&
      (form.objectLock || (props.mode === "edit" && !!props.bucket?.objectLockEnabled))
    ) {
      const retentionDaysText = String(form.objectLockRetentionDays ?? "").trim();
      if (retentionDaysText === "") {
        error.value = "Default retention value is required.";
        return false;
      }
      const value = Number(retentionDaysText);
      if (!Number.isFinite(value) || value < 1) {
        error.value = "Default retention value must be >= 1.";
        return false;
      }
    }
  
    if (form.quotaValue && Number(form.quotaValue) < 0) {
      error.value = "Max size must be >= 0.";
      return false;
    }
  
    return true;
  }

  function disableQuota() {
    form.quotaValue = "";
  }
  
  function build(): BucketFormData {
    const quotaSize = form.quotaValue ? `${form.quotaValue}${form.quotaUnit}` : null;
    const retentionRaw = String(form.objectLockRetentionDays ?? "").trim();
    const retentionValue = retentionRaw !== "" ? Number(retentionRaw) : undefined;
    const retentionDays =
      typeof retentionValue === "number" && Number.isFinite(retentionValue)
        ? form.retentionUnit === "years"
          ? Math.floor(retentionValue * 365)
          : Math.floor(retentionValue)
        : undefined;
  
    const minio: MinioBucketUpdateOptions = {
      versioning: !!form.versioning,
      quotaSize,
      tags: null,
      objectLock: !!form.objectLock,
      objectLockMode:
        props.backend === "rustfs" &&
        form.retentionEnabled &&
        (form.objectLock || (props.mode === "edit" && !!props.bucket?.objectLockEnabled))
          ? form.objectLockMode
          : undefined,
      objectLockRetentionDays:
        props.backend === "rustfs" &&
        form.retentionEnabled &&
        (form.objectLock || (props.mode === "edit" && !!props.bucket?.objectLockEnabled)) &&
        retentionDays !== undefined &&
        retentionDays >= 1
          ? retentionDays
          : undefined,
    };
  
    return {
      backend: props.backend ?? "minio",
      name: props.bucket?.name ?? "",
      [props.backend ?? "minio"]: minio,
    };
  }
  
  defineExpose({ validate, build });
  </script>
  
