<template>
  <div v-if="bucket" class="fixed inset-0 z-20 flex items-center justify-center bg-black/60">
    <div class="w-full max-w-sm rounded-lg border border-default bg-well p-4 shadow-xl text-sm">
      <h3 class="mb-2 text-base font-semibold text-default">
        Delete bucket
      </h3>

      <p class="mb-3 text-default">
        Are you sure you want to delete
        <span class="font-semibold">{{ bucket.name }}</span>?
        This may permanently remove all objects depending on the backend.
      </p>

      <div class="mb-4">
        <label class="mb-1 block text-xs font-medium text-default">
          Type <span class="font-semibold">delete</span> to confirm
        </label>

        <input v-model="confirmText" type="text"
          class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-default outline-none focus:ring-1"
          placeholder="delete" @keydown.enter.prevent="onEnter" />

        <p v-if="confirmText && !isConfirmed" class="mt-1 text-xs text-default">
          Please type exactly <span class="font-semibold">delete</span> to enable deletion.
        </p>
      </div>

      <div class="flex items-center justify-end gap-2">
        <button type="button" @click="onCancel"
          class="rounded-md border border-default bg-secondary px-3 py-1.5 text-xs font-medium text-default hover:bg-slate-800">
          Cancel
        </button>

        <button type="button" :disabled="!isConfirmed" @click="onConfirm"
          class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-default hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed">
          Delete
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { S3Bucket } from "../../types/types";

const props = defineProps<{
  bucket: S3Bucket | null;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "confirm"): void;
}>();

const confirmText = ref("");

const isConfirmed = computed(() => confirmText.value.trim() === "delete");

watch(
  () => props.bucket,
  () => {
    // Reset input when opening/closing or switching buckets
    confirmText.value = "";
  }
);

function onCancel() {
  confirmText.value = "";
  emit("cancel");
}

function onConfirm() {
  if (!isConfirmed.value) return;
  confirmText.value = "";
  emit("confirm");
}

function onEnter() {
  if (isConfirmed.value) onConfirm();
}
</script>
