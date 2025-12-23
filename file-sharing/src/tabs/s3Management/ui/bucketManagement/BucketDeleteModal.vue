<!-- BucketDeleteModal.vue -->
<template>
  <div v-if="bucket" class="fixed inset-0 z-20 flex items-center justify-center bg-black/60">
    <div class="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-950 p-4 shadow-xl text-sm">
      <h3 class="mb-2 text-base font-semibold text-slate-100">
        Delete bucket
      </h3>
      <p class="mb-4 text-slate-300">
        Are you sure you want to delete
        <span class="font-semibold">{{ bucket.name }}</span>?
        This may permanently remove all objects depending on the backend.
      </p>
      <div class="flex items-center justify-end gap-2">
        <button type="button" @click="$emit('cancel')"
          class="rounded-md border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800">
          Cancel
        </button>
        <button type="button" @click="$emit('confirm')"
          class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500">
          Delete
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { S3Bucket } from "../../types/types";

defineProps<{
  bucket: S3Bucket | null;
}>();

defineEmits<{
  (e: "cancel"): void;
  (e: "confirm"): void;
}>();
</script>