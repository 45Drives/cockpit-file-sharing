<!-- BucketFormModal.vue -->
<template>
  <div v-if="visible" class="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
    <div class="w-1/2 rounded-lg border border-default bg-well p-4 shadow-xl max-h-[90vh] overflow-y-auto">
      <h3 class="mb-3 text-base font-semibold text-slate-100">
        {{ mode === "create" ? "Create bucket" : "Edit bucket" }}
      </h3>

      <form @submit.prevent="submit"
        class="grid grid-cols-1 gap-3 text-sm md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <!-- Shared (Ceph/MinIO only): name + region + tags -->
        <div v-if="backend !== 'garage'" class="w-full min-w-0">
          <label class="mb-1 block text-md font-medium text-slate-300">Bucket name</label>
          <input v-model="modalForm.name" :disabled="mode === 'edit'" type="text" required
            class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1 disabled:opacity-60" />
        </div>

        <div v-if="backend !== 'garage'" class="w-full min-w-0">
          <label class="mb-1 block text-md font-medium text-slate-300">Region</label>
          <input v-model="modalForm.region" type="text" placeholder="optional"
            class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1" />
        </div>

        <!-- Owner (Ceph only) -->
        <div v-if="backend === 'ceph'" class="md:col-span-2">
          <label class="mb-1 block text-md font-medium text-slate-300">Owner</label>

          <select v-model="modalForm.owner"
            class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1">
            <option value="">-- Select a Ceph user --</option>
            <option v-for="u in (cephDeps?.cephUsers ?? [])" :key="u" :value="u">
              {{ u }}
            </option>
          </select>

          <p v-if="cephDeps?.usersLoading" class="mt-1 text-md text-muted">Loading Ceph users…</p>
          <p v-else-if="cephDeps?.usersError" class="mt-1 text-md text-red-400">{{ cephDeps.usersError }}</p>
          <p v-else class="mt-1 text-md text-muted">Owner must be an existing RGW user (uid).</p>
        </div>

        <!-- TAGS (Ceph/MinIO only) -->
        <div v-if="backend !== 'garage'" class="md:col-span-2">
          <label class="mb-1 block text-md font-medium">Tags</label>

          <div class="space-y-2">
            <div v-for="(tag, index) in modalForm.tags" :key="index" class="flex gap-2">
              <input v-model="tag.key" type="text" placeholder="key (e.g. env)"
                class="flex-1 rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1" />
              <input v-model="tag.value" type="text" placeholder="value (e.g. prod)"
                class="flex-1 rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1" />

              <button v-if="modalForm.tags.length > 1" type="button" @click="removeTagRow(index)"
                class="rounded-md border border-default bg-default px-2 py-2 text-md font-medium text-slate-100 hover:bg-slate-800">
                Remove
              </button>

              <button v-else type="button" @click="clearTagRow(index)"
                class="rounded-md border border-default bg-default px-2 py-2 text-md font-medium text-slate-100 hover:bg-slate-800">
                Clear
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button type="button" @click="addTagRow" :disabled="modalForm.tags.length >= MAX_TAGS"
                class="rounded-md border border-default bg-secondary px-3 py-2 text-md font-medium text-slate-100 hover:bg-slate-900 disabled:opacity-50">
                Add tag
              </button>

              <span class="text-sm text-muted">{{ modalForm.tags.length }} / {{ MAX_TAGS }}</span>
            </div>

            <p v-if="tagsLimitError" class="text-sm text-red-400">{{ tagsLimitError }}</p>
            <p v-else class="text-sm text-muted">
              Optional key/value tags. Only rows with both key and value are applied.
            </p>
          </div>
        </div>

        <!-- Backend forms -->
        <MinioBucketForm v-if="backend === 'minio'" ref="minioRef" :mode="mode"
          :bucket="(bucketToEdit as MinioBucket | null)" />

        <GarageBucketForm v-else-if="backend === 'garage'" ref="garageRef" :mode="mode"
          :bucket="(bucketToEdit as GarageBucket | null)" :deps="(deps as GarageDeps | null)" />
        <CephBucketForm v-else-if="backend === 'ceph'" ref="cephRef" :mode="mode"
          :bucket="(bucketToEdit as CephBucket | null)" :deps="(deps as CephDeps | null)" />


        <div class="mt-2 flex items-center justify-end gap-2 md:col-span-2">
          <button type="button" @click="emit('close')"
           :disabled="submitting"
            class="rounded-md border border-default bg-danger px-3 py-1.5 text-md font-medium text-white hover:bg-danger/90 
            disabled:opacity-60 disabled:cursor-not-allowed ">
            Cancel
          </button>
          <button type="submit"
          :disabled="submitting"
          class="rounded-md px-3 py-1.5 text-md font-medium text-white bg-success
         hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500
         focus:ring-offset-2 focus:ring-offset-slate-950
         disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-success">
            {{ mode === "create" ? "Create" : "Save changes" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch, ref, computed } from "vue";
import GarageBucketForm from "./forms/GarageBucketForm.vue";
import MinioBucketForm from "./forms/MinioBucketForm.vue";
import CephBucketForm from "./forms/CephBucketForm.vue";
import type {
  RgwGateway, MinioBucketUpdateOptions, CephBucket, MinioBucket, GarageBucket, CephDeps, MinioDeps, GarageDeps,
} from "../../types/types";

import type { BucketFormData } from "../../bucketBackends/bucketBackend";

type FormApi = { validate: () => boolean; build: () => BucketFormData };
const garageRef = ref<FormApi | null>(null);
const minioRef = ref<FormApi | null>(null);
type CephFormApi = {
  validate: () => boolean;
  build: (args: { name: string; region?: string; ownerUid?: string; tagsText?: string }) => BucketFormData;
};
const cephRef = ref<CephFormApi | null>(null);
const MAX_TAGS = 10;

type BucketFormModalProps =
  | {
    visible: boolean;
    mode: "create" | "edit";
    submitting: boolean;
    backend: "ceph";
    cephGateway?: RgwGateway | null;
    bucketToEdit: CephBucket | null;
    deps: CephDeps | null;
  }
  | {
    visible: boolean;
    mode: "create" | "edit";
    submitting: boolean;
    backend: "minio";
    bucketToEdit: MinioBucket | null;
    deps: MinioDeps | null;
  }
  | {
    visible: boolean;
    mode: "create" | "edit";
    submitting: boolean;
    backend: "garage";
    bucketToEdit: GarageBucket | null;
    deps: GarageDeps | null;
  };

const props = defineProps<BucketFormModalProps>();
const submitting = computed(() => props.submitting);
const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", payload: { mode: "create" | "edit"; form: BucketFormData }): void;
}>();

const cephDeps = computed<CephDeps | null>(() => (props.backend === "ceph" ? props.deps : null));

const modalForm = reactive({
  name: "",
  region: "",
  owner: "",
  tags: [] as { key: string; value: string }[],

});



function tagsObjectToArray(tags?: Record<string, string>): { key: string; value: string }[] {
  if (!tags) return [{ key: "", value: "" }];
  const entries = Object.entries(tags);
  if (!entries.length) return [{ key: "", value: "" }];
  return entries.map(([key, value]) => ({ key, value }));
}

function resetForm() {
  modalForm.name = "";
  modalForm.region = "";
  modalForm.owner = "";
  modalForm.tags = [{ key: "", value: "" }];
}

function initFromProps() {
  if (!props.visible) return;

  if (props.mode === "create") {
    resetForm();

    return;
  }

  if (props.mode === "edit" && props.bucketToEdit) {
    resetForm();

  if (props.backend === "ceph") {
    const b = props.bucketToEdit as CephBucket;
    modalForm.name = b.adminRef!; 
    modalForm.region = b.region ?? "";
    modalForm.owner = b.owner ?? "";
    modalForm.tags = tagsObjectToArray(b.tags);
    return;
  }
    if (props.backend === "minio") {
      const b = props.bucketToEdit;

      modalForm.name = b.name;
      modalForm.region = b.region ?? "";
      modalForm.owner = b.owner ?? "";
      modalForm.tags = tagsObjectToArray(b.tags);

      return;
    }

    if (props.backend === "garage") {
      return;
    }
  }
}

watch(() => [props.visible, props.mode, props.bucketToEdit, props.backend], initFromProps, { immediate: true });

function addTagRow() {
  modalForm.tags.push({ key: "", value: "" });
}

function removeTagRow(index: number) {
  if (modalForm.tags.length <= 1) return;
  modalForm.tags.splice(index, 1);
}

function clearTagRow(index: number) {
  const row = modalForm.tags[index];
  if (!row) return;
  row.key = "";
  row.value = "";
}

const tagsLimitError = computed(() => {
  return modalForm.tags.length > MAX_TAGS ? `You can add up to ${MAX_TAGS} tags.` : null;
});

// BucketFormModal.vue submit()
function submit() {
  if (props.submitting) return;
  if (props.backend === "garage") {
    const api = garageRef.value;
    if (!api) return;
    if (!api.validate()) return;
    emit("submit", { mode: props.mode, form: api.build() });
    return;
  }

  if (props.backend === "minio") {
    const api = minioRef.value;
    if (!api) return;
    if (!api.validate()) return;

    const built = api.build();

    const tagsMap = modalForm.tags
      .filter((t) => t.key.trim() && t.value.trim())
      .reduce<Record<string, string>>((acc, t) => {
        acc[t.key.trim()] = t.value.trim();
        return acc;
      }, {});
    const hasTags = Object.keys(tagsMap).length > 0;

    emit("submit", {
      mode: props.mode,
      form: {
        ...built,
        name: modalForm.name,
        backend: "minio",
        minio: {
          ...(built as any).minio,
          tags: hasTags ? tagsMap : null,
        } as MinioBucketUpdateOptions,
      },
    });
    return;
  }

  if (props.backend === "ceph") {
    const api = cephRef.value;
    if (!api) return;
    if (!api.validate()) return;

    const tagsText = modalForm.tags
      .filter((t) => t.key.trim() && t.value.trim())
      .map((t) => `${t.key.trim()}=${t.value.trim()}`)
      .join(",");

    emit("submit", {
      mode: props.mode,
      form: api.build({
        name: modalForm.name,
        region: modalForm.region || undefined,
        ownerUid: modalForm.owner || undefined,
        tagsText: tagsText ?? "",
      }),
    });
    return;
  }
}

watch(
  () => props.deps,
  () => {
    if (!props.visible) return;
    if (props.mode !== "create") return;
    if (props.backend !== "ceph") return;
    if (modalForm.owner) return;

    const users = (props.deps as CephDeps | null)?.cephUsers ?? [];
    if (users.length > 0) modalForm.owner = users[0]!;
  },
  { immediate: true }
);
</script>
