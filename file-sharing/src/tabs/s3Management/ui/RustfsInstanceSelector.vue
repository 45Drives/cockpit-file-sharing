<template>
  <div class="mb-6 w-9/12 mx-auto">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xl font-semibold">RustFS instance</h3>

      <div class="flex items-center gap-2">
        <button
          v-if="selectedIsManual"
          type="button"
          class="btn btn-secondary"
          @click="emit('openManualEditor')"
        >
          Edit Selected
        </button>
        <button type="button" class="btn btn-primary" @click="toggleManualForm">
          {{ showManualForm ? "Hide Manual Setup" : "Manual Setup" }}
        </button>
        <button type="button" class="btn btn-secondary" @click="emit('refresh')" :disabled="loading">
          <ArrowPathIcon class="size-icon mr-1" />
        </button>
      </div>
    </div>

    <div v-if="loading" class="opacity-80">
      Detecting instances…
    </div>

    <div v-else-if="aliasError" class="text-red-600">
      {{ aliasError }}
    </div>

    <div v-else-if="aliases.length === 0" class="opacity-80">
      No RustFS instance detected.
    </div>

    <div v-else>
      <select
        :value="selectedAlias"
        class="w-full rounded-lg border border-default bg-accent px-4 py-3"
        @change="onAliasChange"
      >
        <option disabled value="">Select an instance…</option>
        <option v-for="a in aliases" :key="a.alias" :value="a.alias">
          {{ a.alias }}{{ a.url ? ` (${a.url})` : "" }}
        </option>
      </select>

      <div class="mt-2 text-sm opacity-70">
        Select the RustFS instance you want to manage.
      </div>
    </div>

    <div v-if="showManualForm || needsManualCreds" class="mt-4 rounded-lg border border-default p-4">
      <div class="mb-2 flex items-center justify-between">
        <div class="text-sm font-semibold">Manual RustFS credentials</div>
        <button type="button" class="btn btn-secondary" @click="emit('update:showManualForm', false)">
          Close
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold">Host</span>
          <input
            :value="manualHost"
            type="text"
            placeholder="e.g. localhost"
            class="rounded-lg border border-default bg-accent px-3 py-2"
            @input="emit('update:manualHost', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold">Port</span>
          <input
            :value="manualPort"
            type="text"
            placeholder="e.g. 9200"
            class="rounded-lg border border-default bg-accent px-3 py-2"
            @input="emit('update:manualPort', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold">Access Key</span>
          <input
            :value="manualAccessKey"
            type="text"
            placeholder="Access key"
            class="rounded-lg border border-default bg-accent px-3 py-2"
            @input="emit('update:manualAccessKey', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-semibold">Secret Key</span>
          <div class="relative">
            <input
              :value="manualSecretKey"
              :type="showManualSecretKey ? 'text' : 'password'"
              placeholder="Secret key"
              class="w-full rounded-lg border border-default bg-accent px-3 py-2 pr-10"
              @input="emit('update:manualSecretKey', ($event.target as HTMLInputElement).value)"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 inline-flex items-center px-2 text-muted hover:text-default"
              :aria-label="showManualSecretKey ? 'Hide secret key' : 'Show secret key'"
              @click="showManualSecretKey = !showManualSecretKey"
            >
              <EyeIcon v-if="showManualSecretKey" class="h-4 w-4" />
              <EyeSlashIcon v-else class="h-4 w-4" />
            </button>
          </div>
        </label>
        <label class="flex flex-col gap-1 md:col-span-2">
          <span class="text-xs font-semibold">Region</span>
          <input
            :value="manualRegion"
            type="text"
            placeholder="default: us-east-1"
            class="rounded-lg border border-default bg-accent px-3 py-2"
            @input="emit('update:manualRegion', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <div class="mt-3 flex justify-end gap-2">
        <button type="button" class="btn btn-secondary" :disabled="applyingManual" @click="emit('applyManualConnection')">
          {{ applyingManual ? "Testing..." : "Use Manual Connection" }}
        </button>
      </div>

      <div v-if="manualSaved.length" class="mt-4">
        <div class="text-sm font-semibold mb-2">Saved manual credentials</div>
        <div class="space-y-2">
          <div
            v-for="entry in manualSaved"
            :key="`${entry.accessKey}:${entry.endpointUrl}`"
            class="flex items-center justify-between rounded-md border border-default px-3 py-2"
          >
            <div class="text-sm">
              <div class="font-semibold">{{ entry.accessKey }}</div>
              <div class="opacity-70">{{ entry.endpointUrl }}</div>
            </div>
            <button
              v-if="entry.source === 'manual'"
              type="button"
              class="inline-flex items-center text-white border border-red-600 bg-red-500 text-default text-xs font-semibold rounded px-2 py-1 hover:bg-red-600 disabled:opacity-60"
              :disabled="deletingManual === entry.accessKey"
              @click="emit('removeManualConnection', entry.accessKey)"
            >
              {{ deletingManual === entry.accessKey ? "Removing..." : "Delete" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { RustfsManualSavedConnection } from "../api/rustfsCliAdapter";
import { ArrowPathIcon, EyeIcon, EyeSlashIcon } from "@heroicons/vue/20/solid";

type RustfsAliasOption = {
  alias: string;
  url?: string;
};

const props = defineProps<{
  loading: boolean;
  aliasError: string | null;
  aliases: RustfsAliasOption[];
  selectedAlias: string;
  showManualForm: boolean;
  needsManualCreds: boolean;
  manualHost: string;
  manualPort: string;
  manualAccessKey: string;
  manualSecretKey: string;
  manualRegion: string;
  applyingManual: boolean;
  manualSaved: RustfsManualSavedConnection[];
  deletingManual: string | null;
  selectedIsManual: boolean;
  selectedManualAccessKey: string;
}>();

const emit = defineEmits<{
  (e: "update:selectedAlias", value: string): void;
  (e: "update:showManualForm", value: boolean): void;
  (e: "update:manualHost", value: string): void;
  (e: "update:manualPort", value: string): void;
  (e: "update:manualAccessKey", value: string): void;
  (e: "update:manualSecretKey", value: string): void;
  (e: "update:manualRegion", value: string): void;
  (e: "refresh"): void;
  (e: "openManualEditor"): void;
  (e: "applyManualConnection"): void;
  (e: "removeManualConnection", accessKey: string): void;
}>();

const showManualSecretKey = ref(false);

function onAliasChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  emit("update:selectedAlias", String(target.value ?? ""));
}

function toggleManualForm() {
  emit("update:showManualForm", !props.showManualForm);
}
</script>
