<!-- S3BucketManagement.vue -->
<template>
  <div class="space-y-4 sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
    <!-- Header -->
    <div
      class="grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-well rounded-md shadow text-default my-2 rounded-b-md ring-1 ring-black ring-opacity-5 p-4 m-4"
    >
      <div></div>

      <div class="flex items-baseline justify-center gap-2">
        <h2 class="text-xl font-semibold text-slate-100">
          S3 Bucket Management
        </h2>
        <span class="text-sm text-slate-400">
          ({{ backendLabel }})
        </span>
      </div>

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

        <label class="flex min-w-[200px] flex-1 flex-col gap-1">
          <span class="text-xs font-medium uppercase tracking-wide text-slate-400">
            Tags
          </span>
          <input
            v-model="tagFilter"
            type="text"
            placeholder="Filter by tag key/value"
            class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-1"
          />
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

    <!-- Buckets -->
    <div v-else>
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
import {listBucketsFromCeph,deleteBucketFromCeph,createCephBucketViaS3,listRgwUsers,} from "../../api/s3CliAdapter";
import {listBucketsFromMinio,createBucketFromMinio,deleteBucketFromMinio,updateMinioBucket,type UpdateMinioBucketOptions} from "../../api/minioCliAdapter";
import {listBucketsFromGarage,deleteBucketFromGarage,createGarageBucket,updateGarageBucket,} from "../../api/garageCliAdapter";
import type { RgwGateway, S3Bucket, RgwUser } from "../../types/types";
import { ArchiveBoxIcon } from "@heroicons/vue/20/solid";
import BucketFormModal from "./BucketFormModal.vue";
import BucketDeleteModal from "./BucketDeleteModal.vue";

const props = defineProps<{
  backend: "minio" | "ceph" | "garage";
  cephGateway?: RgwGateway | null;
}>();

const buckets = ref<S3Bucket[]>([]);
const loadingBuckets = ref(false);
const error = ref<string | null>(null);

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
const editingBucket =  ref<S3Bucket | null>(null);

// delete state
const bucketToDelete = ref<S3Bucket | null>(null);

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

async function loadBuckets() {
  loadingBuckets.value = true;
  error.value = null;

  try {
    let fn: () => Promise<S3Bucket[]>;
    if (props.backend === "minio") {
      fn = listBucketsFromMinio;
    } else if (props.backend === "ceph") {
      fn = listBucketsFromCeph;
    } else {
      fn = listBucketsFromGarage;
    }

    const basic = await fn();
    buckets.value = basic;
  } catch (e: any) {
    error.value = e?.message ?? "Failed to list buckets";
    buckets.value = [];
  } finally {
    loadingBuckets.value = false;
  }
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function parseTags(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  text
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [k, v] = pair.split("=");
      if (k && v) {
        out[k.trim()] = v.trim();
      }
    });
  return out;
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

  showModal.value = true;
}

function openEditModal(bucket: S3Bucket) {
  modalMode.value = "edit";
  editingBucket.value = bucket;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  editingBucket.value = null;
}

// main create logic (uses form emitted by modal)
function parseList(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function createBucketFromForm(form: any) {
  if (props.backend === "garage") {
    const allow = parseList(form.garageAllowText || "");
    const deny = parseList(form.garageDenyText || "");
    const extraArgs = parseList(form.garageExtraArgsText || "");
    const aliases = parseList(form.garageAliasesText || "");

    const quotaParts: string[] = [];
    const maxSizeRaw = String(form.garageMaxSize ?? "").trim();
    const maxObjectsRaw = String(form.garageMaxObjects ?? "").trim();

    if (maxSizeRaw) {
      quotaParts.push("--max-size", `${maxSizeRaw}${form.garageMaxSizeUnit}`);
    }

    const quota = quotaParts.length ? quotaParts.join(" ") : undefined;
    const maxObjects = maxObjectsRaw ? Number(maxObjectsRaw) : undefined;

    await createGarageBucket(form.name, {
      quota,
      maxObjects,
      allow: allow.length ? allow : undefined,
      deny: deny.length ? deny : undefined,
      extraArgs: extraArgs.length ? extraArgs : undefined,
      website: form.garageWebsiteEnabled
        ? {
            enable: true,
            indexDocument: form.garageWebsiteIndex || undefined,
            errorDocument: form.garageWebsiteError || undefined,
          }
        : undefined,
      aliases: aliases.length ? aliases : undefined,
    });
  } else if (props.backend === "ceph") {
    const region =
      form.cephPlacementTarget || props.cephGateway?.zone || "us-east-1";

    const tags = parseTags(form.tagsText || "");

    await createCephBucketViaS3({
      bucketName: form.name,
      endpoint: props.cephGateway?.endpoint ?? "http://192.168.85.64:8080",
      region,
      tags: Object.keys(tags).length ? tags : undefined,
      encryptionMode: form.cephEncryptionMode,
      kmsKeyId: form.cephKmsKeyId || undefined,
      bucketPolicyJson: form.bucketPolicyText || undefined,
      aclGrantee: form.cephAclGrantee || undefined,
      aclPermission: form.cephAclPermission,
      owner: form.owner,
      objectLockEnabled: form.cephObjectLockEnabled,
      objectLockMode: form.cephObjectLockMode,
      objectLockRetentionDays: form.cephObjectLockRetentionDays
        ? Number(form.cephObjectLockRetentionDays)
        : undefined,
    });
  } else if (props.backend === "minio") {
    const maxSizeRaw = String(form.minioQuotaMaxSize ?? "").trim();
    const tags = parseTags(form.tagsText || "");

    await createBucketFromMinio(form.name, {
      region: form.region || undefined,
      withLock: form.minioObjectLockEnabled,
      withVersioning: form.minioVersioningEnabled,
      quotaSize: maxSizeRaw
        ? `${maxSizeRaw}${form.minioQuotaMaxSizeUnit}`
        : undefined,
      ignoreExisting: false,
    });
    if (Object.keys(tags).length) {
    await updateMinioBucket(form.name, { tags });
  }
  }
}

async function updateBucketFromForm(bucket: S3Bucket, form: any) {
  const parsedTags = parseTags(form.tagsText || "");
  const newTags: Record<string, string> | null =
    Object.keys(parsedTags).length ? parsedTags : null;

  if (props.backend === "garage") {
    const allow = parseList(form.garageAllowText || "");
    const deny = parseList(form.garageDenyText || "");
    const extraArgs = parseList(form.garageExtraArgsText || "");
    const aliases = parseList(form.garageAliasesText || "");

    //
    // 1) QUOTA (max size)
    //
    const maxSizeRaw = String(form.garageMaxSize ?? "").trim();

    const sizeMultipliers: Record<string, number> = {
      MiB: 1024 ** 2,
      GiB: 1024 ** 3,
      TiB: 1024 ** 4,
    };

    let newQuotaBytes: number | null = null;
    let newQuotaString: string | null = null;

    if (maxSizeRaw === "") {
      // User left field empty -> interpret as "no quota"
      newQuotaBytes = null;
      newQuotaString = null;
    } else {
      const numeric = Number(maxSizeRaw);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        newQuotaBytes = null;
        newQuotaString = null;
      } else {
        const unit = form.garageMaxSizeUnit as "MiB" | "GiB" | "TiB";
        const factor = sizeMultipliers[unit] ?? sizeMultipliers["GiB"];
        newQuotaBytes = Math.round(numeric * factor);
        newQuotaString = `--max-size ${maxSizeRaw}${unit}`;
      }
    }

    const oldQuotaBytes: number | null = bucket.quotaBytes ?? null;

    // Decide what to send to updateGarageBucket:
    // - undefined => do not touch quota
    // - null      => clear quota (max-size 0)
    // - string    => new "--max-size XGiB" etc.
    let quotaOption: string | null | undefined = undefined;
    if (newQuotaBytes !== oldQuotaBytes) {
      quotaOption = newQuotaString; // may be null to clear
    }

    //
    // 2) MAX OBJECTS
    //
    const maxObjectsRaw = String(form.garageMaxObjects ?? "").trim();

    let newMaxObjects: number | null = null;
    if (maxObjectsRaw === "") {
      newMaxObjects = null; // interpret empty as "no max-objects"
    } else {
      const n = Number(maxObjectsRaw);
      newMaxObjects = Number.isFinite(n) && n > 0 ? n : null;
    }

    const oldMaxObjects: number | null =
      (bucket as any).garageMaxObjects ?? null;

    // Same semantics:
    // - undefined => don’t touch
    // - null      => clear (--max-objects 0)
    // - number    => set new value
    let maxObjectsOption: number | null | undefined = undefined;
    if (newMaxObjects !== oldMaxObjects) {
      maxObjectsOption = newMaxObjects;
    }

    //
    // 3) Call updateGarageBucket
    //
    await updateGarageBucket(bucket.garageId!, {
      quota: quotaOption,
      maxObjects: maxObjectsOption,
      allow: allow.length ? allow : null,
      deny: deny.length ? deny : null,
      extraArgs: extraArgs.length ? extraArgs : undefined,
      website: form.garageWebsiteEnabled
        ? {
            enable: true,
            indexDocument: form.garageWebsiteIndex || undefined,
            errorDocument: form.garageWebsiteError || undefined,
          }
        : { enable: false },
      aliases: aliases.length ? aliases : null,
    });

    // Optionally update local bucket object so UI reflects new values without refetch:
    if (maxObjectsOption !== undefined) {
      (bucket as any).garageMaxObjects =
        maxObjectsOption === null ? undefined : maxObjectsOption;
    }
    if (quotaOption !== undefined) {
      bucket.quotaBytes = newQuotaBytes ?? undefined;
    }

    return;
  }

  if (props.backend === "minio") {
    const options: UpdateMinioBucketOptions = {};
    const newVersioningEnabled = !!form.minioVersioningEnabled;
    const oldVersioningEnabled = bucket.versioning === "Enabled";

    if (newVersioningEnabled !== oldVersioningEnabled) {
      options.versioning = newVersioningEnabled;
    }

    const maxSizeRaw = String(form.minioQuotaMaxSize ?? "").trim();
    let newQuotaString: string | null;
    let newQuotaBytes: number | null;

    if (maxSizeRaw === "") {
      newQuotaString = null;
      newQuotaBytes = null;
    } else {
      const numeric = Number(maxSizeRaw);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        newQuotaString = null;
        newQuotaBytes = null;
      } else {
        const unit = form.minioQuotaMaxSizeUnit;

        const multipliers: Record<string, number> = {
          KiB: 1024,
          MiB: 1024 ** 2,
          GiB: 1024 ** 3,
          TiB: 1024 ** 4,
          KB: 1000,
          MB: 1000 ** 2,
          GB: 1000 ** 3,
          TB: 1000 ** 4,
        };

        const factor = multipliers[unit] ?? 1;
        newQuotaBytes = Math.round(numeric * factor);
        newQuotaString = `${maxSizeRaw}${unit}`;
      }
    }

    const oldQuotaBytes: number | null = bucket.quotaBytes ?? null;

    if (newQuotaBytes !== oldQuotaBytes) {
      options.quotaSize = newQuotaString;
    }

    const oldTags: Record<string, string> | null =
      bucket.tags && Object.keys(bucket.tags).length ? bucket.tags : null;

    const tagsChanged =
      (oldTags === null && newTags !== null) ||
      (oldTags !== null && newTags === null) ||
      (oldTags !== null &&
        newTags !== null &&
        (Object.keys(oldTags).length !== Object.keys(newTags).length ||
          Object.entries(oldTags).some(([k, v]) => newTags[k] !== v)));

    if (tagsChanged) {
      options.tags = newTags;
    }

    if ("versioning" in options || "quotaSize" in options || "tags" in options) {
      await updateMinioBucket(bucket.name, options);
    }

    bucket.versioning = newVersioningEnabled ? "Enabled" : "Suspended";
    bucket.quotaBytes = newQuotaBytes ?? undefined;
    bucket.tags = newTags ?? undefined;

    return;
  }

  // You can later add a Ceph branch here if needed
}


async function handleFormSubmit(payload: { mode: "create" | "edit"; form: any }) {
  try {
    if (payload.mode === "create") {
      await createBucketFromForm(payload.form);
    } else if (payload.mode === "edit" && editingBucket) {
      await updateBucketFromForm(editingBucket.value!, payload.form);
    }
    closeModal();
    await loadBuckets();
  } catch (e: any) {
    error.value = e?.message ?? "Failed to save bucket";
  }
}

// delete flow
function confirmDelete(bucket: S3Bucket) {
  bucketToDelete.value = bucket;
}

async function deleteBucket(bucket: S3Bucket) {
  if (props.backend === "ceph") {
    await deleteBucketFromCeph(bucket.name, { purgeObjects: true });
  } else if (props.backend === "garage") {
    await deleteBucketFromGarage(bucket.garageId!);
  } else if (props.backend === "minio") {
    await deleteBucketFromMinio(bucket.name);
  }
}

async function performDelete() {
  if (!bucketToDelete.value) return;
  try {
    await deleteBucket(bucketToDelete.value);
    bucketToDelete.value = null;
    await loadBuckets();
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

// reload on backend change
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
  },
  { immediate: true },
);
</script>
