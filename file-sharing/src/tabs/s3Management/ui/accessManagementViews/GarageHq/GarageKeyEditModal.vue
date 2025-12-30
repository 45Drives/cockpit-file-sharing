<template>
  <div v-if="open && keyDetail" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
    <div class="w-full max-w-md rounded-lg bg-default p-6 shadow-lg">
      <h2 class="text-lg font-semibold text-default border-b border-default">
        Edit access key
      </h2>

      <p class="mt-1 text-sm text-default font-semibold">
        Key ID:
        <span class="font-mono">{{ keyDetail.id }}</span>
      </p>
      <p class="mt-1 text-xs text-default">
        The key ID and secret key cannot be changed after creation. You can update the display
        name and whether this key is allowed to create buckets.
      </p>

      <form class="mt-4 space-y-4" @submit.prevent="onSubmit">
        <div>
          <label class="block text-sm font-medium text-default">
            Name
          </label>
          <input v-model="name" type="text" required
            class="mt-1 block w-full bg-accent rounded-md border border-default  px-3 py-2 text-sm text-default shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        <div class="flex items-center gap-2">
          <input id="edit-can-bucket" v-model="canCreateBuckets" type="checkbox"
            class="h-4 w-4 rounded bg-accent border-default text-primary focus:ring-primary" />
          <label for="edit-can-bucket" class="text-sm text-defaul">
            Can create buckets
          </label>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button type="button"
            class="inline-flex items-center rounded-md border border-default bg-secondary px-3 py-1.5 text-sm font-medium text-default hover:bg-secondary"
            @click="onClose" :disabled="saving">
            Cancel
          </button>
          <button type="submit"
            class="inline-flex items-center rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-danger disabled:opacity-60"
            :disabled="saving">
            Save
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { GarageKeyDetail } from "@/tabs/s3Management/types/types";

const props = defineProps<{
  open: boolean;
  saving: boolean;
  keyDetail: GarageKeyDetail | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", payload: { name: string; canCreateBuckets: boolean }): void;
}>();

const name = ref("");
const canCreateBuckets = ref(false);

// Sync local form state when modal opens / key changes
watch(
  () => [props.open, props.keyDetail] as const,
  ([open, key]) => {
    if (open && key) {
      name.value = key.name;
      canCreateBuckets.value = key.canCreateBuckets === true;
    }
  },
  { immediate: true }
);

function onClose() {
  if (props.saving) return;
  emit("close");
}

function onSubmit() {
  const trimmedName = name.value.trim();
  if (!trimmedName) return;

  emit("submit", {
    name: trimmedName,
    canCreateBuckets: canCreateBuckets.value,
  });
}
</script>