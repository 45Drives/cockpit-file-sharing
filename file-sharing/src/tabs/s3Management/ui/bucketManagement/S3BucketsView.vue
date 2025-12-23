<!-- S3BUCKETSVIEW.vue -->
<template>
  <div class="space-y-4 sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
    <!-- Header -->
    <div
      class="grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-well rounded-md shadow text-default my-2 ring-1 ring-black ring-opacity-5 p-4 m-4">
      <!-- Left: back button -->
      <div>
        <button v-if="showBackButton" type="button"
          class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
          @click="emit('backToViewSelection')">
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
      <button type="button" @click="openCreateModal" :disabled="openingModal"
        class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-60">
        <LoadingSpinner v-if="openingModal" />
        <ArchiveBoxIcon v-else class="size-icon" />
        New bucket
      </button>
    </div>

    <!-- Filters / sort controls -->
    <div v-if="!showUsageDashboard"
      class="flex flex-col gap-3 rounded-lg border-default bg-plugin-header p-4 text-sm text-default m-4">
      <div class="flex flex-wrap gap-4">
        <label class="flex min-w-[180px] flex-1 flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-wide text-label">
            Name
          </span>
          <input v-model="nameFilter" type="text" placeholder="Filter by name"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-1" />
        </label>

        <label v-if="backend != 'ceph'" class="flex min-w-[180px] flex-1 flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-wide text-label">
            Region / Zone
          </span>
          <select v-model="regionFilter"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1">
            <option value="all">All regions</option>
            <option v-for="r in regions" :key="r || 'none'" :value="r || 'none'">
              {{ r || "Unknown" }}
            </option>
          </select>
        </label>
      </div>

      <div class="flex flex-wrap gap-4">
        <label class="flex min-w-[180px] flex-1 flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-wide text-label">
            Sort by
          </span>
          <select v-model="sortKey"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-label outline-none focus:ring-1">
            <option value="name">Name</option>
            <option v-if="backend != 'ceph'" value="region">Region / Zone</option>
            <option value="objects">Objects</option>
            <option value="size">Size</option>
          </select>
        </label>

        <label class="flex min-w-[160px] flex-1 flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-wide text-label">
            Direction
          </span>
          <select v-model="sortDir"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>
    </div>

    <!-- Loading / error -->
    <div v-if="loadingBuckets"
      class="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
      Loading buckets…
    </div>

    <div v-else-if="error" class="rounded-lg border border-red-900/60 bg-red-950/60 px-4 py-3 text-sm text-red-200">
      {{ error }}
    </div>

    <!-- Buckets / Usage dashboard -->
    <div v-else>
      <!-- When Usage dashboard is open, show that instead of the grid -->
      <div v-if="showUsageDashboard && usageBucketName && usageBucket">
        <CephBucketDashboardView v-if="backend === 'ceph' && cephUsageBucket" :bucket-name="usageBucketName"
          :bucket="cephUsageBucket!" :ceph-gateway="cephGateway || null" :show-back-button="true"
          @back="closeUsageDashboard" />

        <MinioBucketDashboardView v-else-if="backend === 'minio'" :bucket-name="usageBucketName"
          :bucket="minioUsageBucket!" :show-back-button="true" @back="closeUsageDashboard" />
        <GarageBucketDashboardView v-else-if="backend === 'garage'"
          :bucket-name="garageUsageBucket?.garageId || usageBucketName" :bucket="garageUsageBucket!"
          :show-back-button="true" @back="closeUsageDashboard" />
      </div>

      <!-- Otherwise show buckets grid -->
      <template v-else>
        <div
          class="mx-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-plugin-header p-3 text-sm">
          <div class="text-slate-300">
            Showing
            <span class="font-semibold">{{ totalItems ? pageStart + 1 : 0 }}</span>
            –
            <span class="font-semibold">{{ Math.min(totalItems, pageEnd) }}</span>
            of
            <span class="font-semibold">{{ totalItems }}</span>
            buckets
          </div>

          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 text-slate-300">
              <span>Per page</span>

              <input v-model="pageSizeInput" type="number" min="1" step="1"
                class="w-28 rounded-md border border-default bg-default px-2 py-1 text-sm text-slate-100 outline-none focus:ring-1"
                @keydown.enter.prevent="commitPageSize()" @blur="commitPageSize()" placeholder="30" />
            </label>

            <div class="flex items-center gap-2">
              <button type="button"
                class="rounded-md border border-default bg-secondary px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                :disabled="page <= 1" @click="page = Math.max(1, page - 1)">
                Prev
              </button>

              <span class="text-slate-300">
                Page <span class="font-semibold">{{ page }}</span> /
                <span class="font-semibold">{{ totalPages }}</span>
              </span>

              <button type="button"
                class="rounded-md border border-default bg-secondary px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                :disabled="page >= totalPages" @click="page = Math.min(totalPages, page + 1)">
                Next
              </button>
            </div>
          </div>
        </div>

        <div v-if="pagedBuckets.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3 bg-accent m-4">
          <article v-for="bucket in pagedBuckets" :key="bucket.name"
            class="flex flex-col gap-3 rounded-lg border border-default bg-default p-4 shadow transition hover:shadow-md">
            <!-- Header with bucket logo -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-2">
                <div class="flex h-7 w-7 items-center justify-center">
                  <ArchiveBoxIcon class="size-icon" />
                </div>

                <div>
                  <h3 class="text-base font-semibold text-slate-100">

                    <span v-if="bucket.backendKind === 'ceph'">{{ bucket.adminRef }}</span>
                    <span v-else>{{ bucket.name }}</span>
                  </h3>
                  <p v-if="backend != 'ceph'" class="text-xs text-slate-400">
                    {{ bucket.region || "Unknown region" }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Meta -->
            <div v-if="backend != 'minio' || 'garage'">
              <label class="mb-1 block text-xs font-medium text-slate-300">
                Owner
              </label>
              <input v-model="bucket.owner" type="text" placeholder="optional / best-effort" disabled
                class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1" />
            </div>

            <!-- Stats -->
            <div class="mt-1 grid grid-cols-2 gap-3 text-xs text-default">
              <div>
                <p class=" uppercase tracking-wide text-default">
                  Objects
                </p>
                <p class="text-sm font-semibold">
                  <LoadingSpinner v-if="bucket.objectCount === undefined" />
                  {{ bucket.objectCount }}
                </p>
              </div>

              <div>
                <p class=" uppercase tracking-wide text-default">
                  Size (bytes)
                </p>
                <p class="text-sm font-semibold">
                  <LoadingSpinner v-if="bucket.sizeBytes === undefined" />
                  {{ bucket.sizeBytes }}
                </p>
              </div>

              <div v-if="backend === 'ceph'">
                <p class=" uppercase tracking-wide text-default">
                  Created
                </p>
                <p class="text-xs">
                  <LoadingSpinner v-if="bucket.createdAt === undefined" />
                  {{ formatDate(bucket.createdAt) }}
                </p>
              </div>

              <div v-if="backend === 'ceph'">
                <p class=" uppercase tracking-wide text-default">
                  Last modified
                </p>
                <LoadingSpinner v-if="bucket.lastModifiedTime === undefined" />

                <p class="text-xs">
                  {{ formatDate(bucket.lastModifiedTime) }}
                </p>
              </div>
            </div>

            <!-- Tags -->
            <div v-if="bucket.tags && Object.keys(bucket.tags).length" class="mt-1 space-y-1 text-xs">
              <p class="text-sm font-medium uppercase tracking-wide text-slate-500">
                Tags
              </p>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="(value, key) in bucket.tags" :key="key"
                  class="inline-flex items-center rounded-full border border-default bg-default px-2 py-0.5 text-default">
                  {{ key }}={{ value }}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="mt-3 flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button type="button" @click="openEditModal(bucket)" :disabled="openingModal"
                class="rounded-md border border-default bg-primary px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-60">
                <LoadingSpinner v-if="openingModal" />
                <span v-else>Edit</span>
              </button>

              <button v-if="backend === 'ceph' || backend === 'minio' || backend === 'garage'" type="button"
                class="rounded-md border border-default bg-secondary px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800"
                @click="openUsageDashboard(bucket)">
                Usage
              </button>
              <button type="button" @click="confirmDelete(bucket)"
                class="rounded-md bg-red-600/90 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500">
                Delete
              </button>
            </div>
          </article>
        </div>

        <p v-else
          class="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-6 text-center text-sm text-slate-400">
          No buckets found.
        </p>
      </template>
    </div>

    <!-- Create/Edit modal -->
    <BucketFormModal v-if="backend === 'ceph'" :visible="showModal" :mode="modalMode" backend="ceph"
      :cephGateway="cephGateway || null" :bucketToEdit="cephEditingBucket" :deps="cephModalDeps" @close="closeModal"
      @submit="handleFormSubmit" />

    <BucketFormModal v-else-if="backend === 'minio'" :visible="showModal" :mode="modalMode" backend="minio"
      :bucketToEdit="minioEditingBucket" :deps="minioModalDeps" @close="closeModal" @submit="handleFormSubmit" />

    <BucketFormModal v-else :visible="showModal" :mode="modalMode" backend="garage" :bucketToEdit="garageEditingBucket"
      :deps="garageModalDeps" @close="closeModal" @submit="handleFormSubmit" />



    <!-- Delete confirm modal -->
    <BucketDeleteModal :bucket="bucketToDelete" @cancel="bucketToDelete = null" @confirm="performDelete" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { RgwGateway, CephBucket, MinioBucket, GarageBucket, CephDeps, MinioDeps, GarageDeps, BackendKind } from "../../types/types";
import { ArchiveBoxIcon, ArrowUturnLeftIcon } from "@heroicons/vue/20/solid";
import BucketFormModal from "./BucketFormModal.vue";
import BucketDeleteModal from "./BucketDeleteModal.vue";
import CephBucketDashboardView from "./CephBucketDashboardView.vue";
import { useBucketBackend } from "../../composables/useBucketBackend";
import MinioBucketDashboardView from "./MinioBucketDashboard.vue";
import GarageBucketDashboardView from "./GarageBucketDashboard.vue";
import type { BackendContext } from "../../bucketBackends/bucketBackend";
import { LoadingSpinner } from "@45drives/houston-common-ui";
import type { ModalDeps } from "../../types/types";
import { pushNotification, Notification } from "@45drives/houston-common-ui";

const props = defineProps<{
  backend: "minio" | "ceph" | "garage";
  cephGateway?: RgwGateway | null;
  showBackButton?: boolean;
  minioAlias?: string | null;
}>();

const emit = defineEmits<{
  (e: "backToViewSelection"): void;
}>();


const backendKind = computed<BackendKind>(() => props.backend);
const backendCtx = computed<BackendContext>(() => ({
  cephGateway: props.cephGateway ?? null,
}));
type BucketType = (typeof buckets.value)[number];

const { buckets, loading: loadingBuckets, error, loadBuckets, createBucketFromForm, updateBucketFromForm, deleteBucket, prepareCreate, prepareEdit
} = useBucketBackend(backendKind, backendCtx);
const showUsageDashboard = ref(false);
const usageBucketName = ref<string | null>(null);
const usageBucket = ref<BucketType | null>(null);
const openingModal = ref(false);
const modalDeps = ref<ModalDeps | null>(null);
const cephEditingBucket = computed<CephBucket | null>(() => {
  const b = editingBucket.value;
  return b && b.backendKind === "ceph" ? (b as CephBucket) : null;
});

const minioEditingBucket = computed<MinioBucket | null>(() => {
  const b = editingBucket.value;
  return b && b.backendKind === "minio" ? (b as MinioBucket) : null;
});

const garageEditingBucket = computed<GarageBucket | null>(() => {
  const b = editingBucket.value;
  return b && b.backendKind === "garage" ? (b as GarageBucket) : null;
});

const cephModalDeps = computed<CephDeps | null>(() => {
  if (props.backend !== "ceph") return null;
  return (modalDeps.value as CephDeps | null) ?? null;
});
const minioModalDeps = computed<MinioDeps | null>(() => {
  if (props.backend !== "minio") return null;
  return (modalDeps.value as MinioDeps | null) ?? null;
});
const garageModalDeps = computed<GarageDeps | null>(() => {
  if (props.backend !== "garage") return null;
  return (modalDeps.value as GarageDeps | null) ?? null;
});

const pageSize = ref<number>(30);
const page = ref<number>(1);
const pageSizeInput = ref<string>(String(pageSize.value));

// filters/sort
const nameFilter = ref("");
const regionFilter = ref<string>("all");
const sortKey = ref<"name" | "region" | "objects" | "size">("name");
const sortDir = ref<"asc" | "desc">("asc");

// modal state
const showModal = ref(false);
const modalMode = ref<"create" | "edit">("create");
const editingBucket = ref<BucketType | null>(null);

// delete state
const bucketToDelete = ref<BucketType | null>(null);


const backendLabel = computed(() => {
  if (props.backend === "minio") return "MinIO";
  if (props.backend === "ceph") return "Ceph RGW";
  return "Garage";
});
const totalItems = computed(() => filteredSortedBuckets.value.length);

const totalPages = computed(() => {
  const ps = Math.max(1, pageSize.value);
  return Math.max(1, Math.ceil(totalItems.value / ps));
});

const clampedPage = computed(() => {
  if (page.value < 1) return 1;
  if (page.value > totalPages.value) return totalPages.value;
  return page.value;
});

const pageStart = computed(() => (clampedPage.value - 1) * pageSize.value);
const pageEnd = computed(() => pageStart.value + pageSize.value);

const pagedBuckets = computed(() => {
  return filteredSortedBuckets.value.slice(pageStart.value, pageEnd.value);
});


const regions = computed(() => {
  const set = new Set<string | undefined>();
  for (const b of buckets.value) {
    set.add(b.region);
  }
  return Array.from(set);
});

function formatDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function openUsageDashboard(bucket: BucketType) {
  if (bucket.backendKind == "ceph") {
    usageBucketName.value = bucket.adminRef
  } else {
    usageBucketName.value = bucket.name;

  }
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
    result = result.filter((b: any) => {
      const label = props.backend === "ceph" ? (b.adminRef ?? b.name) : b.name;
      return String(label ?? "").toLowerCase().includes(needle);
    });
  }


  if (regionFilter.value !== "all") {
    result = result.filter((b) => {
      const r = b.region || "none";
      return r === regionFilter.value;
    });
  }


  result.sort((a, b) => {
    let av: string | number = 0;
    let bv: string | number = 0;

    if (sortKey.value === "name") {
      av = props.backend === "ceph" ? ((a as any).adminRef ?? a.name) : a.name;
      bv = props.backend === "ceph" ? ((b as any).adminRef ?? b.name) : b.name;
    } else if (sortKey.value === "region") {
      av = a.region || "";
      bv = b.region || "";
    } else if (sortKey.value === "objects") {
      av = a.objectCount ?? -1;
      bv = b.objectCount ?? -1;
    } else if (sortKey.value === "size") {
      av = a.sizeBytes ?? -1;
      bv = b.sizeBytes ?? -1;
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

const cephUsageBucket = computed<CephBucket | null>(() => {
  const b = usageBucket.value;
  return b && b.backendKind === "ceph" ? (b as CephBucket) : null;
});


const minioUsageBucket = computed<MinioBucket | null>(() => {
  const b = usageBucket.value;
  return b && b.backendKind === "minio" ? (b as MinioBucket) : null;
});

const garageUsageBucket = computed<GarageBucket | null>(() => {
  const b = usageBucket.value;
  return b && b.backendKind === "garage" ? (b as GarageBucket) : null;
});



function closeModal() {
  showModal.value = false;
  editingBucket.value = null;
}

async function handleFormSubmit(payload: { mode: "create" | "edit"; form: any }) {
  try {
    if (payload.mode === "create") {

      await createBucketFromForm(payload.form);
      pushNotification(new Notification("Success", `Bucket "${payload.form?.name}" created sucessfully.`, "success", 2000))

      await loadBuckets();
    } else if (payload.mode === "edit" && editingBucket.value) {
      await updateBucketFromForm(editingBucket.value, payload.form);
      pushNotification(new Notification("Success", `Bucket "${payload.form?.name}" saved sucessfully`, "success", 2000))

      await loadBuckets();

    }

    closeModal();
  } catch (e: any) {
    pushNotification(new Notification(`Failed to save bucket "${bucketToDelete.value?.name}"`, e?.message, "error"));

    // error.value = e?.message ?? "Failed to save bucket";
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

    await deleteBucket(toDelete); // see note below
    const keyOf = (x: any) => x.adminRef ?? x.id ?? x.name;
    buckets.value = buckets.value.filter((b: any) => keyOf(b) !== keyOf(toDelete));
    pushNotification(new Notification("Success", `Bucket "${bucketToDelete.value?.name}" deleted sucessfully`, "success", 2000));

    bucketToDelete.value = null;
  } catch (e: any) {
    pushNotification(new Notification(`Failed to delete bucket "${bucketToDelete.value?.name}"`, e?.message, "error"));

    // error.value = e?.message ?? "Failed to delete bucket";
  }
}


watch(
  () => props.backend,
  async (backend) => {
    nameFilter.value = "";
    regionFilter.value = "all";
    sortKey.value = "name";
    sortDir.value = "asc";

    await loadBuckets();
  },
  { immediate: true },
);

watch([nameFilter, regionFilter, sortKey, sortDir], () => {
  page.value = 1;
});

watch(
  () => props.backend,
  () => {
    page.value = 1;
  },
);
watch(pageSize, () => {
  page.value = 1;
});
watch(pageSize, (v) => {
  pageSizeInput.value = String(v);
});

function commitPageSize() {
  const n = Number(pageSizeInput.value);
  if (!Number.isFinite(n)) {
    pageSizeInput.value = String(pageSize.value);
    return;
  }

  const v = Math.max(1, Math.floor(n));
  if (v !== pageSize.value) pageSize.value = v;
}

async function openCreateModal() {
  openingModal.value = true;
  try {
    modalMode.value = "create";
    editingBucket.value = null;

    modalDeps.value = (await prepareCreate()) as ModalDeps | null;
    showModal.value = true;
  } finally {
    openingModal.value = false;
  }
}

async function openEditModal(bucket: BucketType) {
  openingModal.value = true;
  try {
    modalMode.value = "edit";

    const res = await prepareEdit(bucket);
    editingBucket.value = res.bucket;
    modalDeps.value = res.deps;

    showModal.value = true;
  } finally {
    openingModal.value = false;
  }
}


</script>
