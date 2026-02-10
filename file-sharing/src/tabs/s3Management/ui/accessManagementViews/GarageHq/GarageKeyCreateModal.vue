<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="w-full max-w-md rounded-lg bg-default p-6 shadow-lg">
      <h2 class="text-lg font-semibold text-default border-b border-default">
        Create new key
      </h2>

      <form class="mt-4 space-y-4" @submit.prevent="onSubmit">
        <div>
          <label class="block text-sm font-medium text-default">
            Name
          </label>
          <input v-model="name" type="text" required
            class="mt-1 block w-full bg-accent rounded-md border border-default px-3 py-2 text-sm text-default shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="backup-user" />
        </div>

        <div class="flex items-center gap-2">
          <input id="create-can-bucket" v-model="canCreateBuckets" type="checkbox"
            class="h-4 w-4 bg-accent rounded border-default bg-default text-primary focus:ring-primary" />
          <label for="create-can-bucket" class="text-sm text-default">
            Can create buckets
          </label>
        </div>

        <div>
          <label class="block text-sm font-medium text-default">
            Expires in (optional)
          </label>
          <input v-model="expiresIn" type="text"
            class="mt-1 block w-full bg-accent rounded-md bg-default border border-default-300 px-3 py-2 text-sm text-default shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="e.g. 30d, 12h, 1w" />
          <p class="mt-1 text-xs text-default">
            Passed to <code>--expires-in</code> (see parse_duration format).
          </p>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button type="button"
            class="inline-flex items-center rounded-md border border-default px-3 py-1.5 text-sm font-medium text-default hover:bg-slate-50"
            @click="onClose" :disabled="saving">
            Cancel
          </button>
          <button type="submit"
            class="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-default shadow-sm hover:bg-primary-dark disabled:opacity-60"
            :disabled="saving">
            Create
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", payload: { name: string; canCreateBuckets: boolean; expiresIn?: string }): void;
}>();

const name = ref("");
const canCreateBuckets = ref(false);
const expiresIn = ref("");

watch(
  () => props.open,
  open => {
    if (open) {
      name.value = "";
      canCreateBuckets.value = false;
      expiresIn.value = "";
    }
  }
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
    expiresIn: expiresIn.value.trim() || undefined,
  });
}
</script>