<template>
    <div class="space-y-4 sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
      <!-- Header -->
      <div
        class="flex items-center justify-between bg-well rounded-md shadow text-default my-2 ring-1 ring-black ring-opacity-5 p-4 m-4"
      >
        <div>
          <h2 class="text-xl font-semibold text-slate-100">
            Bucket usage dashboard
          </h2>
          <p class="text-sm text-slate-400">
            {{ bucketName }} (MinIO)
          </p>
        </div>
  
        <div class="flex items-center gap-2">
          <button
            v-if="showBackButton"
            type="button"
            class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
            @click="$emit('back')"
          >
            Back
          </button>
        </div>
      </div>
  
      <!-- Loading / error -->
      <div
        v-if="loading"
        class="mx-4 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300"
      >
        Loading bucket usage…
      </div>
  
      <div
        v-else-if="error"
        class="mx-4 rounded-lg border border-red-900/60 bg-red-950/60 px-4 py-3 text-sm text-red-200"
      >
        {{ error }}
      </div>
  
      <!-- Content -->
      <div v-else-if="stats" class="space-y-4 m-4">
        <!-- Summary cards -->
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
  <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
    <p class="text-[11px] uppercase tracking-wide text-slate-500">Total size</p>
    <p class="mt-1 text-lg font-semibold">{{ formatBytes(stats.totalSizeBytes) }}</p>
    <p v-if="stats.quotaBytes" class="text-[11px] text-slate-500 mt-0.5">
      Quota: {{ formatBytes(stats.quotaBytes) }}
    </p>
  </div>

  <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
    <p class="text-[11px] uppercase tracking-wide text-slate-500">Objects</p>
    <p class="mt-1 text-lg font-semibold">{{ stats.objectCount.toLocaleString() }}</p>
  </div>

  <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
    <p class="text-[11px] uppercase tracking-wide text-slate-500">Versions</p>
    <p class="mt-1 text-lg font-semibold">
      {{ stats.versionCount != null ? stats.versionCount.toLocaleString() : "n/a" }}
    </p>
  </div>

  <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
    <p class="text-[11px] uppercase tracking-wide text-slate-500">Delete markers</p>
    <p class="mt-1 text-lg font-semibold">
      {{ stats.deleteMarkersCount != null ? stats.deleteMarkersCount.toLocaleString() : "n/a" }}
    </p>
  </div>

  <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
    <p class="text-[11px] uppercase tracking-wide text-slate-500">Versioning</p>
    <p class="mt-1 text-lg font-semibold">{{ versioningLabel }}</p>
  </div>

  <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
    <p class="text-[11px] uppercase tracking-wide text-slate-500">Object lock</p>
    <p class="mt-1 text-lg font-semibold">
      {{ stats.objectLockEnabled ? "Enabled" : "Disabled" }}
    </p>
    <p v-if="stats.objectLockMode" class="text-[11px] text-slate-500 mt-0.5">
      Mode: {{ stats.objectLockMode }}
    </p>
  </div>
</div>

  
        <!-- Bucket configuration -->
        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
            <p class="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
              Bucket configuration
            </p>
  
            <dl class="space-y-1 text-xs text-slate-200">
  <div class="flex justify-between gap-2">
    <dt class="text-slate-500">Region / Location</dt>
    <dd class="font-medium">{{ stats.location || props.bucket.region || "Unknown" }}</dd>
  </div>

  <div class="flex justify-between gap-2">
    <dt class="text-slate-500">Last modified</dt>
    <dd class="font-medium">{{ formatDate(stats.lastModified) }}</dd>
  </div>

  <div class="flex justify-between gap-2">
    <dt class="text-slate-500">Policy type</dt>
    <dd class="font-medium">{{ stats.policyType || "Unknown" }}</dd>
  </div>

  <div class="flex justify-between gap-2">
    <dt class="text-slate-500">Encryption</dt>
    <dd class="font-medium">{{ stats.encryptionConfigured ? "Configured" : "None" }}</dd>
  </div>

  <div class="flex justify-between gap-2">
    <dt class="text-slate-500">ILM</dt>
    <dd class="font-medium">{{ stats.ilmConfigured ? "Configured" : "Disabled" }}</dd>
  </div>

  <div class="flex justify-between gap-2">
    <dt class="text-slate-500">Replication</dt>
    <dd class="font-medium">
      {{ stats.replicationEnabled ? "Enabled" : "Disabled" }}
    </dd>
  </div>
</dl>

          </div>
  
          <!-- Tags -->
          <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
            <p class="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
              Tags
            </p>
            <div v-if="tagsList.length" class="flex flex-wrap gap-1.5 text-xs">
              <span
                v-for="tag in tagsList"
                :key="tag.key"
                class="inline-flex items-center rounded-full border border-default bg-default px-2 py-0.5 text-[11px] text-slate-200"
              >
                {{ tag.key }}={{ tag.value }}
              </span>
            </div>
            <p v-else class="text-xs text-slate-400">
              No tags configured on this bucket.
            </p>
          </div>
        </div>
        <div
  v-if="stats.replicationEnabled && stats.replicationUsage"
  class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200"
>
  <p class="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
    Replication health
  </p>

  <dl class="space-y-1 text-xs text-slate-200">
    <div class="flex justify-between gap-2">
      <dt class="text-slate-500">Pending</dt>
      <dd class="font-medium">
        {{ (stats.replicationUsage.objectsPendingReplicationCount ?? 0).toLocaleString() }}
        ({{ formatBytes(stats.replicationUsage.objectsPendingReplicationTotalSize ?? 0) }})
      </dd>
    </div>
    <div class="flex justify-between gap-2">
      <dt class="text-slate-500">Failed</dt>
      <dd class="font-medium">
        {{ (stats.replicationUsage.objectsFailedReplicationCount ?? 0).toLocaleString() }}
        ({{ formatBytes(stats.replicationUsage.objectsFailedReplicationTotalSize ?? 0) }})
      </dd>
    </div>
  </dl>
</div>

        <!-- Size histogram, if available -->
        <div
          v-if="histogramEntries.length"
          class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200"
        >
          <p class="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
            Object size distribution
          </p>
          <div class="space-y-1 text-xs text-slate-200">
            <div
              v-for="entry in histogramEntries"
              :key="entry.label"
              class="flex items-center gap-2"
            >
              <div class="w-48 text-slate-400">
                {{ entry.label }}
              </div>
              <div class="w-16 text-right">
                {{ entry.count }}
              </div>
            </div>
          </div>
        </div>
  
        <!-- Raw JSON (debug) -->
        <details class="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-slate-300">
          <summary class="cursor-pointer text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Raw MinIO stat JSON (debug)
          </summary>
          <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-400">
  {{ JSON.stringify(stats.raw, null, 2) }}
          </pre>
        </details>
      </div>
  
      <div
        v-else
        class="mx-4 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-400"
      >
        No data loaded yet.
      </div>
    </div>
</template>
<script setup lang="ts">
    import { computed, onMounted, ref } from "vue";
    import type { S3Bucket, MinioBucketDashboardStats } from "../../types/types";
    import { getMinioBucketDashboardStats } from "../../api/minioCliAdapter";
    
    const props = defineProps<{
      bucketName: string;
      bucket: S3Bucket;
      showBackButton?: boolean;
    }>();
    
    const emit = defineEmits<{
      (e: "back"): void;
    }>();
    
    const loading = ref(false);
    const error = ref<string | null>(null);
    const stats = ref<MinioBucketDashboardStats | null>(null);
    
    const versioningLabel = computed(() => {
      if (props.bucket.versioning) {
        return props.bucket.versioning;
      }
      if (stats.value?.versioningStatus) {
        return stats.value.versioningStatus;
      }
      return "Unknown";
    });
    
    const tagsList = computed(() => {
      const out: Array<{ key: string; value: string }> = [];
      const tags = props.bucket.tags;
      if (!tags) return out;
      for (const [key, value] of Object.entries(tags)) {
        out.push({ key, value: String(value) });
      }
      return out;
    });
    
    const histogramEntries = computed(() => {
  const h = stats.value?.sizeHistogram;
  if (!h) return [];

  const entries = Object.entries(h)
    .map(([label, count]) => ({
      label,
      count: Number(count) || 0,
    }))
    .filter((e) => e.count > 0);

  if (!entries.length) return [];

  const total = entries.reduce((sum, e) => sum + e.count, 0) || 1;

  return entries.map((e) => ({
    ...e
  }));
});

    
    function formatBytes(bytes: number): string {
      if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    
      const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
      let value = bytes;
      let idx = 0;
    
      while (value >= 1024 && idx < units.length - 1) {
        value /= 1024;
        idx += 1;
      }
    
      return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[idx]}`;
    }
    
    async function load() {
      loading.value = true;
      error.value = null;
    
      try {
        stats.value = await getMinioBucketDashboardStats(props.bucketName);
      } catch (e: any) {
        error.value = e?.message ?? "Failed to load MinIO bucket usage";
        stats.value = null;
      } finally {
        loading.value = false;
      }
    }
    function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

    onMounted(() => {
      load();
    });
    </script>
    