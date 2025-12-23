<template>
  <div class="space-y-4 sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
    <!-- Header -->
    <div
      class="flex items-center justify-between bg-well rounded-md shadow text-default my-2 ring-1 ring-black ring-opacity-5 p-4 m-4">
      <div>
        <h2 class="text-xl font-semibold text-default">
          Bucket usage dashboard
        </h2>
        <p class="text-md text-muted">
          {{ bucketName }} (Ceph RGW)
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button v-if="showBackButton" type="button"
          class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
          @click="$emit('back')">
          Back
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="m-4 rounded-lg border-default bg-plugin-header p-4 text-sm text-default space-y-3">
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <!-- Bucket (read-only) -->
        <div class="flex flex-col gap-1">
          <label class="text-label">
            Bucket
          </label>
          <input :value="bucketName" disabled
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-default outline-none" />
        </div>

        <!-- UID filter -->
        <div class="flex flex-col gap-1">
          <label class="text-label">
            Owner / UID filter
          </label>
          <input v-model="uidFilter" type="text" placeholder="Optional UID, leave empty for all users"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-default placeholder:text-muted outline-none focus:ring-1" />
        </div>

        <!-- Start date -->
        <div class="flex flex-col gap-1">
          <label class="text-label">
            Start date
          </label>
          <input v-model="startDate" type="date"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1" />
        </div>

        <!-- End date -->
        <div class="flex flex-col gap-1">
          <label class="text-label">
            End date
          </label>
          <input v-model="endDate" type="date"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1" />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-default mt-3">

        <div class="flex gap-2">
          <button type="button"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
            @click="setLastDays(7)">
            Last 7 days
          </button>
          <button type="button"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
            @click="setLastDays(30)">
            Last 30 days
          </button>
          <button type="button"
            class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
            @click="load">
            Refresh
          </button>
        </div>
      </div>
    </div>

    <!-- Loading / error -->
    <div v-if="loading"
      class="mx-4 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
      Loading bucket usage…
    </div>

    <div v-else-if="error"
      class="mx-4 rounded-lg border border-red-900/60 bg-red-950/60 px-4 py-3 text-sm text-red-200">
      {{ error }}
    </div>

    <!-- Content -->
    <!-- Content -->
    <div v-if="usageWarning"
      class="mx-4 rounded-lg border border-yellow-700/60 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-200">
      {{ usageWarning }}
    </div>
    <div v-if="stats" class="space-y-4 m-4">
      <!-- Summary cards (traffic / ops) -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
          <label class="text-label">
            Total bytes sent
          </label>
          <p class="mt-1 text-lg font-semibold">
            {{ formatBytes(stats.totalBytesSent) }}
          </p>
        </div>

        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
          <p class="text-label">
            Total bytes received
          </p>
          <p class="mt-1 text-lg font-semibold">
            {{ formatBytes(stats.totalBytesReceived) }}
          </p>
        </div>

        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
          <label class="text-label">
            Total operations
          </label>
          <p class="mt-1 text-lg font-semibold">
            {{ stats.totalOps.toLocaleString() }}
          </p>
        </div>

        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
          <label class="text-label">
            Successful operations
          </label>
          <p class="mt-1 text-lg font-semibold">
            {{ stats.totalSuccessfulOps.toLocaleString() }}
          </p>
          <p class="text-xs text-default mt-0.5">
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
          <label class="text-label">
            Bucket data
          </label>
          <div class="mt-1 text-xs flex">
            <div class="w-[30%]"> Objects:</div>
            <span class="font-semibold">
              {{ bucket.objectCount != null ? bucket.objectCount.toLocaleString() : "Unknown" }}
            </span>
          </div>
          <div class="text-xs flex">
            <div class="w-[30%]"> Total size:</div>
            <span class="font-semibold">
              {{ formatBytes(bucket.sizeBytes ?? 0) }}
            </span>
          </div>
          <!-- <p class="text-xs mt-1">
        Shards:
        <span class="font-semibold">
          {{ bucket.numShards != null ? bucket.numShards : "Unknown" }}
        </span>
      </p> -->
        </div>

        <!-- Versioning / object lock -->
        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
          <label class="text-label">
            Versioning / Object lock
          </label>
          <div class="mt-1 text-xs flex">
            <div class="w-[30%] "> Versioning:</div>
            <span class="font-semibold">
              {{ bucket.versioning || "Disabled" }}
            </span>
          </div>
          <div class="text-xs flex">
            <div class="w-[30%] "> Object lock:</div>
            <span class="font-semibold">
              {{ bucket.objectLockEnabled ? "Enabled" : "Disabled" }}
            </span>
          </div>
        </div>

        <!-- Zonegroup / placement / quota -->
        <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-slate-200">
          <label class="text-label">
            Layout & quota
          </label>
          <div class="mt-1 text-xs flex">
            <div class="w-[30%]"> Zonegroup:</div>
            <span class="font-semibold">
              {{ bucket.zonegroup || "Unknown" }}
            </span>
          </div>
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
          <label class="text-label"> Per-user usage</label>
        </div>
        <div v-if="perUser.length === 0" class="px-4 py-4 text-sm text-muted">
          No usage records for this bucket in the selected range.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full divide-y divide-default houston-table">
            <thead>
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-default">
                  Owner / UID
                </th>
                <th class="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-default">
                  Bytes sent
                </th>
                <th class="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-default">
                  Bytes received
                </th>
                <th class="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-default">
                  Ops
                </th>
                <th class="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-default">
                  Successful ops
                </th>
              </tr>
            </thead>
            <tbody class="bg-default w-full">
              <tr v-for="row in perUser" :key="row.bucket + ':' + row.owner" class="hover:bg-accent">
                <td class="px-4 py-2 text-xs text-default">
                  {{ row.owner || "Unknown" }}
                </td>
                <td class="px-4 py-2 text-right text-xs text-default">
                  {{ formatBytes(row.bytesSent) }}
                </td>
                <td class="px-4 py-2 text-right text-xs text-default">
                  {{ formatBytes(row.bytesReceived) }}
                </td>
                <td class="px-4 py-2 text-right text-xs text-default">
                  {{ row.ops.toLocaleString() }}
                </td>
                <td class="px-4 py-2 text-right text-xs text-default">
                  {{ row.successfulOps.toLocaleString() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>


    <div v-else class="mx-4 rounded-lg border border-default bg-default px-4 py-3 text-sm text-muted">
      No data loaded yet. Adjust filters and click Refresh.
    </div>
    <!-- Bucket configuration -->
    <div v-if="bucket" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 m-4">
      <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
        <label class="text-label">
          Owner / Region
        </label>
        <div class="mt-1 text-xs flex">
          <div class="w-[30%]">Owner:</div>
          <div class="font-semibold">
            {{ bucket.owner || "Unknown" }}
          </div>
        </div>
        <div class="mt-1 text-xs flex">
          <div class="w-[30%]"> Region / Zone:</div>
          <div class="font-semibold">
            {{ bucket.region || bucket.zone || bucket.zonegroup || "Unknown" }}
          </div>
        </div>
        <div class="mt-1 text-xs flex">
          <span class="w-[30%]"> Created:</span>
          <div class="font-semibold">

            {{ bucket.createdAt ? new Date(bucket.createdAt).toLocaleString() : "Unknown" }}
          </div>
        </div>
        <div class="mt-1 text-xs flex">
          <div class="w-[30%]"> Last modified: </div>
          <div class="font-semibold">

            {{ bucket.lastModifiedTime ? new Date(bucket.lastModifiedTime).toLocaleString() : "Unknown" }}
          </div>
        </div>
      </div>


      <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default">
        <label class="text-label">
          Tags
        </label>
        <div v-if="bucket.tags && Object.keys(bucket.tags).length" class="mt-1 flex flex-wrap gap-1.5">
          <span v-for="(value, key) in bucket.tags" :key="key"
            class="inline-flex items-center rounded-full border border-default bg-default px-2 py-0.5  text-default">
            {{ key }}={{ value }}
          </span>
        </div>
        <p v-else class="mt-1 text-xs text-muted">
          No tags set on this bucket.
        </p>
      </div>
    </div>
    <!-- Security / access -->
    <div class="rounded-lg border border-default bg-default px-4 py-3 text-sm text-default space-y-2 mb-[5rem]">
      <div class="flex items-center justify-between">
        <label class="text-label">
          Security & access
        </label>
        <span v-if="securityLoading" class="text-xs text-default">
          Loading security…
        </span>
      </div>

      <p v-if="securityError" class="text-xs text-red-300">
        {{ securityError }}
      </p>

      <div v-else>
        <p>
          Public access:
          <span class="font-semibold">
            <template v-if="isPublic">Yes (AllUsers has READ or more)</template>
            <template v-else-if="isAuthenticatedRead">Authenticated users can read</template>
            <template v-else>No (private)</template>
          </span>
        </p>

        <details class="mt-1 text-xs text-default">
          <summary class="cursor-pointer font-medium uppercase tracking-wide text-default hover:bg-accent">
            View ACL rules
          </summary>
          <div v-if="bucketAcl && bucketAcl.length" class="mt-1 space-y-1 p-2 bg-accent">
            <div v-for="(rule, idx) in bucketAcl" :key="idx" class="flex">
              <div class="w-[10%]">{{ rule.grantee }}: </div>
              <span class="font-semibold">{{ rule.permission }}</span>
            </div>
          </div>
          <p v-else class="mt-1 text-default bg-accent">
            No ACL rules loaded.
          </p>
        </details>

        <details class="mt-2 text-xs text-default">
          <summary class="cursor-pointer  font-medium uppercase tracking-wide text-default hover:bg-accent">
            Bucket policy JSON
          </summary>
          <pre v-if="bucketPolicy" class="mt-1 p-2 overflow-auto whitespace-pre-wrap break-all  text-default bg-accent">
    {{ bucketPolicy }}
  </pre>
          <p v-else class="mt-1  text-muted bg-accent">
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
import type { BucketDashboardStats, BucketUserUsage, BucketDashboardOptions, CephAclRule, CephBucket } from "../../types/types";
import { getBucketDashboardStats, isRgwUsageLogEnabled } from "../../api/cephCliAdapter";
import { hydrateCephBucket } from "../../bucketBackends/cephBucketBackend";
import { formatBytes } from "../../bucketBackends/bucketUtils";

const props = defineProps<{
  bucketName: string;
  // optional default uid filter
  defaultUid?: string | null;
  bucket: CephBucket;

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
const usageWarning = ref<string | null>(null);

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
  usageWarning.value = null;

  try {
    await loadSecurity();

    const enabled = await isRgwUsageLogEnabled();
    if (enabled === false) {
      usageWarning.value =
        "Usage logging is currently disabled. The dashboard may show no data or only historical data from when logging was enabled.";
    }

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
    error.value = e?.message ?? "Failed to load bucket dashboard";
    stats.value = null;
    perUser.value = [];
  } finally {
    loading.value = false;
  }
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
    const { acl, policy } = await hydrateCephBucket(props.bucket);
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
  setLastDays(7);
  load();
  loadSecurity();

});


</script>