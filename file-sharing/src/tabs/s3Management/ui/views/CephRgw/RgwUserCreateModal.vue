<template>
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
    >
      <div class="bg-default rounded-lg shadow-lg max-w-md w-full mx-4">
        <div class="px-5 py-4 border-b border-gray-200">
            <h3 class="text-base font-semibold">
  {{ isEdit ? "Edit RGW user" : "Create RGW user" }}
</h3>

        </div>
  
        <div class="px-5 py-4 space-y-3 text-sm">
          <!-- Basic identity -->
          <div>
            <label class="block text-xs font-medium mb-1">
              Username (uid)
            </label>
            <input
  v-model="form.uid"
  type="text"
  class="w-full border border-gray-300 bg-default rounded px-2 py-1 text-sm"
  :readonly="isEdit"
/>
          </div>
  
          <div>
            <label class="block text-xs font-medium mb-1">
              Tenant
            </label>
            <input
              v-model="form.tenant"
              type="text"
              class="w-full border border-gray-300 bg-default rounded px-2 py-1 text-sm"
              placeholder="optional"
            />
          </div>
  
          <div>
            <label class="block text-xs font-medium mb-1">
              Full name
            </label>
            <input
              v-model="form.fullName"
              type="text"
              class="w-full border border-gray-300 bg-default rounded px-2 py-1 text-sm"
            />
          </div>
  
          <div>
            <label class="block text-xs font-medium mb-1">
              Email
            </label>
            <input
              v-model="form.email"
              type="email"
              class="w-full border border-gray-300 bg-default rounded px-2 py-1 text-sm"
              placeholder="optional"
            />
          </div>
  
          <div>
            <label class="block text-xs font-medium mb-1">
              Max buckets
            </label>
            <input
              v-model.number="form.maxBuckets"
              type="number"
              min="0"
              class="w-full border border-gray-300 bg-default rounded px-2 py-1 text-sm"
              placeholder="leave empty for default"
            />
          </div>
  
          <!-- Suspended / System user -->
          <div class="border-t border-gray-200 pt-3 mt-2 grid grid-cols-2 gap-2 text-xs">
            <label class="flex items-center space-x-2">
              <input
                type="checkbox"
                v-model="form.suspended"
                class="h-4 w-4 rounded border-gray-300 bg-default"
              />
              <span>Suspended</span>
            </label>
  
            <label class="flex items-center space-x-2">
              <input
                type="checkbox"
                v-model="form.systemUser"
                class="h-4 w-4 rounded border-gray-300 bg-default"
              />
              <span>System user</span>
            </label>
          </div>
  
          <!-- User quota -->
          <div class="border-t border-gray-200 pt-3 mt-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold">
                User quota (quota-scope=user)
              </span>
              <label class="flex items-center space-x-1 text-xs">
                <input
                  type="checkbox"
                  v-model="form.userQuotaEnabled"
                  class="h-4 w-4 rounded border-gray-300 bg-default"
                />
                <span>Enabled</span>
              </label>
            </div>
  
            <div
              v-if="form.userQuotaEnabled"
              class="mt-2 grid grid-cols-2 gap-2 text-xs"
            >
              <div class="space-y-1">
                <label class="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    v-model="form.userQuotaUnlimitedSize"
                    :disabled="!form.userQuotaEnabled"
                    class="h-4 w-4 rounded border-gray-300 bg-default disabled:bg-gray-100"
                  />
                  <span>Unlimited size</span>
                </label>
  
                <div class="flex space-x-1">
                  <input
                    v-model.number="form.userQuotaMaxSizeKb"
                    type="number"
                    min="0"
                    class="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-default disabled:bg-gray-100"
                    :disabled="form.userQuotaUnlimitedSize"
                    placeholder="Max size"
                  />
                  <select
                    v-model="form.userQuotaSizeUnit"
                    class="border border-gray-300 rounded px-1 py-1 text-xs bg-default disabled:bg-gray-100"
                    :disabled="form.userQuotaUnlimitedSize"
                  >
                    <option value="KiB">KiB</option>
                    <option value="MiB">MiB</option>
                    <option value="GiB">GiB</option>
                    <option value="TiB">TiB</option>
                  </select>
                </div>
              </div>
  
              <div class="space-y-1">
                <label class="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    v-model="form.userQuotaUnlimitedObjects"
                    :disabled="!form.userQuotaEnabled"
                    class="h-4 w-4 rounded border-gray-300 bg-default disabled:bg-gray-100"
                  />
                  <span>Unlimited objects</span>
                </label>
                <input
                  v-model.number="form.userQuotaMaxObjects"
                  type="number"
                  min="0"
                  class="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-default disabled:bg-gray-100"
                  placeholder="Max objects"
                />
              </div>
            </div>
          </div>
  
          <!-- Bucket quota -->
          <div class="border-t border-gray-200 pt-3 mt-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold">
                Bucket quota (quota-scope=bucket)
              </span>
              <label class="flex items-center space-x-1 text-xs">
                <input
                  type="checkbox"
                  v-model="form.bucketQuotaEnabled"
                  class="h-4 w-4 rounded border-gray-300 bg-default"
                />
                <span>Enabled</span>
              </label>
            </div>
  
            <div
              v-if="form.bucketQuotaEnabled"
              class="mt-2 grid grid-cols-2 gap-2 text-xs"
            >
              <div class="space-y-1">
                <label class="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    v-model="form.bucketQuotaUnlimitedSize"
                    class="h-4 w-4 rounded border-gray-300 bg-default disabled:bg-gray-100"
                  />
                  <span>Unlimited size</span>
                </label>
  
                <div class="flex space-x-1">
                  <input
                    v-model.number="form.bucketQuotaMaxSizeKb"
                    type="number"
                    min="0"
                    class="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-default disabled:bg-gray-100"
                    :disabled="form.bucketQuotaUnlimitedSize"
                    placeholder="Max size"
                  />
                  <select
                    v-model="form.bucketQuotaSizeUnit"
                    class="border border-gray-300 rounded px-1 py-1 text-xs bg-default disabled:bg-gray-100"
                    :disabled="form.bucketQuotaUnlimitedSize"
                  >
                    <option value="KiB">KiB</option>
                    <option value="MiB">MiB</option>
                    <option value="GiB">GiB</option>
                    <option value="TiB">TiB</option>
                  </select>
                </div>
              </div>
  
              <div class="space-y-1">
                <label class="flex items-center space-x-1">
                  <input
                    type="checkbox"
                    v-model="form.bucketQuotaUnlimitedObjects"
                    class="h-4 w-4 rounded border-gray-300 bg-default disabled:bg-gray-100"
                  />
                  <span>Unlimited objects</span>
                </label>
                <input
                  v-model.number="form.bucketQuotaMaxObjects"
                  type="number"
                  min="0"
                  class="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-default disabled:bg-gray-100"
                  placeholder="Max objects"
                />
              </div>
            </div>
          </div>
        </div>
  
        <!-- Key generation + errors -->
        <div class="px-5 border-t border-gray-200 pt-3 mt-2 space-y-2">
          <label class="flex items-center space-x-2 text-xs">
            <input
              type="checkbox"
              v-model="form.autoGenerateKey"
              class="h-4 w-4 rounded border-gray-300"
            />
            <span>Auto-generate S3 access key/secret</span>
          </label>
  
          <div v-if="!form.autoGenerateKey" class="space-y-2 text-xs">
            <div>
              <label class="block mb-1">
                Access key
              </label>
              <input
                v-model="form.accessKey"
                type="text"
                class="w-full border border-gray-300 bg-default rounded px-2 py-1 text-xs"
                placeholder="required when not auto-generating"
              />
            </div>
            <div>
              <label class="block mb-1">
                Secret key
              </label>
              <input
                v-model="form.secretKey"
                type="password"
                class="w-full border border-gray-300 bg-default rounded px-2 py-1 text-xs"
                placeholder="required when not auto-generating"
              />
            </div>
          </div>
  
          <p class="text-xs text-red-600" v-if="localError">
            {{ localError }}
          </p>
          <p class="text-xs text-red-600" v-else-if="errorMessage">
            {{ errorMessage }}
          </p>
        </div>
  
        <div class="px-5 py-3 border-t border-gray-200 flex justify-end space-x-2">
          <button
            class="px-3 py-1.5 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50"
            @click="close"
            :disabled="loading"
          >
            Cancel
          </button>
          <button
  class="px-3 py-1.5 text-xs rounded border border-green-600 bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
  @click="submit"
  :disabled="loading"
>
  {{ isEdit ? "Save changes" : "Create" }}
</button>
        </div>
      </div>
    </div>
</template>
  
  <script lang="ts" setup>
  import { computed, ref, watch } from "vue";
  import type { CreateRgwUserOptions,RgwUser } from "@/tabs/s3Management/types/types";
  
  const props = defineProps<{
    modelValue: boolean;
    loading?: boolean;
    mode?: "create" | "edit";
    errorMessage?: string | null;
    initialUser?: RgwUser | null;

  }>();
  
  const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "submit", payload: { mode: "create" | "edit"; data: CreateRgwUserOptions }): void;
}>();
  const isEdit = computed(() => props.mode === "edit");

  const form = ref({
    uid: "",
    tenant: "",
    fullName: "",
    email: "",
    maxBuckets: undefined as number | undefined,
  
    suspended: false,
    systemUser: false,
  
    userQuotaEnabled: false,
    userQuotaUnlimitedSize: true,
    userQuotaMaxSizeKb: undefined as number | undefined,
    userQuotaUnlimitedObjects: true,
    userQuotaMaxObjects: undefined as number | undefined,
  
    bucketQuotaEnabled: false,
    bucketQuotaUnlimitedSize: true,
    bucketQuotaMaxSizeKb: undefined as number | undefined,
    bucketQuotaUnlimitedObjects: true,
    bucketQuotaMaxObjects: undefined as number | undefined,
  
    autoGenerateKey: true,
    accessKey: "",
    secretKey: "",
  
    userQuotaSizeUnit: "GiB" as "KiB" | "MiB" | "GiB" | "TiB",
    bucketQuotaSizeUnit: "GiB" as "KiB" | "MiB" | "GiB" | "TiB",
  });
  
  const localError = ref<string | null>(null);
  
  function resetForm() {
    localError.value = null;
    form.value = {
      uid: "",
      tenant: "",
      fullName: "",
      email: "",
      maxBuckets: undefined,
  
      suspended: false,
      systemUser: false,
  
      userQuotaEnabled: false,
      userQuotaUnlimitedSize: true,
      userQuotaMaxSizeKb: undefined,
      userQuotaUnlimitedObjects: true,
      userQuotaMaxObjects: undefined,
  
      bucketQuotaEnabled: false,
      bucketQuotaUnlimitedSize: true,
      bucketQuotaMaxSizeKb: undefined,
      bucketQuotaUnlimitedObjects: true,
      bucketQuotaMaxObjects: undefined,
  
      autoGenerateKey: true,
      accessKey: "",
      secretKey: "",
  
      userQuotaSizeUnit: "GiB",
      bucketQuotaSizeUnit: "GiB",
    };
  }
  
  watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      if (isEdit.value && props.initialUser) {
        loadFromInitialUser(props.initialUser);
      } else {
        resetForm();
      }
    }
  }
);

  
  function close() {
    emit("update:modelValue", false);
  }
  
  function submit() {
  localError.value = null;

  if (!form.value.uid || !form.value.fullName) {
    localError.value = "Username and full name are required.";
    return;
  }

  if (!form.value.autoGenerateKey) {
    if (!form.value.accessKey || !form.value.secretKey) {
      localError.value =
        "Access key and secret key are required when auto-generate is disabled.";
      return;
    }
  }

  const payload: CreateRgwUserOptions = {
    uid: form.value.uid,
    tenant: form.value.tenant || undefined,
    displayName: form.value.fullName,
    email: form.value.email || undefined,
    maxBuckets: form.value.maxBuckets,

    systemUser: form.value.systemUser,
    autoGenerateKey: form.value.autoGenerateKey,
    accessKey: form.value.autoGenerateKey ? undefined : form.value.accessKey,
    secretKey: form.value.autoGenerateKey ? undefined : form.value.secretKey,

    suspended: form.value.suspended,

    userQuotaEnabled: form.value.userQuotaEnabled,
    userQuotaMaxSizeKb:
      form.value.userQuotaEnabled && !form.value.userQuotaUnlimitedSize
        ? sizeToKiB(form.value.userQuotaMaxSizeKb, form.value.userQuotaSizeUnit)
        : undefined,
    userQuotaMaxObjects:
      form.value.userQuotaEnabled && !form.value.userQuotaUnlimitedObjects
        ? form.value.userQuotaMaxObjects
        : undefined,

    bucketQuotaEnabled: form.value.bucketQuotaEnabled,
    bucketQuotaMaxSizeKb:
      form.value.bucketQuotaEnabled && !form.value.bucketQuotaUnlimitedSize
        ? sizeToKiB(form.value.bucketQuotaMaxSizeKb, form.value.bucketQuotaSizeUnit)
        : undefined,
    bucketQuotaMaxObjects:
      form.value.bucketQuotaEnabled && !form.value.bucketQuotaUnlimitedObjects
        ? form.value.bucketQuotaMaxObjects
        : undefined,
  };

  emit("submit", {
    mode: isEdit.value ? "edit" : "create",
    data: payload,
  });
}

  
  function sizeToKiB(
    value: number | undefined,
    unit: "KiB" | "MiB" | "GiB" | "TiB"
  ): number | undefined {
    if (value == null) return undefined;
  
    const multipliers: Record<typeof unit, number> = {
      KiB: 1,
      MiB: 1024,
      GiB: 1024 * 1024,
      TiB: 1024 * 1024 * 1024,
    };
  
    return value * multipliers[unit];
  }

  function fromKiB(
  kib: number | undefined
): { value: number | undefined; unit: "KiB" | "MiB" | "GiB" | "TiB" } {
  if (kib == null) return { value: undefined, unit: "GiB" };

  const kibNum = kib;
  const teb = 1024 * 1024 * 1024;
  const gib = 1024 * 1024;
  const mib = 1024;

  if (kibNum >= teb) return { value: Math.round(kibNum / teb), unit: "TiB" };
  if (kibNum >= gib) return { value: Math.round(kibNum / gib), unit: "GiB" };
  if (kibNum >= mib) return { value: Math.round(kibNum / mib), unit: "MiB" };
  return { value: kibNum, unit: "KiB" };
}

// prefill form when opening in edit mode
function loadFromInitialUser(user: RgwUser) {
  resetForm();

  form.value.uid = user.uid;
  form.value.tenant = user.tenant ?? "";
  form.value.fullName = user.displayName ?? "";
  form.value.email = user.email ?? "";
  form.value.maxBuckets = user.maxBuckets!;

  form.value.suspended = !!user.suspended;
  // systemUser flag if you have it on the type; if not, leave false

  // For now we only know user-level quota from your adapter (capacityLimitPercent/objectLimitPercent)
  // You mentioned they are actually absolute max_size_kb / max_objects, so we treat them as such.
  if (typeof user.capacityLimitPercent === "number") {
    form.value.userQuotaEnabled = true;
    form.value.userQuotaUnlimitedSize = false;
    const { value, unit } = fromKiB(user.capacityLimitPercent);
    form.value.userQuotaMaxSizeKb = value;
    form.value.userQuotaSizeUnit = unit;
  } else {
    form.value.userQuotaEnabled = false;
  }

  if (typeof user.objectLimitPercent === "number") {
    form.value.userQuotaEnabled = true;
    form.value.userQuotaUnlimitedObjects = false;
    form.value.userQuotaMaxObjects = user.objectLimitPercent;
  }

}

  </script>
  