<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
  >
    <div class="bg-default rounded-lg shadow-lg max-w-md w-full mx-4">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-default flex items-center justify-between">
        <h3 class="text-base font-semibold">
          Create MinIO user
        </h3>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 space-y-4 text-sm">
        <!-- Basic identity -->
        <section class="space-y-2">
          <h4 class="text-xs font-semibold uppercase text-default">
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
              class="w-full border border-default bg-default rounded px-2 py-1 text-sm"
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
                  class="h-4 w-4 border-default rounded-full"
                />
                <span>Enabled</span>
              </label>
              <label class="inline-flex items-center space-x-1">
                <input
                  type="radio"
                  value="disabled"
                  v-model="form.status"
                  class="h-4 w-4 border-default rounded-full"
                />
                <span>Disabled</span>
              </label>
            </div>
          </div>
        </section>

        <!-- Credentials -->
        <section class="space-y-2">
          <h4 class="text-xs font-semibold uppercase text-default">
            Credentials
          </h4>

          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-600">
              Secret key is required for MinIO user creation.
            </span>
            <button
              type="button"
              class="text-xs px-2 py-1 rounded border border-default bg-primary text-white hover:bg-primary disabled:opacity-60"
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
                class="w-full border border-default bg-default rounded px-2 py-1 text-xs font-mono"
                placeholder="required"
              />
              <button
                type="button"
                class="px-2 py-1 text-smrounded border border-default bg-secondary hover:bg-gray-100 whitespace-nowrap"
                @click="showSecret = !showSecret"
              >
                {{ showSecret ? "Hide" : "Show" }}
              </button>
            </div>

            <div class="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm text-amber-800">
              Make sure to copy and store this secret key now. It cannot be retrieved later;
              if it is lost, you will need to generate a new secret for this user.
            </div>
          </div>
        </section>

        <!-- Access: Policies / Groups tabs -->
        <section class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold uppercase text-default">
              Access
            </h4>
          </div>

          <!-- Tabs -->
          <div class="flex border-b border-default mb-2 text-xs">
            <button
              type="button"
              class="px-3 py-1.5 -mb-px border-b-2"
              :class="activeAccessTab === 'policies'
                ? 'border-default text-default font-medium'
                : 'border-transparent text-secondary hover:text-default'"
              @click="activeAccessTab = 'policies'"
            >
              Policies
            </button>
            <button
              type="button"
              class="px-3 py-1.5 -mb-px border-b-2"
              :class="activeAccessTab === 'groups'
                ? 'border-default text-default font-medium'
                : 'border-transparent text-secondary hover:text-default'"
              @click="activeAccessTab = 'groups'"
            >
              Groups
            </button>
          </div>

          <!-- Policies pane -->
          <div v-if="activeAccessTab === 'policies'">
            <div class="flex items-center justify-between mb-1">
              <span class="text-smtext-default">
                Attach one or more MinIO policies
              </span>
              <span class="text-smtext-default">
                Selected: {{ form.policies.length }}
              </span>
            </div>

            <div
              v-if="availablePolicies.length"
              class="border border-default rounded max-h-40 overflow-y-auto bg-default"
            >
              <label
                v-for="policy in availablePolicies"
                :key="policy"
                class="flex items-center justify-between px-3 py-1.5 text-xs border-b last:border-b-0 border-default"
              >
                <div class="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    :value="policy"
                    v-model="form.policies"
                    class="h-4 w-4 rounded border-default"
                  />
                  <span class="font-mono text-smbreak-all">
                    {{ policy }}
                  </span>
                </div>
              </label>
            </div>
            <p v-else class="text-smtext-default italic">
              No policies loaded. User will be created with no direct policies.
            </p>
          </div>

          <!-- Groups pane -->
          <div v-else>
            <div class="flex items-center justify-between mb-1">
              <span class="text-smtext-default">
                Attach user to one or more MinIO groups
              </span>
              <span class="text-smtext-default">
                Selected: {{ form.groups.length }}
              </span>
            </div>

            <div
              v-if="availableGroups.length"
              class="border border-default rounded max-h-40 overflow-y-auto bg-default"
            >
              <label
                v-for="group in availableGroups"
                :key="group"
                class="flex items-center justify-between px-3 py-1.5 text-xs border-b last:border-b-0 border-default"
              >
                <div class="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    :value="group"
                    v-model="form.groups"
                    class="h-4 w-4 rounded border-default bg-accent"
                  />
                  <span class="font-mono text-smbreak-all">
                    {{ group }}
                  </span>
                </div>
              </label>
            </div>
            <p v-else class="text-smtext-default italic">
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
      <div class="px-5 py-3 border-t border-default flex justify-end space-x-2">
        <button
          class="px-3 py-1.5 text-xs rounded border border-default bg-secondary hover:bg-gray-100"
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
    result += chars[array[i]! % chars.length];
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
