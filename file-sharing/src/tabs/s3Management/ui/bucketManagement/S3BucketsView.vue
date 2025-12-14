<!-- S3BucketManagement.vue -->
<template>
  <div class="space-y-4 sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
    <!-- Header -->
    <div
      class="grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-well rounded-md shadow text-default my-2 ring-1 ring-black ring-opacity-5 p-4 m-4"
    >
      <!-- Left: back button -->
      <div>
        <button
          v-if="showBackButton"
          type="button"
          class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
          @click="emit('backToViewSelection')"
        >
          <ArrowUturnLeftIcon class="size-icon" />
          Back
        </button>
      </div>

      <!-- Center: title -->
      <div class="flex items-baseline justify-center gap-2">
        <h2 class="text-xl font-semibold text-slate-100">
          S3 Bucket Management
        </h2>
        <span class="text-sm text-slate-400">
          ({{ backendLabel }})
        </span>
      </div>

      <!-- Right: new bucket -->
      <button
        type="button"
        @click="openCreateModal"
        class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
      >
        <ArchiveBoxIcon class="size-icon" />
        New bucket
      </button>
    </div>

    <!-- Filters / sort controls -->
    <div
    v-if="!showUsageDashboard"

      class="flex flex-col gap-3 rounded-lg border-default bg-plugin-header p-4 text-sm text-slate-200 m-4"
    >
      <div class="flex flex-wrap gap-4">
        <label class="flex min-w-[180px] flex-1 flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-wide text-slate-400">
            Name
          </span>
          <input
            v-model="nameFilter"
            type="text"
            placeholder="Filter by name"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-1"
          />
        </label>

        <label class="flex min-w-[180px] flex-1 flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-wide text-slate-400">
            Region / Zone
          </span>
          <select
            v-model="regionFilter"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
          >
            <option value="all">All regions</option>
            <option v-for="r in regions" :key="r || 'none'" :value="r || 'none'">
              {{ r || "Unknown" }}
            </option>
          </select>
        </label>
      </div>

      <div class="flex flex-wrap gap-4">
        <label class="flex min-w-[180px] flex-1 flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-wide text-slate-400">
            Sort by
          </span>
          <select
            v-model="sortKey"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
          >
            <option value="name">Name</option>
            <option value="region">Region / Zone</option>
            <option value="objects">Objects</option>
            <option value="size">Size</option>
          </select>
        </label>

        <label class="flex min-w-[160px] flex-1 flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-wide text-slate-400">
            Direction
          </span>
          <select
            v-model="sortDir"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>
    </div>

    <!-- Loading / error -->
    <div
      v-if="loadingBuckets"
      class="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300"
    >
      Loading buckets…
    </div>

    <div
      v-else-if="error"
      class="rounded-lg border border-red-900/60 bg-red-950/60 px-4 py-3 text-sm text-red-200"
    >
      {{ error }}
    </div>

    <!-- Buckets / Usage dashboard -->
    <div v-else>
      <!-- When Usage dashboard is open, show that instead of the grid -->
      <div v-if="showUsageDashboard && usageBucketName && usageBucket">
  <CephBucketDashboardView
    v-if="backend === 'ceph'"
    :bucket-name="usageBucketName"
    :bucket="usageBucket!"
    :ceph-gateway="cephGateway || null"
    :show-back-button="true"
    @back="closeUsageDashboard"
  />

  <MinioBucketDashboardView
    v-else-if="backend === 'minio'"
    :bucket-name="usageBucketName"
    :bucket="usageBucket!"
    :show-back-button="true"
    @back="closeUsageDashboard"
  />
  <GarageBucketDashboardView
    v-else-if="backend === 'garage'"
    :bucket-name="usageBucketName"
    :bucket="usageBucket!"
    :show-back-button="true"
    @back="closeUsageDashboard"
  />
</div>

      <!-- Otherwise show buckets grid -->
      <template v-else>
        <div
          v-if="filteredSortedBuckets.length"
          class="grid gap-4 md:grid-cols-2 xl:grid-cols-3 bg-accent m-4"
        >
          <article
            v-for="bucket in filteredSortedBuckets"
            :key="bucket.name"
            class="flex flex-col gap-3 rounded-lg border border-default bg-default p-4 shadow transition hover:shadow-md"
          >
            <!-- Header with bucket logo -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-2">
                <div class="flex h-7 w-7 items-center justify-center">
                  <ArchiveBoxIcon class="size-icon" />
                </div>

                <div>
                  <h3 class="text-base font-semibold text-slate-100">
                    {{ bucket.name }}
                  </h3>
                  <p class="text-xs text-slate-400">
                    {{ bucket.region || "Unknown region" }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Meta -->
            <div>
              <label class="mb-1 block text-xs font-medium text-slate-300">
                Owner
              </label>
              <input
                v-model="bucket.owner"
                type="text"
                placeholder="optional / best-effort"
                disabled
                class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
              />
            </div>

            <!-- Stats -->
            <div class="mt-1 grid grid-cols-2 gap-3 text-xs text-slate-300">
              <div>
                <p class="text-[11px] uppercase tracking-wide text-slate-500">
                  Objects
                </p>
                <p class="text-sm font-semibold">
                  {{ bucket.objectCount ?? "—" }}
                </p>
              </div>

              <div>
                <p class="text-[11px] uppercase tracking-wide text-slate-500">
                  Size (bytes)
                </p>
                <p class="text-sm font-semibold">
                  {{ bucket.sizeBytes ?? "—" }}
                </p>
              </div>

              <div v-if="backend === 'ceph'">
                <p class="text-[11px] uppercase tracking-wide text-slate-500">
                  Created
                </p>
                <p class="text-xs">
                  {{ formatDate(bucket.createdAt) }}
                </p>
              </div>

              <div v-if="backend === 'ceph'">
                <p class="text-[11px] uppercase tracking-wide text-slate-500">
                  Last modified
                </p>
                <p class="text-xs">
                  {{ formatDate(bucket.lastModifiedTime) }}
                </p>
              </div>
            </div>

            <!-- Tags -->
            <div
              v-if="bucket.tags && Object.keys(bucket.tags).length"
              class="mt-1 space-y-1 text-xs"
            >
              <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Tags
              </p>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="(value, key) in bucket.tags"
                  :key="key"
                  class="inline-flex items-center rounded-full border border-default bg-default px-2 py-0.5 text-[11px] text-slate-200"
                >
                  {{ key }}={{ value }}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="mt-3 flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                @click="openEditModal(bucket)"
                class="rounded-md border border-default bg-default px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800"
              >
                Edit
              </button>

              <button
  v-if="backend === 'ceph' || backend === 'minio' || backend === 'garage'"
  type="button"
  class="rounded-md border border-default bg-default px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800"
  @click="openUsageDashboard(bucket)"
>
  Usage
</button>
              <button
                type="button"
                @click="confirmDelete(bucket)"
                class="rounded-md bg-red-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </article>
        </div>

        <p
          v-else
          class="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-6 text-center text-sm text-slate-400"
        >
          No buckets found.
        </p>
      </template>
    </div>

    <!-- Create/Edit modal -->
    <BucketFormModal
      :visible="showModal"
      :mode="modalMode"
      :backend="backend"
      :cephGateway="cephGateway || null"
      :cephUsers="cephUsers"
      :loadingCephUsers="loadingCephUsers"
      :cephUsersError="cephUsersError"
      :bucketToEdit="editingBucket"
      :garageKeys="garageKeys"
  :loadingGarageKeys="loadingGarageKeys"
  :garageKeysError="garageKeysError"
      @close="closeModal"
      @submit="handleFormSubmit"
    />

    <!-- Delete confirm modal -->
    <BucketDeleteModal
      :bucket="bucketToDelete"
      @cancel="bucketToDelete = null"
      @confirm="performDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { listRgwUsers } from "../../api/s3CliAdapter";
import type { RgwGateway, RgwUser,CephBucket,MinioBucket,GarageBucket } from "../../types/types";
import { ArchiveBoxIcon, ArrowUturnLeftIcon } from "@heroicons/vue/20/solid";
import BucketFormModal from "./BucketFormModal.vue";
import BucketDeleteModal from "./BucketDeleteModal.vue";
import CephBucketDashboardView from "./CephBucketDashboardView.vue";
import { useBucketBackend, type BackendKind } from "../../composables/useBucketBackend";
import { hydrateCephBucketForEdit } from "../../bucketBackends/cephBucketBackend";
import MinioBucketDashboardView from "./MinioBucketDashboard.vue";
import GarageBucketDashboardView from "./GarageBucketDashboard.vue";
import { listGarageKeysWithInfo } from "../../api/garageCliAdapter";
import type { GarageKeyDetail } from "../../types/types";
import type { BackendContext } from "../../bucketBackends/bucketBackend";


const props = defineProps<{
  backend: "minio" | "ceph" | "garage";
  cephGateway?: RgwGateway | null;
  showBackButton?: boolean;
}>();

const emit = defineEmits<{
  (e: "backToViewSelection"): void;
}>();

const backendKind = computed<BackendKind>(() => props.backend);
  const backendCtx = computed<BackendContext>(() => ({
  cephGateway: props.cephGateway ?? null,
}));
type BucketType = CephBucket | MinioBucket | GarageBucket;

const { buckets, loading: loadingBuckets, error, loadBuckets, createBucketFromForm, updateBucketFromForm, deleteBucket,
} = useBucketBackend(backendKind, backendCtx);
const showUsageDashboard = ref(false);
const usageBucketName = ref<string | null>(null);
const usageBucket = ref<BucketType | null>(null);


const cephUsers = ref<RgwUser[]>([]);
const loadingCephUsers = ref(false);
const cephUsersError = ref<string | null>(null);

// filters/sort
const nameFilter = ref("");
const regionFilter = ref<string>("all");
const tagFilter = ref("");
const sortKey = ref<"name" | "region" | "objects" | "size">("name");
const sortDir = ref<"asc" | "desc">("asc");

// modal state
const showModal = ref(false);
const modalMode = ref<"create" | "edit">("create");
const editingBucket = ref<BucketType | null>(null);

// delete state
const bucketToDelete = ref<BucketType | null>(null);


const garageKeys = ref<GarageKeyDetail[]>([]);
const loadingGarageKeys = ref(false);
const garageKeysError = ref<string | null>(null);
const backendLabel = computed(() => {
  if (props.backend === "minio") return "MinIO";
  if (props.backend === "ceph") return "Ceph RGW";
  return "Garage";
});

const regions = computed(() => {
  const set = new Set<string | undefined>();
  for (const b of buckets.value) {
    set.add(b.region);
  }
  return Array.from(set);
});

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function openUsageDashboard(bucket: BucketType) {
  usageBucketName.value = bucket.name;
  usageBucket.value = bucket;

  showUsageDashboard.value = true;
}

function closeUsageDashboard() {
  showUsageDashboard.value = false;
  usageBucketName.value = null;
}

// filter + sort
const filteredSortedBuckets = computed(() => {
  let result = [...buckets.value];

  if (nameFilter.value.trim()) {
    const needle = nameFilter.value.trim().toLowerCase();
    result = result.filter((b) => b.name.toLowerCase().includes(needle));
  }

  if (regionFilter.value !== "all") {
    result = result.filter((b) => {
      const r = b.region || "none";
      return r === regionFilter.value;
    });
  }

  if (tagFilter.value.trim()) {
    const needle = tagFilter.value.trim().toLowerCase();
    result = result.filter((b) => {
      if (!b.tags) return false;
      return Object.entries(b.tags).some(
        ([k, v]) =>
          k.toLowerCase().includes(needle) ||
          String(v).toLowerCase().includes(needle),
      );
    });
  }

  result.sort((a, b) => {
    let av: string | number = 0;
    let bv: string | number = 0;

    if (sortKey.value === "name") {
      av = a.name;
      bv = b.name;
    } else if (sortKey.value === "region") {
      av = a.region || "";
      bv = b.region || "";
    } else if (sortKey.value === "objects") {
      av = a.objectCount ?? 0;
      bv = b.objectCount ?? 0;
    } else if (sortKey.value === "size") {
      av = a.sizeBytes ?? 0;
      bv = b.sizeBytes ?? 0;
    }

    let cmp: number;
    if (typeof av === "string" && typeof bv === "string") {
      cmp = av.localeCompare(bv);
    } else {
      cmp = (av as number) - (bv as number);
    }

    return sortDir.value === "asc" ? cmp : -cmp;
  });

  return result;
});

// modal open/close
async function openCreateModal() {
  modalMode.value = "create";
  editingBucket.value = null;

  if (props.backend === "ceph") {
    await loadCephUsersIfNeeded();
  }
  if (props.backend === "garage") {
  await loadGarageKeysIfNeeded();
}


  showModal.value = true;
}

async function openEditModal(bucket: BucketType) {
  modalMode.value = "edit";

  let enriched = bucket;

  if (backendKind.value === "ceph") {
    // fetch ACL + policy
    enriched = await hydrateCephBucketForEdit(bucket, {
      cephGateway: props.cephGateway ?? null,
    });

    await loadCephUsersIfNeeded();
  }
  if (props.backend === "garage") {
  await loadGarageKeysIfNeeded();
}

  editingBucket.value = enriched;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingBucket.value = null;
}

async function handleFormSubmit(payload: { mode: "create" | "edit"; form: any }) {
  try {
    if (payload.mode === "create") {
      await createBucketFromForm(payload.form);
      await loadBuckets();
    } else if (payload.mode === "edit" && editingBucket.value) {
      await updateBucketFromForm(editingBucket.value, payload.form);
    }

    closeModal();
  } catch (e: any) {
    error.value = e?.message ?? "Failed to save bucket";
  }
}
async function loadGarageKeysIfNeeded() {
  if (props.backend !== "garage") return;
  loadingGarageKeys.value = true;
  garageKeysError.value = null;
  try {
    garageKeys.value = await listGarageKeysWithInfo();
  } catch (e: any) {
    garageKeysError.value = e?.message ?? "Failed to list Garage keys";
    garageKeys.value = [];
  } finally {
    loadingGarageKeys.value = false;
  }
}
// delete flow
function confirmDelete(bucket: BucketType) {
  bucketToDelete.value = bucket;
}

async function performDelete() {
  if (!bucketToDelete.value) return;

  try {
    const toDelete = bucketToDelete.value;

    await deleteBucket(toDelete as any); // see note below
    buckets.value = buckets.value.filter((b) => b.name !== toDelete.name);

    bucketToDelete.value = null;
  } catch (e: any) {
    error.value = e?.message ?? "Failed to delete bucket";
  }
}

// Ceph users for owner dropdown
async function loadCephUsersIfNeeded() {
  if (props.backend !== "ceph") return;

  loadingCephUsers.value = true;
  cephUsersError.value = null;

  try {
    cephUsers.value = await listRgwUsers();
  } catch (e: any) {
    cephUsersError.value = e?.message ?? "Failed to list Ceph users";
    cephUsers.value = [];
  } finally {
    loadingCephUsers.value = false;
  }
}

watch(
  () => props.backend,
  async (backend) => {
    nameFilter.value = "";
    regionFilter.value = "all";
    tagFilter.value = "";
    sortKey.value = "name";
    sortDir.value = "asc";

    await loadBuckets();

    if (backend === "ceph") {
      await loadCephUsersIfNeeded();
    }

    if (backend === "garage") {
      await loadGarageKeysIfNeeded();
    }
  },
  { immediate: true },
);
</script>
