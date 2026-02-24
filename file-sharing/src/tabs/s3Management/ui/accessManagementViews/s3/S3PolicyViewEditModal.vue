<!-- MinioPolicyViewEditModal.vue -->
<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div class="bg-default rounded-lg shadow-lg max-w-xl w-full mx-4">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-default flex items-center justify-between">
        <h3 class="text-base font-semibold">
          Policy: "{{ policyName }}"
        </h3>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 space-y-3 text-sm">
        <!-- Errors -->
        <div v-if="localError" class="text-xs text-red-600">
          {{ localError }}
        </div>
        <div v-else-if="errorMessage" class="text-xs text-red-600">
          {{ errorMessage }}
        </div>

        <!-- Loading -->
        <div v-if="loading" class="text-sm text-gray-600">
          Loading policy...
        </div>

        <div v-else class="space-y-3">
          <!-- Name (read-only) -->
          <div>
            <label class="block text-xs font-medium mb-1">
              Policy name
            </label>
            <input type="text" :value="policyName || ''"
              class="w-full border border-default bg-default rounded px-2 py-1 text-sm text-default" disabled />
            <p class="text-sm text-muted mt-1">
              Policy names are managed in MinIO and cannot be changed here.
            </p>
          </div>

          <!-- JSON editor -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs font-medium">
                Policy JSON
              </label>
              <div class="flex items-center space-x-2">
                <button type="button"
                  class="px-2 py-1 text-sm rounded btn-secondary hover:bg-gray-100"
                  @click="resetJson">
                  Reset
                </button>
                <button type="button"
                  class="px-2 py-1 text-sm rounded btn-secondary hover:bg-gray-100"
                  @click="formatJson">
                  Format JSON
                </button>
              </div>
            </div>

            <textarea v-model="localJson"
              class="w-full border border-default bg-default rounded px-2 py-2 text-xs font-mono min-h-[260px]"
              placeholder="Policy JSON will appear here" />

            <p class="text-sm text-muted mt-1">
              Edit the JSON to change actions, resources, or conditions. Make sure it stays
              valid JSON and compatible with S3-style policies.
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-3 border-t border-default flex justify-end space-x-2">
        <button class="px-3 py-1.5 text-xs rounded btn-secondary hover:bg-gray-100" @click="close"
          :disabled="loading">
          Cancel
        </button>
        <button
          class="px-3 py-1.5 text-xs rounded border border-danger bg-danger text-default hover:bg-danger disabled:opacity-60"
          @click="save" :disabled="loading || !policyName">
          Save changes
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";

const props = defineProps<{
  modelValue: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  policyName: string | null;
  policyJson: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "save", payload: { name: string; json: string }): void;
}>();

const localJson = ref("");
const originalJson = ref("");
const localError = ref<string | null>(null);

// When the modal opens or the policy JSON changes, sync local state
watch(
  () => [props.modelValue, props.policyJson] as const,
  ([open, json]) => {
    if (open) {
      const val = json ?? "";
      localJson.value = val;
      originalJson.value = val;
      localError.value = null;
    }
  },
  { immediate: true }
);

function close() {
  emit("update:modelValue", false);
}

function resetJson() {
  localJson.value = originalJson.value;
  localError.value = null;
}

function formatJson() {
  if (!localJson.value.trim()) {
    return;
  }

  try {
    const parsed = JSON.parse(localJson.value);
    localJson.value = JSON.stringify(parsed, null, 2);
    localError.value = null;
  } catch (e: any) {
    localError.value = "Invalid JSON: " + (e?.message || "Could not parse policy.");
  }
}

function save() {
  localError.value = null;

  if (!props.policyName) {
    localError.value = "Policy name is missing.";
    return;
  }

  if (!localJson.value.trim()) {
    localError.value = "Policy JSON is required.";
    return;
  }

  try {
    JSON.parse(localJson.value);
  } catch (e: any) {
    localError.value = "Invalid JSON: " + (e?.message || "Could not parse policy.");
    return;
  }

  emit("save", {
    name: props.policyName,
    json: localJson.value,
  });
}
</script>