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
          </div>
        </div>
      </div>
  
      <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
    </div>
</template>
  
  <script setup lang="ts">
  import { reactive, ref, watch } from "vue";
  import type { MinioBucket } from "../../../types/types";
  import type { BucketFormData } from "../../../bucketBackends/bucketBackend";
  import type { MinioBucketUpdateOptions } from "../../../types/types";
  import { splitBytesBinary } from "../../../bucketBackends/bucketUtils";
  
  const props = defineProps<{
    mode: "create" | "edit";
    bucket: MinioBucket | null;
  }>();
  
  const error = ref<string | null>(null);
  
  const form = reactive({
    versioning: false,
    objectLock: false,
    quotaValue: "",
    quotaUnit: "GiB" as "MiB" | "GiB" | "TiB",
  });
  
  function reset() {
    error.value = null;
    form.versioning = false;
    form.objectLock = false;
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
  
    if (form.quotaValue && Number(form.quotaValue) < 0) {
      error.value = "Max size must be >= 0.";
      return false;
    }
  
    return true;
  }
  
  function build(): BucketFormData {
    const quotaSize = form.quotaValue ? `${form.quotaValue}${form.quotaUnit}` : null;
  
    const minio: MinioBucketUpdateOptions = {
      versioning: !!form.versioning,
      quotaSize,
      tags: null,
      objectLock: !!form.objectLock,
    };
  
    return {
      backend: "minio",
      name: props.bucket?.name ?? "",
      minio,
    };
  }
  
  defineExpose({ validate, build });
  </script>
  