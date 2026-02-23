<template>
  <div class="space-y-4 sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
    <div
      class="flex items-center justify-between bg-well rounded-md shadow text-default my-2 ring-1 ring-black ring-opacity-5 p-4 m-4">
      <div>
        <h2 class="text-xl font-semibold text-default">Bucket usage dashboard</h2>
        <p class="text-md text-default">{{ bucketName }}</p>
      </div>

      <button v-if="showBackButton" type="button"
        class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-default shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
        @click="$emit('back')">
        <ArrowUturnLeftIcon class="size-icon" />
        Back
      </button>
    </div>

    <div v-if="loading" class="mx-4 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-default">
      Loading bucket usage…
    </div>
    <div v-else-if="error" class="mx-4 rounded-lg border border-red-900/60 bg-red-950/60 px-4 py-3 text-sm text-red-200">
      {{ error }}
    </div>

    <div v-else-if="stats" class="space-y-4 m-4">
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
          <label class="text-label">Total size</label>
          <p class="mt-1 text-lg font-semibold">{{ formatBytes(stats.totalSizeBytes) }}</p>
          <p v-if="stats.quotaBytes != null" class="text-sm text-default mt-0.5">
            Quota: {{ formatBytes(stats.quotaBytes) }}
          </p>
        </div>

        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
          <label class="text-label">Objects</label>
          <p class="mt-1 text-lg font-semibold">{{ stats.objectCount.toLocaleString() }}</p>
        </div>

        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
          <label class="text-label">Versions</label>
          <p class="mt-1 text-lg font-semibold">
            {{ stats.versionCount != null ? stats.versionCount.toLocaleString() : "n/a" }}
          </p>
        </div>

        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
          <label class="text-label">Delete markers</label>
          <p class="mt-1 text-lg font-semibold">
            {{ stats.deleteMarkersCount != null ? stats.deleteMarkersCount.toLocaleString() : "n/a" }}
          </p>
        </div>

        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
          <label class="text-label">Versioning</label>
          <p class="mt-1 text-lg font-semibold">{{ stats.versioningStatus || "Unknown" }}</p>
        </div>

        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
          <label class="text-label">Object lock</label>
          <p class="mt-1 text-lg font-semibold">{{ stats.objectLockEnabled ? "Enabled" : "Disabled" }}</p>
          <p v-if="stats.objectLockMode" class="text-sm text-default mt-0.5">
            Mode: {{ stats.objectLockMode }}
          </p>
          <p v-if="stats.objectLockRetentionDays" class="text-sm text-default mt-0.5">
            Retention: {{ stats.objectLockRetentionDays }} days
          </p>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
          <label class="text-label">Bucket info</label>
          <dl class="space-y-1 text-xs text-default">
            <div class="flex justify-between gap-2">
              <dt class="text-default">Region</dt>
              <dd class="font-medium">{{ bucket.region || "Unknown" }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-default">Last usage update</dt>
              <dd class="font-medium">{{ formatDate(stats.lastUpdate) }}</dd>
            </div>
          </dl>
        </div>

        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
          <label class="text-label">Tags</label>
          <div v-if="tagsList.length" class="flex flex-wrap gap-1.5 text-xs">
            <span v-for="tag in tagsList" :key="tag.key"
              class="inline-flex items-center rounded-full border border-default bg-default px-2 py-0.5 text-sm text-default">
              {{ tag.key }}={{ tag.value }}
            </span>
          </div>
          <p v-else class="text-xs text-muted">No tags configured on this bucket.</p>
        </div>
      </div>

      <details class="rounded-lg border border-default bg-default px-4 py-3 text-xs text-default">
        <summary class="cursor-pointer text-sm font-medium uppercase tracking-wide text-default">
          Raw RustFS datausage JSON (debug)
        </summary>
        <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-default">
{{ JSON.stringify(stats.raw, null, 2) }}
        </pre>
      </details>
    </div>

    <div v-else class="mx-4 rounded-lg border border-default bg-default px-4 py-3 text-sm text-muted">
      No data loaded yet.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { RustfsBucket, RustfsBucketDashboardStats } from "../../types/types";
import { getRustfsBucketDashboardStats } from "../../api/rustfsCliAdapter";
import { formatBytes } from "../../bucketBackends/bucketUtils";
import { ArrowUturnLeftIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{
  bucketName: string;
  bucket: RustfsBucket;
  showBackButton?: boolean;
}>();

defineEmits<{
  (e: "back"): void;
}>();

const loading = ref(false);
const error = ref<string | null>(null);
const stats = ref<RustfsBucketDashboardStats | null>(null);

const tagsList = computed(() => {
  const out: Array<{ key: string; value: string }> = [];
  const tags = props.bucket.tags;
  if (!tags) return out;
  for (const [key, value] of Object.entries(tags)) {
    out.push({ key, value: String(value) });
  }
  return out;
});

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    stats.value = await getRustfsBucketDashboardStats(props.bucketName);
  } catch (e: any) {
    error.value = e?.message ?? "Failed to load RustFS bucket usage";
    stats.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
});
</script>

