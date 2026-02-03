<!-- MinioGroupCreateModal.vue -->
<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div class="bg-accent rounded-lg shadow-lg max-w-sm w-full mx-4">
      <div class="px-5 py-4 border-b border-default flex items-center justify-between">
        <h3 class="text-base font-semibold">
          Create MinIO group
        </h3>
      </div>

      <div class="px-5 py-4 space-y-3 text-sm">
        <div v-if="localError" class="text-xs text-red-600">
          {{ localError }}
        </div>
        <div v-else-if="errorMessage" class="text-xs text-red-600">
          {{ errorMessage }}
        </div>

        <!-- Group name -->
        <div>
          <label class="block text-xs font-medium mb-1">
            Group name
          </label>
          <input v-model.trim="name" type="text"
            class="w-full border border-default bg-default rounded px-2 py-1 text-sm" placeholder="e.g. engineering" />
        </div>

        <!-- Members -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs font-medium ">
              Members
            </label>
            <span class="text-sm text-default">
              Selected: {{ selectedUsers.length }}
            </span>
          </div>

          <div v-if="availableUsers.length" class="border border-default rounded max-h-40 overflow-y-auto ">
            <label v-for="u in availableUsers" :key="u"
              class="flex items-center justify-between px-3 py-1.5 text-xs border-b last:border-b-0 border-default">
              <div class="flex items-center space-x-2">
                <input type="checkbox" :value="u" v-model="selectedUsers" class="h-4 w-4 rounded border-default" />
                <span class="font-mono text-sm break-all">
                  {{ u }}
                </span>
              </div>
            </label>
          </div>

          <p v-else class="text-sm text-muted italic mt-1">
            No users available. At least one user is required to create a group.
          </p>
        </div>

        <p class="text-sm text-muted">
          Groups are used to attach shared policies to multiple users. MinIO requires
          at least one member when creating a group.
        </p>
      </div>

      <div class="px-5 py-3 border-t border-default flex justify-end space-x-2">
        <button class="px-3 py-1.5 text-xs rounded border border-default bg-secondary hover:bg-gray-100" @click="close"
          :disabled="loading">
          Cancel
        </button>
        <button
          class="px-3 py-1.5 text-xs rounded border border-green-600 bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
          @click="submit" :disabled="loading || !availableUsers.length">
          Create group
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
  availableUsers: string[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "submit", payload: { name: string; members: string[] }): void;
}>();

const name = ref("");
const selectedUsers = ref<string[]>([]);
const localError = ref<string | null>(null);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      name.value = "";
      selectedUsers.value = [];
      localError.value = null;
    }
  }
);

function close() {
  emit("update:modelValue", false);
}

function submit() {
  localError.value = null;

  if (!name.value.trim()) {
    localError.value = "Group name is required.";
    return;
  }

  if (!selectedUsers.value.length) {
    localError.value = "At least one user is required to create a group.";
    return;
  }

  emit("submit", {
    name: name.value.trim(),
    members: [...selectedUsers.value],
  });
}
</script>