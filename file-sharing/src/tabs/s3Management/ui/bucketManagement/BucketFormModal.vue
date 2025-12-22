<!-- BucketFormModal.vue -->
<template>
  <div v-if="visible" class="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
    <div class="w-1/2 rounded-lg border border-default bg-well p-4 shadow-xl max-h-[90vh] overflow-y-auto">
      <h3 class="mb-3 text-base font-semibold text-slate-100">
        {{ mode === "create" ? "Create bucket" : "Edit bucket" }}
      </h3>

      <form @submit.prevent="onSubmit"
        class="grid grid-cols-1 gap-3 text-sm md:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
        <div class="w-full min-w-0">
          <label class="mb-1 block text-md font-medium text-slate-300">Bucket name</label>
          <input v-model="modalForm.name" :disabled="mode === 'edit'" type="text" required
            class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1 disabled:opacity-60" />
        </div>

        <div class="w-full min-w-0">
          <label class="mb-1 block text-md font-medium text-slate-300">Region</label>
          <input v-model="modalForm.region" type="text" placeholder="optional"
            class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1" />
        </div>

        <!-- Owner -->
        <div class="md:col-span-2">
          <label class="mb-1 block text-md font-medium text-slate-300">Owner</label>

          <template v-if="backend === 'ceph'">
            <select v-model="modalForm.owner"
              class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1">
              <option value="">-- Select a Ceph user --</option>
              <option v-for="u in (cephDeps?.cephUsers ?? [])" :key="u" :value="u">
                {{ u }}
              </option>

            </select>

            <p v-if="cephDeps?.usersLoading" class="mt-1 text-md text-muted">
              Loading Ceph users…
            </p>
            <p v-else-if="cephDeps?.usersError" class="mt-1 text-md text-red-400">
              {{ cephDeps.usersError }}
            </p>
            <p v-else class="mt-1 text-md text-muted">
              Owner must be an existing RGW user (uid).
            </p>
          </template>
        </div>

        <!-- TAGS -->
        <div v-if="backend !== 'garage'" class="md:col-span-2">
          <label class="mb-1 block text-md font-medium ">Tags</label>

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
              <button
  v-else
  type="button"
  @click="clearTagRow(index)"
  class="rounded-md border border-default bg-default px-2 py-2 text-md font-medium text-slate-100 hover:bg-slate-800"
>
  Clear
</button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button type="button" @click="addTagRow" :disabled="modalForm.tags.length >= MAX_TAGS"
                class="rounded-md border  border-default bg-secondary px-3 py-2 text-md font-medium text-slate-100 hover:bg-slate-900 disabled:opacity-50">
                Add tag
              </button>

              <span class="text-sm text-muted">
                {{ modalForm.tags.length }} / {{ MAX_TAGS }}
              </span>
            </div>

            <p v-if="tagsLimitError" class="text-sm text-red-400">
              {{ tagsLimitError }}
            </p>
            <p v-else class="text-sm text-muted">
              Optional key/value tags. Only rows with both key and value are applied.
            </p>
          </div>
        </div>

        <!-- MinIO -->
        <div v-if="backend === 'minio'" class="md:col-span-2 mt-2 border-t border-slate-800 pt-3 space-y-4">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium font-semibold text-default">
              Object locking (--with-lock)
            </label>
            <div class="flex items-center gap-2">
              <input id="minioObjectLockEnabled"  :disabled="mode === 'edit'"  v-model="modalForm.minioObjectLockEnabled" type="checkbox"
                class="h-4 w-4 rounded border-slate-600 bg-default" />
              <label for="minioObjectLockEnabled" class="text-md font-semibold text-default">Enable</label>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <label class="text-sm font-medium font-semibold text-default">
              Versioning (--with-versioning)
            </label>
            <div class="flex items-center gap-2">
              <input id="minioVersioningEnabled" v-model="modalForm.minioVersioningEnabled" type="checkbox"
                class="h-4 w-4 rounded border-slate-600 bg-default" />
              <label for="minioVersioningEnabled" class="text-md font-semibold text-default">Enable</label>
            </div>
          </div>

          <div class="space-y-2">
            <label class="block text-md font-medium font-semibold text-default">Quota</label>

            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm font-medium font-semibold text-default">Max size</label>
                <div class="flex gap-2">
                  <input v-model="modalForm.minioQuotaMaxSize" type="number" min="0" placeholder="e.g. 100"
                    class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1" />
                  <select v-model="modalForm.minioQuotaMaxSizeUnit"
                    class="w-24 rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1">
                    <option value="MiB">MiB</option>
                    <option value="GiB">GiB</option>
                    <option value="TiB">TiB</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Garage -->
        <GarageBucketFields
            v-if="backend === 'garage'"
            :form="modalForm"
            :deps="garageDeps"
          />


        <!-- Ceph -->
        <div v-if="backend === 'ceph'" class="md:col-span-2 mt-2 border-t border-slate-800 pt-3 space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-md font-medium font-semibold text-default">Object Locking</label>
              <div class="flex items-center gap-2">
                <input id="cephObjectLockEnabled" v-model="modalForm.cephObjectLockEnabled" type="checkbox"
                  :disabled="mode === 'edit'" class="h-4 w-4 rounded border-slate-600 bg-default" />
                <label for="cephObjectLockEnabled" class="text-md font-semibold text-default">Enable</label>
              </div>
            </div>
            <p class="text-xs text-muted">
              Locking can only be enabled when creating a bucket. In COMPLIANCE mode object versions cannot be
              overwritten or deleted during the retention period.
            </p>

            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label class="flex flex-col gap-1 text-md">
                <span class="font-medium font-semibold text-default">Mode</span>
                <select v-model="modalForm.cephObjectLockMode"
                  :disabled="!modalForm.cephObjectLockEnabled || mode === 'edit'"
                  class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60">
                  <option value="GOVERNANCE">GOVERNANCE</option>
                  <option value="COMPLIANCE">COMPLIANCE</option>
                </select>
              </label>

              <label class="flex flex-col gap-1 text-md">
                <span class="font-medium font-semibold text-default">Days</span>
                <input v-model="modalForm.cephObjectLockRetentionDays" type="number" min="1"
                  :disabled="!modalForm.cephObjectLockEnabled || mode === 'edit'" placeholder="e.g. 30"
                  class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60" />
              </label>
            </div>
          </div>

          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label class="text-md font-medium font-semibold text-default">Versioning</label>
              <div class="flex items-center gap-2">
                <input id="cephVersioningEnabled" v-model="modalForm.cephVersioningEnabled" type="checkbox"
                  :disabled="cephVersioningLocked" class="h-4 w-4 rounded border-slate-600 bg-default" />
                <label for="cephVersioningEnabled" class="text-md font-semibold text-default">Enable</label>
              </div>
            </div>
            <p class="text-md text-muted">
              <span v-if="cephVersioningLocked">Versioning is required when Object Lock is enabled.</span>
              <span class="text-xs" v-else>Enable or disable versioning on this bucket.</span>
            </p>
          </div>

          <div class="space-y-2">
            <label class="block text-md font-medium font-semibold text-default">Encryption</label>
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <select v-model="modalForm.cephEncryptionMode"
                class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1">
                <option value="none">No default encryption</option>
                <option value="sse-s3">SSE-S3 Encryption</option>
                <option value="kms">External KMS (SSE-KMS)</option>
              </select>

              <input v-if="modalForm.cephEncryptionMode === 'kms'" v-model="modalForm.cephKmsKeyId" type="text"
                placeholder="KMS key id / alias"
                class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1" />
            </div>
            <p class="text-md text-muted">
              SSE-S3 uses RGW-managed encryption keys. KMS mode connects to an external key management service.
            </p>
          </div>

          <!-- Bucket policy full width -->
          <div class="space-y-2 md:col-span-2">
            <div class="flex items-center justify-between gap-3">
              <label class="block text-md font-medium font-semibold text-default">
                Bucket policy (JSON)
              </label>


            </div>

            <textarea v-model="modalForm.bucketPolicyText" rows="10" placeholder="Optional bucket policy JSON"
              class="w-full rounded-md border border-default bg-default px-3 py-2 text-md text-slate-100 outline-none focus:ring-1 font-mono" />

            <p v-if="bucketPolicyError" class="text-md text-red-400">
              {{ bucketPolicyError }}
            </p>
            <p v-else class="text-md text-muted">
              Leave empty for no bucket policy. If provided, it must be valid JSON.
            </p>
            <div class="flex items-center gap-2">
              <a href="https://awspolicygen.s3.amazonaws.com/policygen.html" target="_blank" rel="noopener noreferrer"
                class="rounded-md border border-default bg-secondary px-2.5 py-1 text-md font-medium text-slate-100 hover:bg-slate-800">
                <div class="flex">
                  <ArrowTopRightOnSquareIcon class="w-[1rem]"></ArrowTopRightOnSquareIcon>
                  Policy generator
                </div>

              </a>

              <a href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html?icmpid=docs_amazons3_console"
                target="_blank" rel="noopener noreferrer"
                class="rounded-md border border-default bg-secondary px-2.5 py-1 text-md font-medium text-slate-100 hover:bg-slate-800">
                <div class="flex">
                  <ArrowTopRightOnSquareIcon class="w-[1rem]"></ArrowTopRightOnSquareIcon>
                  Examples

                </div>
              </a>

              <button type="button"
                class="rounded-md border border-default bg-primary px-2.5 py-1 text-md font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                :disabled="!modalForm.bucketPolicyText?.trim()" @click="clearPolicy">
                Clear
              </button>
            </div>
          </div>
          <!-- Ceph ACL -->
          <div v-if="backend === 'ceph'" class="md:col-span-2 mt-2 border-t border-slate-800 pt-3 space-y-3">
            <label class="block text-md font-medium font-semibold text-default">Access control (ACL)</label>

            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label class="flex flex-col gap-1 text-md">
                <span class="font-medium font-semibold text-default">Grantee</span>
                <select v-model="modalForm.cephAclScope"
                  class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1">
                  <option value="owner">Owner</option>
                  <option value="authenticated-users">Authenticated users</option>
                  <option value="all-users">All users (public)</option>
                </select>
              </label>

              <label class="flex flex-col gap-1 text-md">
                <span class="font-medium font-semibold text-default">Permission</span>
                <select v-model="modalForm.cephAclPermission"
                  class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1">
                  <option v-for="o in cephAclPermissionOptions" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </option>
                </select>
              </label>
            </div>

            <p class="text-md text-muted">
              Applies a simple ACL rule on create/edit.
            </p>

            <div v-if="mode != 'edit'" class="space-y-2">
    <label class="block text-md font-medium font-semibold text-default">Placement target</label>

    <select
      v-model="modalForm.cephPlacementTarget"
      
      class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60"
    >
      <option value="">Default</option>
      <option
        v-for="t in (cephDeps?.cephPlacementTargets ?? [])"
        :key="t"
        :value="t"
      >
        {{ t }}
      </option>
    </select>

    <p v-if="cephDeps?.placementLoading" class="text-md text-muted">
      Loading placement targets…
    </p>
    <p v-else-if="cephDeps?.placementError" class="text-md text-red-400">
      {{ cephDeps.placementError }}
    </p>
    <p v-else class="text-md text-muted">
      When creating a bucket, a placement target can be provided as part of the LocationConstraint to override the default placement targets from the user and zonegroup.
    </p>
  </div>
          </div>

        </div>
        <!-- Footer buttons -->
        <div class="mt-2 flex items-center justify-end gap-2 md:col-span-2">
          <button type="button" @click="emit('close')"
            class="rounded-md border border-default bg-danger px-3 py-1.5 text-md font-medium text-white hover:bg-danger/90">
            Cancel
          </button>
          <button type="submit"
            class="rounded-md px-3 py-1.5 text-md font-medium text-white bg-success hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950">
            {{ mode === "create" ? "Create" : "Save changes" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch, ref, computed } from "vue";
import type {
  RgwGateway, CephAclPermission, CephAclRule, GarageBucketOptions, MinioBucketUpdateOptions, CephBucketCreateOptions, CephBucketUpdatePayload, GarageBucketKeyGrant,
  ModalDeps,CephBucket,MinioBucket,GarageBucket,
  CephDeps,
  MinioDeps,
  GarageDeps
} from "../../types/types";
import type { BucketFormData, BucketCreateForm, BucketEditForm } from "../../bucketBackends/bucketBackend";
import GarageBucketFields from "./GarageBucketFields.vue";
import { splitBytesBinary } from "../../bucketBackends/bucketUtils";
import { ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";
const bucketPolicyError = ref<string | null>(null);
const MAX_TAGS = 10;
const cephObjectLockActive = computed(() => {
  if (props.backend !== "ceph") return false;
  if (props.mode === "edit") return !!props.bucketToEdit?.objectLockEnabled;
  return !!modalForm.cephObjectLockEnabled;
});


const cephVersioningLocked = computed(() => cephObjectLockActive.value);

const cephDeps = computed<CephDeps | null>(() => (props.backend === "ceph" ? props.deps : null));
const garageDeps = computed<GarageDeps | null>(() => (props.backend === "garage" ? props.deps : null));

type BucketFormModalProps =
  | {
      visible: boolean;
      mode: "create" | "edit";
      backend: "ceph";
      cephGateway?: RgwGateway | null;
      bucketToEdit: CephBucket | null;
      deps: CephDeps | null;
    }
  | {
      visible: boolean;
      mode: "create" | "edit";
      backend: "minio";
      bucketToEdit: MinioBucket | null;
      deps: MinioDeps | null;
    }
  | {
      visible: boolean;
      mode: "create" | "edit";
      backend: "garage";
      bucketToEdit: GarageBucket | null;
      deps: GarageDeps | null;
    };

const props = defineProps<BucketFormModalProps>();


const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", payload: { mode: "create" | "edit"; form: BucketFormData }): void;
}>();

const modalForm = reactive({
  name: "",
  region: "",
  owner: "",
  cephUser: ref({ uid: "", tenant: "" }),
  tags: [] as { key: string; value: string }[],

  minioObjectLockEnabled: false,
  minioVersioningEnabled: false,
  minioQuotaMaxSize: "",
  minioQuotaMaxSizeUnit: "GiB" as "MiB" | "GiB" | "TiB",

  garageMaxSize: "",
  garageMaxSizeUnit: "GiB" as "MiB" | "GiB" | "TiB",
  garageMaxObjects: "",
  garageAllowText: "",
  garageDenyText: "",
  garageExtraArgsText: "",
  garageWebsiteEnabled: false,
  garageWebsiteIndex: "index.html",
  garageWebsiteError: "",
  garageAliasesText: "",
  garageGrants: [] as GarageBucketKeyGrant[],

  cephObjectLockEnabled: false,
  cephObjectLockMode: "COMPLIANCE" as "GOVERNANCE" | "COMPLIANCE",
  cephObjectLockRetentionDays: "",
  cephEncryptionMode: "none" as "none" | "sse-s3" | "kms",
  cephKmsKeyId: "",
  bucketPolicyText: "",
  cephVersioningEnabled: false,
  cephAclScope: "owner" as CephAclRule["grantee"],
  cephAclPermission: "FULL_CONTROL" as CephAclPermission,
 
  cephPlacementTarget: "",
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

  modalForm.minioObjectLockEnabled = false;
  modalForm.minioVersioningEnabled = false;
  modalForm.minioQuotaMaxSize = "";
  modalForm.minioQuotaMaxSizeUnit = "GiB";

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
  modalForm.garageGrants = [];

  modalForm.cephObjectLockEnabled = false;
  modalForm.cephObjectLockMode = "COMPLIANCE";
  modalForm.cephObjectLockRetentionDays = "";
  modalForm.cephEncryptionMode = "none";
  modalForm.cephKmsKeyId = "";
  modalForm.bucketPolicyText = "";
  modalForm.cephVersioningEnabled = false;
  modalForm.cephPlacementTarget = "";
  modalForm.cephAclScope = "owner";
modalForm.cephAclPermission = "FULL_CONTROL";

  bucketPolicyError.value = null;
}

function initFromProps() {
  if (!props.visible) return;

  if (props.mode === "create") {
    resetForm();

    if (props.backend === "ceph") {
      const users = cephDeps.value?.cephUsers ?? [];
      if (!modalForm.owner && users.length > 0) modalForm.owner = users[0]!;
    }
    return;
  }

  if (props.mode === "edit" && props.bucketToEdit) {
    resetForm();

    if (props.backend === "ceph") {
      const b = props.bucketToEdit;

      modalForm.name = b.adminRef;
      modalForm.region = b.region ?? "";
      modalForm.owner = b.owner ?? "";
      modalForm.tags = tagsObjectToArray(b.tags);
      modalForm.bucketPolicyText = b.policy ?? "";

      const aclRules = (b.acl ?? []) as CephAclRule[];
      const publicRule = aclRules.find((r) => r.grantee === "all-users");
      const authRule = aclRules.find((r) => r.grantee === "authenticated-users");
      const ownerRule = aclRules.find((r) => r.grantee === "owner");

      const chosen =
        publicRule ||
        authRule ||
        ownerRule || {
          grantee: "owner",
          permission: "FULL_CONTROL" as CephAclPermission,
        };

      modalForm.cephAclScope = chosen.grantee;
      modalForm.cephAclPermission = chosen.permission;

      modalForm.cephObjectLockEnabled = !!b.objectLockEnabled;
      modalForm.cephVersioningEnabled = b.versioning === "Enabled";
      return;
    }

    if (props.backend === "minio") {
      const b = props.bucketToEdit;

      modalForm.name = b.name;
      modalForm.region = b.region ?? "";
      modalForm.owner = b.owner ?? "";
      modalForm.tags = tagsObjectToArray(b.tags);

      modalForm.minioVersioningEnabled = b.versioning === "Enabled";
      modalForm.minioObjectLockEnabled = !!b.objectLockEnabled;

      const quotaBytes = b.quotaBytes;
      if (typeof quotaBytes === "number" && quotaBytes > 0) {
        const { value, unit } = splitBytesBinary(quotaBytes);
        modalForm.minioQuotaMaxSize = String(value);
        modalForm.minioQuotaMaxSizeUnit = unit;
      } else {
        modalForm.minioQuotaMaxSize = "";
        modalForm.minioQuotaMaxSizeUnit = "GiB";
      }
      return;
    }

    // garage
    {
      const b = props.bucketToEdit;

      modalForm.name = b.name;
      modalForm.region = b.region ?? "";
      modalForm.owner = b.owner ?? "";
      modalForm.tags = tagsObjectToArray(b.tags);

      modalForm.garageMaxObjects = b.garageMaxObjects != null ? String(b.garageMaxObjects) : "";

      const quotaBytes = b.quotaBytes;
      if (typeof quotaBytes === "number" && quotaBytes > 0) {
        const { value, unit } = splitBytesBinary(quotaBytes);
        modalForm.garageMaxSize = String(value);
        modalForm.garageMaxSizeUnit = unit;
      } else {
        modalForm.garageMaxSize = "";
        modalForm.garageMaxSizeUnit = "GiB";
      }

      modalForm.garageWebsiteEnabled = !!b.garageWebsiteEnabled;
      modalForm.garageWebsiteIndex = b.garageWebsiteIndex || "index.html";
      modalForm.garageWebsiteError = b.garageWebsiteError || "";

      const aliases = b.garageAliases;
      modalForm.garageAliasesText = aliases && aliases.length ? aliases.join(",") : "";
    }
  }
}

watch(() => [props.visible, props.mode, props.bucketToEdit, props.backend], initFromProps, { immediate: true });

watch(
  () => modalForm.bucketPolicyText,
  (val) => {
    const text = (val ?? "").trim();
    if (!text) {
      bucketPolicyError.value = null;
      return;
    }
    try {
      JSON.parse(text);
      bucketPolicyError.value = null;
    } catch {
      bucketPolicyError.value = "Bucket policy must be valid JSON.";
    }
  }
);

const cephAclPermissionOptions = computed((): { value: CephAclPermission; label: string }[] => {
  if (modalForm.cephAclScope === "owner") {
    return [{ value: "FULL_CONTROL", label: "Full control" }];
  }
  if (modalForm.cephAclScope === "authenticated-users") {
    return [{ value: "READ", label: "Read" }];
  }
  return [
    { value: "READ", label: "Read" },
    { value: "READ_WRITE", label: "Read and write" },
  ];
});




function addTagRow() {
  modalForm.tags.push({ key: "", value: "" });
}

function removeTagRow(index: number) {
  if (modalForm.tags.length <= 1) return;
  modalForm.tags.splice(index, 1);
}

function onSubmit() {
  const policyText = (modalForm.bucketPolicyText ?? "").trim();
  if (policyText) {
    try {
      JSON.parse(policyText);
    } catch {
      bucketPolicyError.value = "Bucket policy must be valid JSON.";
      return;
    }
  }
  const bucketPolicy: string | null = policyText ? policyText : null;


  const tagsMap = modalForm.tags
    .filter((t) => t.key.trim() && t.value.trim())
    .reduce<Record<string, string>>((acc, t) => {
      acc[t.key.trim()] = t.value.trim();
      return acc;
    }, {});
  const hasTags = Object.keys(tagsMap).length > 0;

  const tagsText = modalForm.tags
    .filter((t) => t.key.trim() && t.value.trim())
    .map((t) => `${t.key.trim()}=${t.value.trim()}`)
    .join(",");

  const cephAclRules = [
    {
      grantee: modalForm.cephAclScope,
      permission: modalForm.cephAclPermission,
    },
  ];

  let form: BucketFormData;

  if (props.backend === "ceph") {
    if (props.mode === "create") {
      const cephCreate: CephBucketCreateOptions = {
        name: modalForm.name,
        ownerUid: modalForm.owner || undefined,
        region: modalForm.region || undefined,
        placementTarget: modalForm.cephPlacementTarget || undefined,

        objectLockEnabled: !!modalForm.cephObjectLockEnabled,
        objectLockMode: modalForm.cephObjectLockMode,
        objectLockRetentionDays: modalForm.cephObjectLockRetentionDays
          ? Number(modalForm.cephObjectLockRetentionDays)
          : undefined,

        encryptionMode: modalForm.cephEncryptionMode,
        kmsKeyId: modalForm.cephEncryptionMode === "kms" ? modalForm.cephKmsKeyId || undefined : undefined,

        bucketPolicy: policyText || undefined,
        aclRules: cephAclRules,
      };

      form = {
        backend: "ceph",
        region: modalForm.region || undefined,
        tagsText: tagsText ?? "",
        ...cephCreate,
      } satisfies BucketCreateForm;
    } else {
      const cephEdit: CephBucketUpdatePayload = {
        name: modalForm.name,
        region: modalForm.region || undefined,
        owner: modalForm.owner || undefined,
        tagsText: tagsText ?? "",

        cephVersioningEnabled: !!modalForm.cephVersioningEnabled,
        cephEncryptionMode: modalForm.cephEncryptionMode,
        cephKmsKeyId: modalForm.cephEncryptionMode === "kms" ? modalForm.cephKmsKeyId || undefined : undefined,

        bucketPolicy: bucketPolicy,

        cephObjectLockMode: modalForm.cephObjectLockMode,
        cephObjectLockRetentionDays: modalForm.cephObjectLockRetentionDays || undefined,

        cephAclRules,
      };

      form = {
        backend: "ceph",
        ...cephEdit,
      } satisfies BucketEditForm;
    }
  } else if (props.backend === "minio") {
    const quotaSize = modalForm.minioQuotaMaxSize
      ? `${modalForm.minioQuotaMaxSize}${modalForm.minioQuotaMaxSizeUnit}`
      : null;

    const minio: MinioBucketUpdateOptions = {
      versioning: !!modalForm.minioVersioningEnabled,
      quotaSize,
      tags: hasTags ? tagsMap : null,
      objectLock: !!modalForm.minioObjectLockEnabled
    };

    form = {
      backend: "minio",
      name: modalForm.name,
      minio,
    } satisfies BucketFormData;
  } else {
    const quota = modalForm.garageMaxSize ? `${modalForm.garageMaxSize}${modalForm.garageMaxSizeUnit}` : null;

    const garage: GarageBucketOptions = {
      quota,
      maxObjects: modalForm.garageMaxObjects ? Number(modalForm.garageMaxObjects) : null,
      website: {
        enable: !!modalForm.garageWebsiteEnabled,
        indexDocument: modalForm.garageWebsiteIndex || undefined,
        errorDocument: modalForm.garageWebsiteError || undefined,
      },
      aliases: modalForm.garageAliasesText
        ? modalForm.garageAliasesText.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
      allow: null,
      deny: null,
      extraArgs: null,
    };

    form = {
      backend: "garage",
      name: modalForm.name,
      garage,
      grants: modalForm.garageGrants,
    } satisfies BucketFormData;
  }

  emit("submit", { mode: props.mode, form });
}


function clearPolicy() {
  modalForm.bucketPolicyText = "";
  bucketPolicyError.value = null;
}
const tagsLimitError = computed(() => {
  return modalForm.tags.length > MAX_TAGS
    ? `You can add up to ${MAX_TAGS} tags.`
    : null;
});

function clearTagRow(index: number) {
  const row = modalForm.tags[index];
  if (!row) return;
  row.key = "";
  row.value = "";
}


watch(
  cephObjectLockActive,
  (locked) => {
    if (locked) modalForm.cephVersioningEnabled = true;
  },
  { immediate: true }
);
watch(
  () => modalForm.cephAclScope,
  (scope) => {
    if (scope === "owner") {
      modalForm.cephAclPermission = "FULL_CONTROL";
    } else if (scope === "authenticated-users") {
      modalForm.cephAclPermission = "READ";
    } else {
      // all-users
      if (modalForm.cephAclPermission !== "READ" && modalForm.cephAclPermission !== "READ_WRITE") {
        modalForm.cephAclPermission = "READ";
      }
    }
  },
  { immediate: true },
);
watch(
  () => props.deps,
  () => {
    if (!props.visible) return;
    if (props.mode !== "create") return;
    if (props.backend !== "ceph") return;
    if (modalForm.owner) return;

    const users = props.deps?.cephUsers ?? [];
    if (users.length > 0) modalForm.owner = users[0]!;
  },
  { immediate: true },
);

</script>