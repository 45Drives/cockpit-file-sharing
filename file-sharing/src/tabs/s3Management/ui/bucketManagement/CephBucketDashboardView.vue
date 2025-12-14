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
            {{ bucketName }} (Ceph RGW)
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
  
      <!-- Filters -->
      <div class="m-4 rounded-lg border-default bg-plugin-header p-4 text-sm text-slate-200 space-y-3">
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <!-- Bucket (read-only) -->
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Bucket
            </span>
            <input
              :value="bucketName"
              disabled
              class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-400 outline-none"
            />
          </div>
  
          <!-- UID filter -->
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Owner / UID filter
            </label>
            <input
              v-model="uidFilter"
              type="text"
              placeholder="Optional UID, leave empty for all users"
              class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-1"
            />
          </div>
  
          <!-- Start date -->
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Start date
            </label>
            <input
              v-model="startDate"
              type="date"
              class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
            />
          </div>
  
          <!-- End date -->
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium uppercase tracking-wide text-slate-400">
              End date
            </label>
            <input
              v-model="endDate"
              type="date"
              class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
            />
          </div>
        </div>
  
        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 mt-3">
  
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-md border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
              @click="setLastDays(7)"
            >
              Last 7 days
            </button>
            <button
              type="button"
              class="rounded-md border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
              @click="setLastDays(30)"
            >
              Last 30 days
            </button>
            <button
              type="button"
              class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
              @click="load"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
  
      <!-- Loading / error -->
      <div v-if="loading" class="mx-4 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
        Loading bucket usage…
      </div>
  
      <div
        v-else-if="error"
        class="mx-4 rounded-lg border border-red-900/60 bg-red-950/60 px-4 py-3 text-sm text-red-200"
      >
        {{ error }}
      </div>
  
      <!-- Content -->
<!-- Content -->
<div v-else-if="stats" class="space-y-4 m-4">
  <!-- Summary cards (traffic / ops) -->
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
      <p class="text-[11px] uppercase tracking-wide text-slate-500">
        Total bytes sent
      </p>
      <p class="mt-1 text-lg font-semibold">
        {{ formatBytes(stats.totalBytesSent) }}
      </p>
    </div>

    <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
      <p class="text-[11px] uppercase tracking-wide text-slate-500">
        Total bytes received
      </p>
      <p class="mt-1 text-lg font-semibold">
        {{ formatBytes(stats.totalBytesReceived) }}
      </p>
    </div>

    <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
      <p class="text-[11px] uppercase tracking-wide text-slate-500">
        Total operations
      </p>
      <p class="mt-1 text-lg font-semibold">
        {{ stats.totalOps.toLocaleString() }}
      </p>
    </div>

    <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
      <p class="text-[11px] uppercase tracking-wide text-slate-500">
        Successful operations
      </p>
      <p class="mt-1 text-lg font-semibold">
        {{ stats.totalSuccessfulOps.toLocaleString() }}
      </p>
      <p class="text-[11px] text-slate-500 mt-0.5">
        Success ratio:
        <span v-if="stats.totalOps > 0">
          {{ ((stats.totalSuccessfulOps / stats.totalOps) * 100).toFixed(1) }}%
        </span>
        <span v-else>n/a</span>
      </p>
    </div>
  </div>

  <!-- NEW: Bucket-level stats from radosgw-admin bucket stats -->
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    <!-- Objects / size / shards -->
    <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
      <p class="text-[11px] uppercase tracking-wide text-slate-500">
        Bucket data
      </p>
      <p class="mt-1 text-xs">
        Objects:
        <span class="font-semibold">
          {{ bucket.objectCount != null ? bucket.objectCount.toLocaleString() : "Unknown" }}
        </span>
      </p>
      <p class="text-xs">
        Total size:
        <span class="font-semibold">
          {{ formatBytes(bucket.sizeBytes ?? 0) }}
        </span>
      </p>
      <!-- <p class="text-xs mt-1">
        Shards:
        <span class="font-semibold">
          {{ bucket.numShards != null ? bucket.numShards : "Unknown" }}
        </span>
      </p> -->
    </div>

    <!-- Versioning / object lock -->
    <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
      <p class="text-[11px] uppercase tracking-wide text-slate-500">
        Versioning / Object lock
      </p>
      <p class="mt-1 text-xs">
        Versioning:
        <span class="font-semibold">
          {{ bucket.versioning || "Disabled" }}
        </span>
      </p>
      <p class="text-xs">
        Object lock:
        <span class="font-semibold">
          {{ bucket.objectLockEnabled ? "Enabled" : "Disabled" }}
        </span>
      </p>
    </div>

    <!-- Zonegroup / placement / quota -->
    <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
      <p class="text-[11px] uppercase tracking-wide text-slate-500">
        Layout & quota
      </p>
      <p class="mt-1 text-xs">
        Zonegroup:
        <span class="font-semibold">
          {{ bucket.zonegroup || "Unknown" }}
        </span>
      </p>
      <!-- <p class="text-xs">
        Placement rule:
        <span class="font-semibold">
          {{ bucket.placementRule || "default-placement" }}
        </span>
      </p> -->
      <!-- <p v-if="bucket.bucketQuota" class="text-xs mt-1">
        Bucket quota:
        <span class="font-semibold">
          <span v-if="stats.bucketQuota.maxSizeKb && stats.bucketQuota.maxSizeKb > 0">
            {{ formatBytes(stats.bucketQuota.maxSizeKb * 1024) }}
          </span>
          <span v-else>
            Unlimited size
          </span>
          <span class="ml-1">
            /
            {{
              stats.bucketQuota.maxObjects && stats.bucketQuota.maxObjects > 0
                ? stats.bucketQuota.maxObjects.toLocaleString() + " objects"
                : "unlimited objects"
            }}
          </span>
        </span>
      </p>
      <p v-else class="text-xs mt-1 text-slate-500">
        No bucket quota configured.
      </p> -->
    </div>
  </div>

  <!-- Per-user table (unchanged) -->
  <div class="rounded-lg border border-default bg-default overflow-hidden">
    <div class="border-b border-slate-800 px-4 py-2 text-sm font-medium text-slate-100">
      Per-user usage
    </div>
    <div v-if="perUser.length === 0" class="px-4 py-4 text-sm text-slate-400">
      No usage records for this bucket in the selected range.
    </div>
    <div v-else class="overflow-x-auto">
      <table class="min-w-full divide-y divide-slate-800 text-sm">
        <thead class="bg-slate-950/60">
          <tr>
            <th class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              Owner / UID
            </th>
            <th class="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
              Bytes sent
            </th>
            <th class="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
              Bytes received
            </th>
            <th class="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
              Ops
            </th>
            <th class="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-400">
              Successful ops
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">
          <tr
            v-for="row in perUser"
            :key="row.bucket + ':' + row.owner"
            class="hover:bg-slate-900/60"
          >
            <td class="px-4 py-2 text-xs text-slate-200">
              {{ row.owner || "Unknown" }}
            </td>
            <td class="px-4 py-2 text-right text-xs text-slate-200">
              {{ formatBytes(row.bytesSent) }}
            </td>
            <td class="px-4 py-2 text-right text-xs text-slate-200">
              {{ formatBytes(row.bytesReceived) }}
            </td>
            <td class="px-4 py-2 text-right text-xs text-slate-200">
              {{ row.ops.toLocaleString() }}
            </td>
            <td class="px-4 py-2 text-right text-xs text-slate-200">
              {{ row.successfulOps.toLocaleString() }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

</div>

  
      <div v-else class="mx-4 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-400">
        No data loaded yet. Adjust filters and click Refresh.
      </div>
      <!-- Bucket configuration -->
<div
  v-if="bucket"
  class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 m-4"
>
  <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
    <p class="text-[11px] uppercase tracking-wide text-slate-500">
      Owner / Region
    </p>
    <p class="mt-1 text-xs">
      Owner:
      <span class="font-semibold">
        {{ bucket.owner || "Unknown" }}
      </span>
    </p>
    <p class="text-xs">
      Region / Zone:
      <span class="font-semibold">
        {{ bucket.region || bucket.zone || bucket.zonegroup || "Unknown" }}
      </span>
    </p>
    <p class="text-xs mt-1">
      Created:
      {{ bucket.createdAt ? new Date(bucket.createdAt).toLocaleString() : "Unknown" }}
    </p>
    <p class="text-xs">
      Last modified:
      {{ bucket.lastModifiedTime ? new Date(bucket.lastModifiedTime).toLocaleString() : "Unknown" }}
    </p>
  </div>

  <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
    <p class="text-[11px] uppercase tracking-wide text-slate-500">
      Versioning / Object Lock
    </p>
    <p class="mt-1 text-xs">
      Versioning:
      <span class="font-semibold">
        {{ bucket.versioning || "Disabled" }}
      </span>
    </p>
    <p class="text-xs">
      Object lock:
      <span class="font-semibold">
        {{ bucket.objectLockEnabled ? "Enabled" : "Disabled" }}
      </span>
    </p>
    <p v-if="typeof bucket.quotaBytes === 'number'" class="text-xs mt-1">
      Bucket quota:
      <span class="font-semibold">
        {{ formatBytes(bucket.quotaBytes) }}
      </span>
    </p>
  </div>

  <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
    <p class="text-[11px] uppercase tracking-wide text-slate-500">
      Tags
    </p>
    <div v-if="bucket.tags && Object.keys(bucket.tags).length" class="mt-1 flex flex-wrap gap-1.5">
      <span
        v-for="(value, key) in bucket.tags"
        :key="key"
        class="inline-flex items-center rounded-full border border-default bg-slate-900 px-2 py-0.5 text-[11px] text-slate-200"
      >
        {{ key }}={{ value }}
      </span>
    </div>
    <p v-else class="mt-1 text-xs text-slate-500">
      No tags set on this bucket.
    </p>
  </div>
</div>
<!-- Security / access -->
<div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200 space-y-2">
  <div class="flex items-center justify-between">
    <p class="text-[11px] uppercase tracking-wide text-slate-500">
      Security & access
    </p>
    <span v-if="securityLoading" class="text-xs text-slate-400">
      Loading security…
    </span>
  </div>

  <p v-if="securityError" class="text-xs text-red-300">
    {{ securityError }}
  </p>

  <div v-else>
    <p class="text-xs">
      Public access:
      <span class="font-semibold">
        <template v-if="isPublic">Yes (AllUsers has READ or more)</template>
        <template v-else-if="isAuthenticatedRead">Authenticated users can read</template>
        <template v-else>No (private)</template>
      </span>
    </p>

    <details class="mt-1 text-xs text-slate-300">
      <summary class="cursor-pointer text-[11px] font-medium uppercase tracking-wide text-slate-500">
        View ACL rules
      </summary>
      <div v-if="bucketAcl && bucketAcl.length" class="mt-1 space-y-1">
        <div
          v-for="(rule, idx) in bucketAcl"
          :key="idx"
          class="flex justify-between text-[11px]"
        >
          <span>{{ rule.grantee }}</span>
          <span class="font-mono">{{ rule.permission }}</span>
        </div>
      </div>
      <p v-else class="mt-1 text-[11px] text-slate-500">
        No ACL rules loaded.
      </p>
    </details>

    <details class="mt-2 text-xs text-slate-300">
      <summary class="cursor-pointer text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Bucket policy JSON
      </summary>
      <pre v-if="bucketPolicy" class="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-400">
{{ bucketPolicy }}
      </pre>
      <p v-else class="mt-1 text-[11px] text-slate-500">
        No bucket policy set.
      </p>
    </details>
  </div>
</div>

    </div>
</template>
  
  <script setup lang="ts">
  import { computed, onMounted, ref } from "vue";
  // Adjust import paths to your project layout:
  import type { BucketDashboardStats, BucketUserUsage, BucketDashboardOptions, CephAclRule, S3Bucket } from "../../types/types";
  import { getBucketDashboardStats, getCephBucketSecurity } from "../../api/s3CliAdapter";
  
  const props = defineProps<{
    bucketName: string;
    // optional default uid filter
    defaultUid?: string | null;
    bucket: S3Bucket;

    showBackButton?: boolean;
  }>();
  
  const emit = defineEmits<{
    (e: "back"): void;
  }>();
  
  const loading = ref(false);
  const error = ref<string | null>(null);
  const stats = ref<BucketDashboardStats | null>(null);
  const perUser = ref<BucketUserUsage[]>([]);
  
  // filters
  const uidFilter = ref(props.defaultUid ?? "");
  const startDate = ref<string>("");
  const endDate = ref<string>("");
  const showLog = ref(false);
  
  function toDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  
  function setLastDays(days: number) {
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - days);
  
    startDate.value = toDateString(start);
    endDate.value = toDateString(now);
  }
  
  async function load() {
    loading.value = true;
    error.value = null;
  
    try {
      const opts: BucketDashboardOptions = {
        bucket: props.bucketName,
        uid: uidFilter.value.trim() || undefined,
        startDate: startDate.value || undefined,
        endDate: endDate.value || undefined,
        showLog: showLog.value,
      };
  
      const { stats: s, perUser: u } = await getBucketDashboardStats(opts);
      stats.value = s;
      perUser.value = u;
    } catch (e: any) {
      error.value = e?.message ?? "Failed to load bucket usage";
      stats.value = null;
      perUser.value = [];
    } finally {
      loading.value = false;
    }
  }
  
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
  const securityLoading = ref(false);
const securityError = ref<string | null>(null);
const bucketPolicy = ref<string | null>(null);
const bucketAcl = ref<CephAclRule[] | null>(null);

const isPublic = computed(() => {
  if (!bucketAcl.value) return false;
  return bucketAcl.value.some(
    (r) =>
      r.grantee === "all-users" &&
      (r.permission === "READ" ||
        r.permission === "READ_WRITE" ||
        r.permission === "FULL_CONTROL"),
  );
});

const isAuthenticatedRead = computed(() => {
  if (!bucketAcl.value) return false;
  return bucketAcl.value.some(
    (r) =>
      r.grantee === "authenticated-users" &&
      (r.permission === "READ" ||
        r.permission === "READ_WRITE" ||
        r.permission === "FULL_CONTROL"),
  );
});

async function loadSecurity() {
  securityLoading.value = true;
  securityError.value = null;
  try {
    const { acl, policy } = await getCephBucketSecurity(props.bucketName);
    bucketAcl.value = acl ?? null;
    bucketPolicy.value = policy ?? null;
  } catch (e: any) {
    securityError.value = e?.message ?? "Failed to load bucket security configuration";
    bucketAcl.value = null;
    bucketPolicy.value = null;
  } finally {
    securityLoading.value = false;
  }
}

  onMounted(() => {
    // Sensible default: last 7 days
    setLastDays(7);
    load();
    loadSecurity();

  });


  </script>
  