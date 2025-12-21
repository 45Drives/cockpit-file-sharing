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
          <label class="mb-1 block text-xs font-medium text-slate-300">Bucket name</label>
          <input v-model="modalForm.name" :disabled="mode === 'edit'" type="text" required
            class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1 disabled:opacity-60" />
        </div>

        <div class="w-full min-w-0">
          <label class="mb-1 block text-xs font-medium text-slate-300">Region</label>
          <input v-model="modalForm.region" type="text" placeholder="optional"
            class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1" />
        </div>

        <!-- Owner -->
        <div class="md:col-span-2">
          <label class="mb-1 block text-xs font-medium text-slate-300">Owner</label>

          <template v-if="backend === 'ceph'">
            <select v-model="modalForm.owner"
              class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1">
              <option value="">-- Select a Ceph user --</option>
              <option v-for="u in cephUsers" :key="u" :value="u">
                {{ u }}
              </option>
            </select>

            <p v-if="loadingCephUsers" class="mt-1 text-md text-muted">
              Loading Ceph users…
            </p>
            <p v-else-if="cephUsersError" class="mt-1 text-md text-red-400">
              {{ cephUsersError }}
            </p>
            <p v-else class="mt-1 text-md text-muted">
              Owner must be an existing RGW user (uid).
            </p>
          </template>
        </div>

        <!-- TAGS -->
        <div v-if="backend !== 'garage'" class="md:col-span-2">
          <label class="mb-1 block text-xs font-medium text-slate-300">Tags</label>

          <div class="space-y-2">
            <div v-for="(tag, index) in modalForm.tags" :key="index" class="flex gap-2">
              <input v-model="tag.key" type="text" placeholder="key (e.g. env)"
                class="flex-1 rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1" />
              <input v-model="tag.value" type="text" placeholder="value (e.g. prod)"
                class="flex-1 rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1" />
              <button v-if="modalForm.tags.length > 1" type="button" @click="removeTagRow(index)"
                class="rounded-md border border-default bg-default px-2 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800">
                Remove
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button type="button" @click="addTagRow" :disabled="modalForm.tags.length >= MAX_TAGS"
                class="rounded-md border  border-default bg-secondary px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-900 disabled:opacity-50">
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
            <label class="text-xs font-medium text-slate-300">
              Object locking (--with-lock)
            </label>
            <div class="flex items-center gap-2">
              <input id="minioObjectLockEnabled" v-model="modalForm.minioObjectLockEnabled" type="checkbox"
                class="h-4 w-4 rounded border-slate-600 bg-default" />
              <label for="minioObjectLockEnabled" class="text-xs text-slate-300">Enable</label>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <label class="text-xs font-medium text-slate-300">
              Versioning (--with-versioning)
            </label>
            <div class="flex items-center gap-2">
              <input id="minioVersioningEnabled" v-model="modalForm.minioVersioningEnabled" type="checkbox"
                class="h-4 w-4 rounded border-slate-600 bg-default" />
              <label for="minioVersioningEnabled" class="text-xs text-slate-300">Enable</label>
            </div>
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-medium text-slate-300">Quota</label>

            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <label class="mb-1 block text-sm font-medium text-slate-400">Max size</label>
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
        <div v-if="backend === 'garage'" class="md:col-span-2 mt-2 border-t border-slate-800 pt-3 space-y-3">
          <div class="flex gap-2">
            <div class="flex-1">
              <label class="mb-1 block text-xs font-medium text-slate-300">Max size</label>
              <input v-model="modalForm.garageMaxSize" type="number" min="0" placeholder="e.g. 30"
                class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1" />
            </div>
            <div class="w-24">
              <label class="mb-1 block text-xs font-medium text-slate-300">Unit</label>
              <select v-model="modalForm.garageMaxSizeUnit"
                class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1">
                <option value="MiB">MiB</option>
                <option value="GiB">GiB</option>
                <option value="TiB">TiB</option>
              </select>
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-slate-300">Max objects</label>
            <input v-model="modalForm.garageMaxObjects" type="number" min="0" placeholder="e.g. 100000"
              class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1" />
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-medium text-slate-300">Grant access keys</label>

            <p v-if="loadingGarageKeys" class="text-md text-muted">Loading Garage keys…</p>
            <p v-else-if="garageKeysError" class="text-md text-red-400">{{ garageKeysError }}</p>

            <div v-else class="space-y-2">
              <div class="text-md text-muted">
                Select keys that should access this bucket, then set permissions.
              </div>

              <div v-for="k in (garageKeys || [])" :key="k.id"
                class="flex items-center justify-between gap-3 rounded-md border border-default bg-default px-3 py-2">
                <div class="min-w-0">
                  <div class="text-xs font-medium text-slate-200 truncate">{{ k.name || k.id }}</div>
                  <div class="text-sm text-muted font-mono truncate">{{ k.id }}</div>
                </div>

                <div class="flex items-center gap-3">
                  <input type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-default"
                    :checked="isGranted(k.id, k.name)"
                    @change="toggleGrant(k.id, k.name, ($event.target as HTMLInputElement).checked)" />

                  <div v-if="isGranted(k.id, k.name)" class="flex items-center gap-2 text-xs">
                    <label class="flex items-center gap-1">
                      <input type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-default"
                        v-model="grantFor(k.id, k.name).read" />
                      <span>Read</span>
                    </label>

                    <label class="flex items-center gap-1">
                      <input type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-default"
                        v-model="grantFor(k.id, k.name).write" />
                      <span>Write</span>
                    </label>

                    <label class="flex items-center gap-1">
                      <input type="checkbox" class="h-4 w-4 rounded border-slate-600 bg-default"
                        v-model="grantFor(k.id, k.name).owner" />
                      <span>Owner</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <p class="text-xs text-muted">
              Owner is required for some bucket admin actions (example: website config via S3 APIs).
            </p>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-slate-300">Aliases</label>
            <input v-model="modalForm.garageAliasesText" type="text"
              placeholder="Comma-separated, e.g. public-assets,cdn-bucket"
              class="w-full rounded-md border border-default bg-default px-3 py-2.5 text-base text-slate-100 outline-none focus:ring-1" />
            <p class="mt-1 text-xs text-muted">
              Each alias will be created with
              <code>garage bucket alias &lt;bucket&gt; &lt;alias&gt;</code>.
            </p>
          </div>
        </div>

        <!-- Ceph -->
        <div v-if="backend === 'ceph'" class="md:col-span-2 mt-2 border-t border-slate-800 pt-3 space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-slate-300">Object Locking</label>
              <div class="flex items-center gap-2">
                <input id="cephObjectLockEnabled" v-model="modalForm.cephObjectLockEnabled" type="checkbox"
                  :disabled="mode === 'edit'" class="h-4 w-4 rounded border-slate-600 bg-default" />
                <label for="cephObjectLockEnabled" class="text-xs text-slate-300">Enable</label>
              </div>
            </div>
            <p class="text-xs text-muted">
              Locking can only be enabled when creating a bucket. In COMPLIANCE mode object versions cannot be
              overwritten or deleted during the retention period.
            </p>

            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label class="flex flex-col gap-1 text-xs">
                <span class="font-medium text-slate-300">Mode</span>
                <select v-model="modalForm.cephObjectLockMode"
                  :disabled="!modalForm.cephObjectLockEnabled || mode === 'edit'"
                  class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60">
                  <option value="GOVERNANCE">GOVERNANCE</option>
                  <option value="COMPLIANCE">COMPLIANCE</option>
                </select>
              </label>

              <label class="flex flex-col gap-1 text-xs">
                <span class="font-medium text-slate-300">Days</span>
                <input v-model="modalForm.cephObjectLockRetentionDays" type="number" min="1"
                  :disabled="!modalForm.cephObjectLockEnabled || mode === 'edit'" placeholder="e.g. 30"
                  class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60" />
              </label>
            </div>
          </div>

          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-slate-300">Versioning</label>
              <div class="flex items-center gap-2">
                <input id="cephVersioningEnabled" v-model="modalForm.cephVersioningEnabled" type="checkbox"
                  :disabled="cephVersioningLocked" class="h-4 w-4 rounded border-slate-600 bg-default" />
                <label for="cephVersioningEnabled" class="text-xs text-slate-300">Enable</label>
              </div>
            </div>
            <p class="text-xs text-muted">
              <span v-if="cephVersioningLocked">Versioning is required when Object Lock is enabled.</span>
              <span v-else>Enable or disable versioning on this bucket.</span>
            </p>
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-medium text-slate-300">Encryption</label>
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
            <p class="text-xs text-muted">
              SSE-S3 uses RGW-managed encryption keys. KMS mode connects to an external key management service.
            </p>
          </div>

          <!-- Bucket policy full width -->
          <div class="space-y-2 md:col-span-2">
            <div class="flex items-center justify-between gap-3">
              <label class="block text-xs font-medium text-slate-300">
                Bucket policy (JSON)
              </label>


            </div>

            <textarea v-model="modalForm.bucketPolicyText" rows="10" placeholder="Optional bucket policy JSON"
              class="w-full rounded-md border border-default bg-default px-3 py-2 text-xs text-slate-100 outline-none focus:ring-1 font-mono" />

            <p v-if="bucketPolicyError" class="text-xs text-red-400">
              {{ bucketPolicyError }}
            </p>
            <p v-else class="text-xs text-muted">
              Leave empty for no bucket policy. If provided, it must be valid JSON.
            </p>
            <div class="flex items-center gap-2">
              <a href="https://awspolicygen.s3.amazonaws.com/policygen.html" target="_blank" rel="noopener noreferrer"
                class="rounded-md border border-default bg-secondary px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800">
                <div class="flex">
                  <ArrowTopRightOnSquareIcon class="w-[1rem]"></ArrowTopRightOnSquareIcon>
                  Policy generator
                </div>

              </a>

              <a href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-bucket-policies.html?icmpid=docs_amazons3_console"
                target="_blank" rel="noopener noreferrer"
                class="rounded-md border border-default bg-secondary px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800">
                <div class="flex">
                  <ArrowTopRightOnSquareIcon class="w-[1rem]"></ArrowTopRightOnSquareIcon>
                  Examples

                </div>
              </a>

              <button type="button"
                class="rounded-md border border-default bg-primary px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                :disabled="!modalForm.bucketPolicyText?.trim()" @click="clearPolicy">
                Clear
              </button>
            </div>
          </div>
          <!-- Ceph ACL -->
          <div v-if="backend === 'ceph'" class="md:col-span-2 mt-2 border-t border-slate-800 pt-3 space-y-3">
            <label class="block text-xs font-medium text-slate-300">Access control (ACL)</label>

            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label class="flex flex-col gap-1 text-xs">
                <span class="font-medium text-slate-300">Grantee</span>
                <select v-model="modalForm.cephAclScope"
                  class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1">
                  <option value="owner">Owner</option>
                  <option value="authenticated-users">Authenticated users</option>
                  <option value="all-users">All users (public)</option>
                </select>
              </label>

              <label class="flex flex-col gap-1 text-xs">
                <span class="font-medium text-slate-300">Permission</span>
                <select v-model="modalForm.cephAclPermission"
                  class="rounded-md border border-default bg-default px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1">
                  <option v-for="o in cephAclPermissionOptions" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </option>
                </select>
              </label>
            </div>

            <p class="text-xs text-muted">
              Applies a simple ACL rule on create/edit.
            </p>
          </div>

        </div>
        <!-- Footer buttons -->
        <div class="mt-2 flex items-center justify-end gap-2 md:col-span-2">
          <button type="button" @click="emit('close')"
            class="rounded-md border border-default bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/90">
            Cancel
          </button>
          <button type="submit"
            class="rounded-md px-3 py-1.5 text-xs font-medium text-white bg-success hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950">
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
  RgwGateway, S3Bucket, CephAclPermission, CephAclRule, GarageKeyDetail, GarageBucketOptions, MinioBucketUpdateOptions, CephBucketCreateOptions, CephBucketUpdatePayload, GarageBucketKeyGrant,
} from "../../types/types";
import type { BucketFormData, BucketCreateForm, BucketEditForm } from "../../bucketBackends/bucketBackend";
import { splitBytesBinary } from "../../bucketBackends/bucketUtils";
import { ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";
const bucketPolicyError = ref<string | null>(null);
const MAX_TAGS = 10;
const cephObjectLockActive = computed(() => {
  if (props.mode === "edit") {
    return !!props.bucketToEdit?.objectLockEnabled;
  }
  return !!modalForm.cephObjectLockEnabled;
});

const cephVersioningLocked = computed(() => cephObjectLockActive.value);


const props = defineProps<{
  visible: boolean;
  mode: "create" | "edit";
  backend: "minio" | "ceph" | "garage";
  cephGateway?: RgwGateway | null;
  cephUsers: string[];
  loadingCephUsers: boolean;
  cephUsersError: string | null;
  bucketToEdit: S3Bucket | null;
  garageKeys?: GarageKeyDetail[];
  loadingGarageKeys?: boolean;
  garageKeysError?: string | null;
}>();

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
  cephAclScope: "owner" as "owner" | "authenticated-users" | "all-users",
  cephAclPermission: "READ" as CephAclPermission,
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
  modalForm.cephAclPermission = "READ";

  bucketPolicyError.value = null;
}

function initFromProps() {
  if (!props.visible) return;

  if (props.mode === "create") {
    resetForm();
    if (props.backend === "ceph" && props.cephUsers.length > 0) {
      modalForm.owner = props.cephUsers[0]!;
    }
    return;
  }

  if (props.mode === "edit" && props.bucketToEdit) {
    resetForm();
    if(props.backend == "ceph"){
      modalForm.name = props.bucketToEdit.adminRef;

    }
    else{
      modalForm.name = props.bucketToEdit.name;

    }
    modalForm.region = props.bucketToEdit.region ?? "";
    modalForm.owner = props.bucketToEdit.owner ?? "";
    modalForm.tags = tagsObjectToArray(props.bucketToEdit.tags);
    modalForm.bucketPolicyText = props.bucketToEdit.policy ?? "";

    if (props.backend === "minio") {
      modalForm.minioVersioningEnabled = props.bucketToEdit.versioning === "Enabled";
      modalForm.minioObjectLockEnabled = !!props.bucketToEdit.objectLockEnabled;

      const quotaBytes = props.bucketToEdit.quotaBytes;
      if (typeof quotaBytes === "number" && quotaBytes > 0) {
        const { value, unit } = splitBytesBinary(props.bucketToEdit.quotaBytes);
        modalForm.minioQuotaMaxSize = String(value);
        modalForm.minioQuotaMaxSizeUnit = unit;
      } else {
        modalForm.minioQuotaMaxSize = "";
        modalForm.minioQuotaMaxSizeUnit = "GiB";
      }
    }

    if (props.backend === "garage") {
      modalForm.garageMaxObjects =
        (props.bucketToEdit as any).garageMaxObjects != null
          ? String((props.bucketToEdit as any).garageMaxObjects)
          : "";

      const quotaBytes = props.bucketToEdit.quotaBytes;
      if (typeof quotaBytes === "number" && quotaBytes > 0) {
        const { value, unit } = splitBytesBinary(props.bucketToEdit.quotaBytes);
        modalForm.garageMaxSize = String(value);
        modalForm.garageMaxSizeUnit = unit;
      } else {
        modalForm.garageMaxSize = "";
        modalForm.garageMaxSizeUnit = "GiB";
      }

      modalForm.garageWebsiteEnabled = !!(props.bucketToEdit as any).garageWebsiteEnabled;
      modalForm.garageWebsiteIndex = (props.bucketToEdit as any).garageWebsiteIndex || "index.html";
      modalForm.garageWebsiteError = (props.bucketToEdit as any).garageWebsiteError || "";

      const aliases = (props.bucketToEdit as any).garageAliases as string[] | undefined;
      modalForm.garageAliasesText = aliases && aliases.length ? aliases.join(",") : "";
    }

    if (props.backend === "ceph" && props.bucketToEdit) {
      const aclRules = props.bucketToEdit.acl as CephAclRule[];

      const publicRule = aclRules.find((r) => r.grantee === "all-users");
      const authRule = aclRules.find((r) => r.grantee === "authenticated-users");
      const ownerRule = aclRules.find((r) => r.grantee === "owner");

      const chosen =
        publicRule || authRule || ownerRule || {
          grantee: "owner",
          permission: "READ" as CephAclPermission,
        };

      modalForm.cephAclScope = chosen.grantee as "owner" | "authenticated-users" | "all-users";
      modalForm.cephAclPermission = chosen.permission;
      modalForm.cephVersioningEnabled = props.bucketToEdit.versioning === "Enabled";

    } else {
      modalForm.cephAclScope = "owner";
      modalForm.cephAclPermission = "READ";
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

const cephAclPermissionOptions: { value: CephAclPermission; label: string }[] = [
  { value: "FULL_CONTROL", label: "Full control" },
  { value: "READ", label: "Read" },
  { value: "READ_WRITE", label: "Read and write" },
];

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

function keyHandle(id: string, name?: string) {
  return name?.trim() ? name.trim() : id;
}

function isGranted(id: string, name?: string) {
  const h = keyHandle(id, name);
  return modalForm.garageGrants.some((g) => g.keyIdOrName === h);
}

function grantFor(id: string, name?: string) {
  const h = keyHandle(id, name);
  let g = modalForm.garageGrants.find((x) => x.keyIdOrName === h);
  if (!g) {
    g = { keyIdOrName: h, read: true, write: false, owner: false };
    modalForm.garageGrants.push(g);
  }
  return g;
}

function toggleGrant(id: string, name: string | undefined, checked: boolean) {
  const h = keyHandle(id, name);
  if (checked) {
    if (!modalForm.garageGrants.some((g) => g.keyIdOrName === h)) {
      modalForm.garageGrants.push({ keyIdOrName: h, read: true, write: false, owner: false });
    }
  } else {
    modalForm.garageGrants = modalForm.garageGrants.filter((g) => g.keyIdOrName !== h);
  }
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
watch(
  cephObjectLockActive,
  (locked) => {
    if (locked) modalForm.cephVersioningEnabled = true;
  },
  { immediate: true }
);

</script>