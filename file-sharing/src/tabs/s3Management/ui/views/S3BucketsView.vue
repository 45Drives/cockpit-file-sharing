<template>
    <div class="space-y-4  sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
        <!-- Header -->
        <div
            class="grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-well rounded-md shadow text-default my-2 rounded-b-md ring-1 ring-black ring-opacity-5 p-4 m-4">
            <!-- Left spacer to balance the button on the right -->
            <div></div>

            <!-- Centered title -->
            <div class="flex items-baseline justify-center gap-2 ">
                <h2 class="text-xl font-semibold text-slate-100">
                    S3 Bucket Management
                </h2>
                <span class="text-sm text-slate-400">
                    ({{ backendLabel }})
                </span>
            </div>

            <!-- Button on the right -->
            <button type="button" @click="openCreateModal"
                class="inline-flex btn-primary items-center gap-1.5 rounded-md  px-3 py-1.5 text-sm font-medium text-white shadow-sm  focus:outline-none focus:ring-2  focus:ring-offset-2 focus:ring-offset-slate-950">
                <ArchiveBoxIcon class="size-icon" />
                New bucket
            </button>
        </div>


        <!-- Filters / sort controls -->
        <div class="flex flex-col gap-3 rounded-lg border-default  bg-plugin-header p-4 text-sm text-slate-200 m-4">
            <div class="flex flex-wrap gap-4">
                <label class="flex min-w-[180px] flex-1 flex-col gap-1">
                    <span class="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Name
                    </span>
                    <input v-model="nameFilter" type="text" placeholder="Filter by name"
                        class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-1 " />
                </label>

                <label class="flex min-w-[180px] flex-1 flex-col gap-1">
                    <span class="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Region / Zone
                    </span>
                    <select v-model="regionFilter"
                        class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none  focus:ring-1 ">
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
                    <input v-model="tagFilter" type="text" placeholder="Filter by tag key/value"
                        class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none  focus:ring-1 " />
                </label>
            </div>

            <div class="flex flex-wrap gap-4">
                <label class="flex min-w-[180px] flex-1 flex-col gap-1">
                    <span class="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Sort by
                    </span>
                    <select v-model="sortKey"
                        class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none  focus:ring-1 ">
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
                    <select v-model="sortDir"
                        class="rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none  focus:ring-1 ">
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

        <!-- Buckets -->
        <div v-else>
            <div v-if="filteredSortedBuckets.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3 bg-accent m-4">
                <article v-for="bucket in filteredSortedBuckets" :key="bucket.name"
                    class="flex flex-col gap-3 rounded-lg border border-default bg-default p-4 shadow transition  hover:shadow-md">
                    <!-- Header with bucket logo -->
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex items-start gap-2">
                            <!-- Bucket logo -->
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
                    <div class="space-y-1 text-sm text-slate-200">
                        <div class="flex gap-2">
                            <span class="w-16 text-xs font-medium uppercase tracking-wide text-slate-500">
                                Owner
                            </span>
                            <span>{{ bucket.owner || "—" }}</span>
                        </div>
                        <div class="flex gap-2">
                            <span class="w-16 text-xs font-medium uppercase tracking-wide text-slate-500">
                                Created
                            </span>
                            <span>{{ formatDate(bucket.createdAt) }}</span>
                        </div>
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
                    </div>

                    <!-- Tags -->
                    <div v-if="bucket.tags && Object.keys(bucket.tags).length" class="mt-1 space-y-1 text-xs">
                        <p class="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            Tags
                        </p>
                        <div class="flex flex-wrap gap-1.5">
                            <span v-for="(value, key) in bucket.tags" :key="key"
                                class="inline-flex items-center rounded-full border border-default bg-default px-2 py-0.5 text-[11px] text-slate-200">
                                {{ key }}={{ value }}
                            </span>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="mt-3 flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
                        <button type="button" @click="openEditModal(bucket)"
                            class="rounded-md border border-default bg-default px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800">
                            Edit
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
        </div>

        <!-- Create / Edit modal -->
        <div v-if="showModal" class="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
            <div class="w-full max-w-md rounded-lg border border-slate-800 bg-slate-950 p-4 shadow-xl">
                <h3 class="mb-3 text-base font-semibold text-slate-100">
                    {{ modalMode === "create" ? "Create bucket" : "Edit bucket" }}
                </h3>

                <form @submit.prevent="submitModal" class="space-y-3 text-sm">
                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-300">
                            Bucket name
                        </label>
                        <input v-model="modalForm.name" :disabled="modalMode === 'edit'" type="text" required
                            class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60" />
                    </div>

                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-300">
                            Region
                        </label>
                        <input v-model="modalForm.region" type="text" placeholder="optional"
                            class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1" />
                    </div>

                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-300">
                            Owner
                        </label>
                        <input v-model="modalForm.owner" type="text" placeholder="optional / best-effort"
                            class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1" />
                    </div>

                    <div>
                        <label class="mb-1 block text-xs font-medium text-slate-300">
                            Tags (key1=value1,key2=value2)
                        </label>
                        <input v-model="modalForm.tagsText" type="text" placeholder="env=prod,team=storage"
                            class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1" />
                    </div>

                    <!-- NEW: Garage-specific fields -->
<!-- Garage-specific fields -->
<!-- Garage-specific fields -->
<div v-if="backend === 'garage'" class="mt-2 border-t border-slate-800 pt-3 space-y-3">
  <div>
    <label class="mb-1 block text-xs font-medium text-slate-300">
      Placement (Garage)
    </label>
    <input
      v-model="modalForm.garagePlacement"
      type="text"
      placeholder="e.g. 2:zone-a,zone-b"
      class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
    />
  </div>

  <div class="flex gap-2">
    <div class="flex-1">
      <label class="mb-1 block text-xs font-medium text-slate-300">
        Max size
      </label>
      <input
        v-model="modalForm.garageMaxSize"
        type="number"
        min="0"
        placeholder="e.g. 30"
        class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
      />
    </div>
    <div class="w-24">
      <label class="mb-1 block text-xs font-medium text-slate-300">
        Unit
      </label>
      <select
        v-model="modalForm.garageMaxSizeUnit"
        class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
      >
        <option value="MiB">MiB</option>
        <option value="GiB">GiB</option>
        <option value="TiB">TiB</option>
      </select>
    </div>
  </div>

  <div>
    <label class="mb-1 block text-xs font-medium text-slate-300">
      Max objects
    </label>
    <input
      v-model="modalForm.garageMaxObjects"
      type="number"
      min="0"
      placeholder="e.g. 100000"
      class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
    />
  </div>

  <!-- Website access -->
  <div class="mt-1 flex items-center gap-2">
    <input
      id="garageWebsiteEnabled"
      v-model="modalForm.garageWebsiteEnabled"
      type="checkbox"
      class="h-4 w-4 rounded border-slate-600 bg-default"
    />
    <label for="garageWebsiteEnabled" class="text-xs font-medium text-slate-300">
      Enable website access (public via Garage web endpoint)
    </label>
  </div>

  <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
    <div>
      <label class="mb-1 block text-xs font-medium text-slate-300">
        Index document
      </label>
      <input
        v-model="modalForm.garageWebsiteIndex"
        type="text"
        :disabled="!modalForm.garageWebsiteEnabled"
        placeholder="index.html"
        class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60"
      />
    </div>
    <div>
      <label class="mb-1 block text-xs font-medium text-slate-300">
        Error document (optional)
      </label>
      <input
        v-model="modalForm.garageWebsiteError"
        type="text"
        :disabled="!modalForm.garageWebsiteEnabled"
        placeholder="404.html"
        class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60"
      />
    </div>
  </div>
</div>
<div>
        <label class="mb-1 block text-xs font-medium text-slate-300">
            Aliases
        </label>
        <input
            v-model="modalForm.garageAliasesText"
            type="text"
            placeholder="Comma-separated, e.g. public-assets,cdn-bucket"
            class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
        />
        <p class="mt-1 text-[11px] text-slate-500">
            Each alias will be created with <code>garage bucket alias &lt;bucket&gt; &lt;alias&gt;</code>.
        </p>
    </div>
                    <!-- END NEW -->

                    <div class="mt-2 flex items-center justify-end gap-2">
                        <button type="button" @click="closeModal"
                            class="rounded-md border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800">
                            Cancel
                        </button>
                        <button type="submit" class="rounded-md px-3 py-1.5 text-xs font-medium text-white">
                            {{ modalMode === "create" ? "Create" : "Save changes" }}
                        </button>
                    </div>
                </form>
            </div>
        </div>


        <!-- Delete confirm -->
        <div v-if="bucketToDelete" class="fixed inset-0 z-20 flex items-center justify-center bg-black/60">
            <div class="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-950 p-4 shadow-xl text-sm">
                <h3 class="mb-2 text-base font-semibold text-slate-100">
                    Delete bucket
                </h3>
                <p class="mb-4 text-slate-300">
                    Are you sure you want to delete
                    <span class="font-semibold">{{ bucketToDelete.name }}</span>?
                    This may permanently remove all objects depending on the backend.
                </p>
                <div class="flex items-center justify-end gap-2">
                    <button type="button" @click="bucketToDelete = null"
                        class="rounded-md border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800">
                        Cancel
                    </button>
                    <button type="button" @click="performDelete"
                        class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500">
                        Delete
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive } from "vue";
import { listBucketsFromCeph, deleteBucketFromCeph } from "../../api/s3CliAdapter";
import { listBucketsFromMinio } from "../../api/minioCliAdapter";
import { listBucketsFromGarage, deleteBucketFromGarage, createGarageBucket } from "../../api/garageCliAdapter";
import type { S3Bucket } from "../../types/types";
import { ArchiveBoxIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{
    backend: "minio" | "ceph" | "garage";
}>();

const buckets = ref<S3Bucket[]>([]);
const loadingBuckets = ref(false);
const error = ref<string | null>(null);

// Filters / sort
const nameFilter = ref("");
const regionFilter = ref<string>("all");
const tagFilter = ref("");
const sortKey = ref<"name" | "region" | "objects" | "size">("name");
const sortDir = ref<"asc" | "desc">("asc");

// Modal / edit state
const showModal = ref(false);
const modalMode = ref<"create" | "edit">("create");
const modalForm = reactive<{
  name: string;
  region: string;
  owner: string;
  tagsText: string;

  garagePlacement: string;

  garageMaxSize: string;
  garageMaxSizeUnit: "MiB" | "GiB" | "TiB";
  garageMaxObjects: string;

  garageAllowText: string;
  garageDenyText: string;
  garageExtraArgsText: string;

  garageWebsiteEnabled: boolean;
  garageWebsiteIndex: string;
  garageWebsiteError: string;
  garageAliasesText: string;
}>({
  name: "",
  region: "",
  owner: "",
  tagsText: "",
  garagePlacement: "",
  garageMaxSize: "",
  garageMaxSizeUnit: "GiB",
  garageMaxObjects: "",
  garageAllowText: "",
  garageDenyText: "",
  garageExtraArgsText: "",
  garageWebsiteEnabled: false,
  garageWebsiteIndex: "index.html",
  garageWebsiteError: "",
  garageAliasesText: "",

});


let editingBucket: S3Bucket | null = null;

// Delete confirm state
const bucketToDelete = ref<S3Bucket | null>(null);

const backendLabel = computed(() => {
    if (props.backend === "minio") return "MinIO";
    if (props.backend === "ceph") return "Ceph RGW";
    return "Garage";
});

// Distinct regions from loaded buckets
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

function stringifyTags(tags?: Record<string, string>): string {
    if (!tags) return "";
    return Object.entries(tags)
        .map(([k, v]) => `${k}=${v}`)
        .join(",");
}

// Apply filter + sort
const filteredSortedBuckets = computed(() => {
    let result = [...buckets.value];

    // Filter by name
    if (nameFilter.value.trim()) {
        const needle = nameFilter.value.trim().toLowerCase();
        result = result.filter((b) =>
            b.name.toLowerCase().includes(needle)
        );
    }

    // Filter by region
    if (regionFilter.value !== "all") {
        result = result.filter((b) => {
            const r = b.region || "none";
            return r === regionFilter.value;
        });
    }

    // Filter by tags (key or value contains text)
    if (tagFilter.value.trim()) {
        const needle = tagFilter.value.trim().toLowerCase();
        result = result.filter((b) => {
            if (!b.tags) return false;
            return Object.entries(b.tags).some(
                ([k, v]) =>
                    k.toLowerCase().includes(needle) ||
                    String(v).toLowerCase().includes(needle)
            );
        });
    }

    // Sort
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

// Modal helpers
function openCreateModal() {
  modalMode.value = "create";
  modalForm.name = "";
  modalForm.region = "";
  modalForm.owner = "";
  modalForm.tagsText = "";

  modalForm.garagePlacement = "";
  modalForm.garageMaxSize = "";
  modalForm.garageMaxSizeUnit = "GiB";
  modalForm.garageMaxObjects = "";
  modalForm.garageAllowText = "";
  modalForm.garageDenyText = "";
  modalForm.garageExtraArgsText = "";

  modalForm.garageWebsiteEnabled = false;
  modalForm.garageWebsiteIndex = "index.html";
  modalForm.garageWebsiteError = "";

  editingBucket = null;
  showModal.value = true;
  modalForm.garageAliasesText = "";

}

function openEditModal(bucket: S3Bucket) {
  modalMode.value = "edit";
  editingBucket = bucket;
  modalForm.name = bucket.name;
  modalForm.region = bucket.region ?? "";
  modalForm.owner = bucket.owner ?? "";
  modalForm.tagsText = stringifyTags(bucket.tags);

  // For now, we don’t introspect website settings from Garage;
  // start with defaults.
  modalForm.garagePlacement = "";
  modalForm.garageMaxSize = "";
  modalForm.garageMaxSizeUnit = "GiB";
  modalForm.garageMaxObjects = "";
  modalForm.garageAllowText = "";
  modalForm.garageDenyText = "";
  modalForm.garageExtraArgsText = "";

  modalForm.garageWebsiteEnabled = false;
  modalForm.garageWebsiteIndex = "index.html";
  modalForm.garageWebsiteError = "";
  modalForm.garageAliasesText = "";
  showModal.value = true;
}

function closeModal() {
    showModal.value = false;
    editingBucket = null;
}

function parseList(text: string): string[] {
    return text
        .split(/[,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean);
}

async function createBucket(bucket: S3Bucket) {
  if (props.backend === "garage") {
    const allow = parseList(modalForm.garageAllowText);
    const deny = parseList(modalForm.garageDenyText);
    const extraArgs = parseList(modalForm.garageExtraArgsText);
    const aliases = parseList(modalForm.garageAliasesText);

    const quotaParts: string[] = [];

    const maxSizeRaw = String(modalForm.garageMaxSize ?? "").trim();
    const maxObjectsRaw = String(modalForm.garageMaxObjects ?? "").trim();

    if (maxSizeRaw) {
      quotaParts.push(
        "--max-size",
        `${maxSizeRaw}${modalForm.garageMaxSizeUnit}`
      );
    }

    if (maxObjectsRaw) {
      quotaParts.push("--max-objects", maxObjectsRaw);
    }

    const quota = quotaParts.length ? quotaParts.join(" ") : undefined;

    await createGarageBucket(bucket.name, {
      placement: modalForm.garagePlacement || undefined,
      quota,
      allow: allow.length ? allow : undefined,
      deny: deny.length ? deny : undefined,
      extraArgs: extraArgs.length ? extraArgs : undefined,
      website: modalForm.garageWebsiteEnabled
        ? {
            enable: true,
            indexDocument: modalForm.garageWebsiteIndex || undefined,
            errorDocument: modalForm.garageWebsiteError || undefined,
          }
        : undefined,
        aliases: aliases.length ? aliases : undefined,
    });
  } else if (props.backend === "ceph") {
    throw new Error("Ceph bucket creation not implemented yet");
  } else if (props.backend === "minio") {
    throw new Error("MinIO bucket creation not implemented yet");
  }
}


async function updateBucket(bucket: S3Bucket) {
    // TODO: implement per-backend update/metadata call
}

async function deleteBucket(bucket: S3Bucket) {
    if (props.backend === "ceph") {
        await deleteBucketFromCeph(bucket.name, {
            purgeObjects: true,
        });
    } else if (props.backend === "garage") {
        await deleteBucketFromGarage(bucket);
    } else if (props.backend === "minio") {
        // TODO: implement MinIO delete call, e.g. deleteBucketFromMinio(bucket.name)
    }
}




async function submitModal() {
    try {
        const tags = parseTags(modalForm.tagsText);
        if (modalMode.value === "create") {
            const newBucket: S3Bucket = {
                name: modalForm.name,
                region: modalForm.region || undefined,
                owner: modalForm.owner || undefined,
                tags: Object.keys(tags).length ? tags : undefined,
            };
            await createBucket(newBucket);
        } else if (editingBucket) {
            const updated: S3Bucket = {
                ...editingBucket,
                region: modalForm.region || undefined,
                owner: modalForm.owner || undefined,
                tags: Object.keys(tags).length ? tags : undefined,
            };
            await updateBucket(updated);
        }
        closeModal();
        await loadBuckets();
    } catch (e: any) {
        error.value = e?.message ?? "Failed to save bucket";
    }
}

// Delete flow
function confirmDelete(bucket: S3Bucket) {
    bucketToDelete.value = bucket;
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

// Reload whenever backend changes
watch(
    () => props.backend,
    () => {
        nameFilter.value = "";
        regionFilter.value = "all";
        tagFilter.value = "";
        sortKey.value = "name";
        sortDir.value = "asc";

        loadBuckets();
    },
    { immediate: true }
);
</script>