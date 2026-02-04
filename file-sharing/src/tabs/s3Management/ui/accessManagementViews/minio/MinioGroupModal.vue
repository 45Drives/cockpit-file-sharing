<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div class="bg-accent rounded-lg shadow-lg max-w-lg w-full mx-4">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-default flex items-center justify-between">
        <h3 class="text-base font-semibold">
          {{ isViewMode ? "Group details" : "Edit group" }} – "{{ groupName || "…" }}"
        </h3>

        <div class="flex items-center space-x-2">
          <!-- Edit button only in view mode -->
          <button v-if="isViewMode"
            class="text-sm px-2 py-1 rounded btn-primary text-default hover:bg-primary disabled:opacity-60"
            @click="switchToEdit" :disabled="loading || !groupName">
            Edit
          </button>

        </div>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 space-y-4 text-sm max-h-[70vh] overflow-y-auto">
        <div v-if="errorMessage" class="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {{ errorMessage }}
        </div>

        <div v-if="loading">
          {{ isViewMode ? "Loading group details..." : "Updating group..." }}
        </div>

        <div v-else-if="group">
          <!-- Members -->
          <section class="space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-semibold uppercase text-default">
                Members
              </h4>
              <span class="text-sm text-default">
                Selected: {{ localMembers.length }}
              </span>
            </div>

            <div class="border rounded px-2 py-2 max-h-40 overflow-y-auto bg-default">
              <label v-for="u in availableUsers" :key="u" class="flex items-center space-x-2 text-xs mb-1">
                <input type="checkbox" :value="u" v-model="localMembers" :disabled="isViewMode || loading" />
                <span class="font-mono">{{ u }}</span>
              </label>

              <p v-if="!availableUsers.length" class="text-xs italic text-muted">
                No users available.
              </p>
            </div>
          </section>

          <!-- Policies -->
          <section class="space-y-2">
            <div class="flex items-center justify-between mt-4">
              <h4 class="text-xs font-semibold uppercase text-default">
                Policies
              </h4>
              <span class="text-sm text-default">
                Selected: {{ localPolicies.length }}
              </span>
            </div>

            <div class="border rounded px-2 py-2 max-h-40 overflow-y-auto bg-default">
              <label v-for="p in availablePolicies" :key="p" class="flex items-center space-x-2 text-xs mb-1">
                <input type="checkbox" :value="p" v-model="localPolicies" :disabled="isViewMode || loading" />
                <span>{{ p }}</span>
              </label>

              <p v-if="!availablePolicies.length" class="text-xs italic text-muted">
                No policies available.
              </p>
            </div>
          </section>
        </div>

        <div v-else class="text-xs text-muted">
          No group selected.
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-3 border-t border-default flex justify-end space-x-2 ">
        <button class="px-3 py-1.5 text-xs bg-secondary rounded border border-default hover:bg-default"
          @click="$emit('update:modelValue', false)" :disabled="loading">
          {{ isViewMode ? "Close" : "Cancel" }}
        </button>

        <!-- Only show Save in edit mode -->
        <button v-if="!isViewMode"
          class="px-3 py-1.5 text-xs rounded border bg-primary text-default hover:bg-primary disabled:opacity-60"
          @click="onSubmit" :disabled="loading || !groupName">
          Save changes
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, computed } from "vue";
import type { MinioGroupInfo } from "../../../types/types";

const props = defineProps<{
  modelValue: boolean;
  loading: boolean;
  errorMessage: string | null;
  group: MinioGroupInfo | null;
  availableUsers: string[];
  availablePolicies: string[];
  mode: "view" | "edit";
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "submit", payload: { name: string; members: string[]; policies: string[] }): void;
  (e: "switch-mode", value: "view" | "edit"): void;
}>();

const localMembers = ref<string[]>([]);
const localPolicies = ref<string[]>([]);

const groupName = computed(() => props.group?.name ?? "");
const isViewMode = computed(() => props.mode === "view");

// Initialize local state from group whenever it changes
watch(
  () => props.group,
  (g) => {
    if (!g) return;
    localMembers.value = [...g.members];
    localPolicies.value = [...g.policies];
  },
  { immediate: true }
);

function onSubmit() {
  if (!groupName.value || isViewMode.value) return;

  emit("submit", {
    name: groupName.value,
    members: [...localMembers.value],
    policies: [...localPolicies.value],
  });
}

function switchToEdit() {
  if (!groupName.value) return;
  emit("switch-mode", "edit");
}
</script>