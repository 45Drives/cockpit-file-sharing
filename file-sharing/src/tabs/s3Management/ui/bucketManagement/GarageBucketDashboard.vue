<template>
    <div class="space-y-4 sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
      <!-- Header -->
      <div class="flex items-center justify-between bg-well rounded-md shadow text-default my-2 ring-1 ring-black ring-opacity-5 p-4 m-4">
        <div>
          <h2 class="text-xl font-semibold">Bucket usage dashboard</h2>
          <p class="text-sm text-muted">{{ props.bucket.name }} (Garage)</p>
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
          <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm ">
            <label class="text-label">Total size</label>
            <p class="mt-1 text-lg font-semibold">{{ formatBytes(stats.totalSizeBytes) }}</p>
            <p v-if="stats.quotaBytes" class="text-xs text-default mt-0.5">
              Quota: {{ formatBytes(stats.quotaBytes) }}
            </p>
          </div>
  
          <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm ">
            <label class="text-label">Objects</label>
            <p class="mt-1 text-lg font-semibold">{{ stats.objectCount.toLocaleString() }}</p>
            <p v-if="stats.maxObjects != null" class="text-xs text-default mt-0.5">
              Max: {{ stats.maxObjects.toLocaleString() }}
            </p>
          </div>
  
          <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm ">
            <label class="text-label">Website</label>
            <p class="mt-1 text-lg font-semibold">
              {{ stats.websiteEnabled ? "Enabled" : "Disabled" }}
            </p>
          </div>
  
          <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm">
            <label class="text-label">Access keys</label>
            <p class="mt-1 text-lg font-semibold">{{ stats.keys.length.toLocaleString() }}</p>
            <p class="text-xs text-default mt-0.5">
              RW: {{ rwKeyCount.toLocaleString() }} • R-only: {{ roKeyCount.toLocaleString() }}
            </p>
          </div>
        </div>
  
        <!-- Config + Quotas -->
        <div class="grid gap-4 md:grid-cols-2">
          <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm ">
            <label class="text-label">Bucket configuration</label>
  
            <dl class="space-y-1 text-sm mt-1">
              <div class="flex justify-between gap-2">
                <dt class="text-default">Created</dt>
                <dd class="font-medium">{{ formatDate(stats.createdAt) }}</dd>
              </div>
  
              <div class="flex justify-between gap-2">
                <dt class="text-default">Garage bucket ID</dt>
                <dd class="font-medium truncate max-w-[240px]" :title="stats.bucketId || ''">
                  {{ stats.bucketId || "—" }}
                </dd>
              </div>
  
              <div class="flex justify-between gap-2">
                <dt class="text-default">Aliases</dt>
                <dd class="font-medium text-right">
                  <span v-if="aliases.length">{{ aliases.join(", ") }}</span>
                  <span v-else>—</span>
                </dd>
              </div>
            </dl>
          </div>
  
          <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm">
            <label class="text-label">Quotas</label>
  
            <dl class="space-y-1 text-sm text-default mt-1">
              <div class="flex justify-between gap-2">
                <dt class="text-default">Max size</dt>
                <dd class="font-medium">
                  {{ stats.quotaBytes != null ? formatBytes(stats.quotaBytes) : "—" }}
                </dd>
              </div>
  
              <div class="flex justify-between gap-2">
                <dt class="text-default">Max objects</dt>
                <dd class="font-medium">
                  {{ stats.maxObjects != null ? stats.maxObjects.toLocaleString() : "—" }}
                </dd>
              </div>
  
              <div class="flex justify-between gap-2" v-if="stats.quotaBytes != null">
                <dt class="text-default">Remaining size</dt>
                <dd class="font-medium">{{ formatBytes(remainingSizeBytes) }}</dd>
              </div>
  
              <div class="flex justify-between gap-2" v-if="stats.maxObjects != null">
                <dt class="text-default">Remaining objects</dt>
                <dd class="font-medium">{{ remainingObjects.toLocaleString() }}</dd>
              </div>
            </dl>
          </div>
        </div>
  
        <!-- Keys table -->
        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
          <label class="text-label">Keys with access</label>
  
          <div v-if="stats.keys.length" class="overflow-auto">
            <table class="min-w-full text-xs">
              <thead class="text-default">
                <tr class="border-b border-default">
                  <th class="text-left  py-2 pr-3">Permissions</th>
                  <th class="text-left  py-2 pr-3">Access key</th>
                  <th class="text-left  py-2 pr-3">Local aliases</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="k in stats.keys" :key="k.accessKey" class="border-b border-default">
                  <td class="py-2 pr-3 font-medium">{{ k.permissions }}</td>
                  <td class="py-2 pr-3 font-mono">{{ k.accessKey }}</td>
                  <td class="py-2 pr-3">
                    <span v-if="k.localAliases.length">{{ k.localAliases.join(", ") }}</span>
                    <span v-else class="text-default">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
  
          <p v-else class="text-xs text-default">No keys granted access to this bucket.</p>
        </div>
  
        <!-- Raw JSON (debug) -->
        <details class="rounded-lg border border-default bg-default px-4 py-3 text-xs text-default">
          <summary class="cursor-pointer text-sm font-medium uppercase tracking-wide text-default">
            Raw Garage bucket info (debug)
          </summary>
          <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-sm text-default">{{ stats.raw }}</pre>
        </details>
      </div>
  
      <div
        v-else
        class="mx-4 rounded-lg border border-default bg-default px-4 py-3 text-sm text-default"
      >
        No data loaded yet.
      </div>
    </div>
</template>
  
  <script setup lang="ts">
  import { computed, onMounted, ref } from "vue";
  import type { GarageBucket } from "../../types/types";
  import type { GarageBucketDashboardStats } from "../../types/types";
  import { getGarageBucketDashboardStats } from "../../api/garageCliAdapter";
  import { formatBytes } from "../../bucketBackends/bucketUtils";
  
  const props = defineProps<{
  bucket: GarageBucket;
  showBackButton?: boolean;
}>();
const garageHandle = computed(() => {
  return (
    props.bucket.garageId ||
    props.bucket.garageAliases?.[0] ||
    props.bucket.name
  );
});

  
  defineEmits<{
    (e: "back"): void;
  }>();
  
  const loading = ref(false);
  const error = ref<string | null>(null);
  const stats = ref<GarageBucketDashboardStats | null>(null);
  
  const aliases = computed(() => props.bucket.garageAliases ?? []);

  
  const rwKeyCount = computed(() => {
    const ks = stats.value?.keys ?? [];
    return ks.filter((k) => String(k.permissions).toUpperCase().includes("W")).length;
  });
  
  const roKeyCount = computed(() => {
    const ks = stats.value?.keys ?? [];
    return ks.filter((k) => {
      const p = String(k.permissions).toUpperCase();
      return p.includes("R") && !p.includes("W");
    }).length;
  });
  
  const remainingSizeBytes = computed(() => {
    if (!stats.value?.quotaBytes) return 0;
    return Math.max(0, stats.value.quotaBytes - stats.value.totalSizeBytes);
  });
  
  const remainingObjects = computed(() => {
    if (stats.value?.maxObjects == null) return 0;
    return Math.max(0, stats.value.maxObjects - stats.value.objectCount);
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
      stats.value = await getGarageBucketDashboardStats(garageHandle.value);
    } catch (e: any) {
      error.value = e?.message ?? "Failed to load Garage bucket usage";
      stats.value = null;
    } finally {
      loading.value = false;
    }
  }
  
  onMounted(() => {
    load();
  });
  </script>
  