<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
  >
    <div class="bg-default rounded-lg shadow-lg max-w-md w-full mx-4">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 class="text-base font-semibold">
          Create MinIO user
        </h3>
        <button
          class="px-2 py-1 text-xs rounded border border-gray-300 bg-secondary hover:bg-gray-100"
          @click="close"
          :disabled="loading"
        >
          Close
        </button>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 space-y-4 text-sm">
        <!-- Basic identity -->
        <section class="space-y-2">
          <h4 class="text-xs font-semibold uppercase text-gray-500">
            Basic information
          </h4>

          <div>
            <label class="block text-xs font-medium mb-1">
              Username
            </label>
            <input
              v-model.trim="form.username"
              type="text"
              autocomplete="off"
              class="w-full border border-gray-300 bg-default rounded px-2 py-1 text-sm"
              placeholder="minio username"
            />
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">
              Status
            </label>
            <div class="flex items-center space-x-4 text-xs">
              <label class="inline-flex items-center space-x-1">
                <input
                  type="radio"
                  value="enabled"
                  v-model="form.status"
                  class="h-4 w-4 border-gray-300 rounded-full"
                />
                <span>Enabled</span>
              </label>
              <label class="inline-flex items-center space-x-1">
                <input
                  type="radio"
                  value="disabled"
                  v-model="form.status"
                  class="h-4 w-4 border-gray-300 rounded-full"
                />
                <span>Disabled</span>
              </label>
            </div>
          </div>
        </section>

        <!-- Credentials -->
        <section class="space-y-2">
          <h4 class="text-xs font-semibold uppercase text-gray-500">
            Credentials
          </h4>

          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-600">
              Secret key is required for MinIO user creation.
            </span>
            <button
              type="button"
              class="text-xs px-2 py-1 rounded border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              @click="generateSecret"
              :disabled="loading"
            >
              Generate
            </button>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">
              Secret key
            </label>
            <div class="flex items-center space-x-2">
              <input
                :type="showSecret ? 'text' : 'password'"
                v-model="form.secretKey"
                autocomplete="off"
                class="w-full border border-gray-300 bg-default rounded px-2 py-1 text-xs font-mono"
                placeholder="required"
              />
              <button
                type="button"
                class="px-2 py-1 text-[11px] rounded border border-gray-300 bg-secondary hover:bg-gray-100 whitespace-nowrap"
                @click="showSecret = !showSecret"
              >
                {{ showSecret ? "Hide" : "Show" }}
              </button>
            </div>

            <div class="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              Make sure to copy and store this secret key now. It cannot be retrieved later;
              if it is lost, you will need to generate a new secret for this user.
            </div>
          </div>
        </section>

        <!-- Access: Policies / Groups tabs -->
        <section class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold uppercase text-gray-500">
              Access
            </h4>
          </div>

          <!-- Tabs -->
          <div class="flex border-b border-gray-200 mb-2 text-xs">
            <button
              type="button"
              class="px-3 py-1.5 -mb-px border-b-2"
              :class="activeAccessTab === 'policies'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'"
              @click="activeAccessTab = 'policies'"
            >
              Policies
            </button>
            <button
              type="button"
              class="px-3 py-1.5 -mb-px border-b-2"
              :class="activeAccessTab === 'groups'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'"
              @click="activeAccessTab = 'groups'"
            >
              Groups
            </button>
          </div>

          <!-- Policies pane -->
          <div v-if="activeAccessTab === 'policies'">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] text-gray-500">
                Attach one or more MinIO policies
              </span>
              <span class="text-[11px] text-gray-400">
                Selected: {{ form.policies.length }}
              </span>
            </div>

            <div
              v-if="availablePolicies.length"
              class="border border-gray-200 rounded max-h-40 overflow-y-auto bg-secondary"
            >
              <label
                v-for="policy in availablePolicies"
                :key="policy"
                class="flex items-center justify-between px-3 py-1.5 text-xs border-b last:border-b-0 border-gray-100"
              >
                <div class="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    :value="policy"
                    v-model="form.policies"
                    class="h-4 w-4 rounded border-gray-300"
                  />
                  <span class="font-mono text-[11px] break-all">
                    {{ policy }}
                  </span>
                </div>
              </label>
            </div>
            <p v-else class="text-[11px] text-gray-500 italic">
              No policies loaded. User will be created with no direct policies.
            </p>
          </div>

          <!-- Groups pane -->
          <div v-else>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] text-gray-500">
                Attach user to one or more MinIO groups
              </span>
              <span class="text-[11px] text-gray-400">
                Selected: {{ form.groups.length }}
              </span>
            </div>

            <div
              v-if="availableGroups.length"
              class="border border-gray-200 rounded max-h-40 overflow-y-auto bg-secondary"
            >
              <label
                v-for="group in availableGroups"
                :key="group"
                class="flex items-center justify-between px-3 py-1.5 text-xs border-b last:border-b-0 border-gray-100"
              >
                <div class="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    :value="group"
                    v-model="form.groups"
                    class="h-4 w-4 rounded border-gray-300"
                  />
                  <span class="font-mono text-[11px] break-all">
                    {{ group }}
                  </span>
                </div>
              </label>
            </div>
            <p v-else class="text-[11px] text-gray-500 italic">
              No groups loaded. User will not be attached to any groups.
            </p>
          </div>
        </section>

        <!-- Errors -->
        <p class="text-xs text-red-600" v-if="localError">
          {{ localError }}
        </p>
        <p class="text-xs text-red-600" v-else-if="errorMessage">
          {{ errorMessage }}
        </p>
      </div>

      <!-- Footer -->
      <div class="px-5 py-3 border-t border-gray-200 flex justify-end space-x-2">
        <button
          class="px-3 py-1.5 text-xs rounded border border-gray-300 bg-secondary hover:bg-gray-100"
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
          Create user
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";

export interface MinioUserCreatePayload {
  username: string;
  secretKey: string;
  status: "enabled" | "disabled";
  policies: string[];
  groups: string[];
}

const props = defineProps<{
  modelValue: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  availablePolicies: string[];
  availableGroups: string[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "submit", payload: MinioUserCreatePayload): void;
}>();

const form = ref({
  username: "",
  secretKey: "",
  status: "enabled" as "enabled" | "disabled",
  policies: [] as string[],
  groups: [] as string[],
});

const localError = ref<string | null>(null);
const showSecret = ref(false);
const activeAccessTab = ref<"policies" | "groups">("policies");

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      resetForm();
    }
  }
);

function resetForm() {
  localError.value = null;
  showSecret.value = false;
  activeAccessTab.value = "policies";
  form.value = {
    username: "",
    secretKey: "",
    status: "enabled",
    policies: [],
    groups: [],
  };
}

function close() {
  emit("update:modelValue", false);
}

function generateSecret() {
  const length = 32;
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let result = "";
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  for (let i = 0; i < length; i += 1) {
    result += chars[array[i] % chars.length];
  }
  form.value.secretKey = result;
}

function submit() {
  localError.value = null;

  if (!form.value.username.trim()) {
    localError.value = "Username is required.";
    return;
  }

  if (!form.value.secretKey.trim()) {
    localError.value = "Secret key is required.";
    return;
  }

  const payload: MinioUserCreatePayload = {
    username: form.value.username.trim(),
    secretKey: form.value.secretKey,
    status: form.value.status,
    policies: [...form.value.policies],
    groups: [...form.value.groups],
  };

  emit("submit", payload);
}
</script>
