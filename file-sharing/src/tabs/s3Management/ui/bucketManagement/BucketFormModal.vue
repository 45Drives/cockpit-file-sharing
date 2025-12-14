<!-- BucketFormModal.vue -->
<template>
    <div v-if="visible" class="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
      <div
        class="w-full max-w-md rounded-lg border border-slate-800 bg-slate-950 p-4 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <h3 class="mb-3 text-base font-semibold text-slate-100">
          {{ mode === "create" ? "Create bucket" : "Edit bucket" }}
        </h3>
  
        <form @submit.prevent="onSubmit" class="space-y-3 text-sm">
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-300">
              Bucket name
            </label>
            <input
              v-model="modalForm.name"
              :disabled="mode === 'edit'"
              type="text"
              required
              class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1 disabled:opacity-60"
            />
          </div>
  
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-300">
              Region
            </label>
            <input
              v-model="modalForm.region"
              type="text"
              placeholder="optional"
              class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
            />
          </div>
  
          <div>
            <label class="mb-1 block text-xs font-medium text-slate-300">
              Owner
            </label>
  
            <template v-if="backend === 'ceph' ">
              <select
                v-model="modalForm.owner"
                class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
              >
                <option value="">
                  -- Select a Ceph user --
                </option>
                <option v-for="u in cephUsers" :key="u.uid" :value="u.uid">
                  {{ u.displayName || u.uid }} {{ u.email ? `(${u.email})` : "" }}
                </option>
              </select>
  
              <p v-if="loadingCephUsers" class="mt-1 text-[11px] text-slate-500">
                Loading Ceph users…
              </p>
              <p v-else-if="cephUsersError" class="mt-1 text-[11px] text-red-400">
                {{ cephUsersError }}
              </p>
              <p v-else class="mt-1 text-[11px] text-slate-500">
                Owner must be an existing RGW user (uid).
              </p>
            </template>
          </div>
  
          <!-- TAGS: key/value rows with Add button -->
          <div v-if="backend != 'garage'">
            <label class="mb-1 block text-xs font-medium text-slate-300">
              Tags
            </label>
            <div class="space-y-2">
              <div
                v-for="(tag, index) in modalForm.tags"
                :key="index"
                class="flex gap-2"
              >
                <input
                  v-model="tag.key"
                  type="text"
                  placeholder="key (e.g. env)"
                  class="flex-1 rounded-md border border-default bg-default px-3 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
                />
                <input
                  v-model="tag.value"
                  type="text"
                  placeholder="value (e.g. prod)"
                  class="flex-1 rounded-md border border-default bg-default px-3 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
                />
                <button
                  v-if="modalForm.tags.length > 1"
                  type="button"
                  @click="removeTagRow(index)"
                  class="rounded-md border border-default bg-default px-2 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800"
                >
                  Remove
                </button>
              </div>
  
              <button
                type="button"
                @click="addTagRow"
                class="rounded-md border border-dashed border-slate-600 bg-transparent px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-900"
              >
                Add tag
              </button>
  
              <p class="text-[11px] text-slate-500">
                Optional key/value tags. Only rows with both key and value are applied.
              </p>
            </div>
          </div>
  
          <!-- MinIO-specific fields -->
          <div v-if="backend === 'minio'" class="mt-2 border-t border-slate-800 pt-3 space-y-4">
  <div class="flex items-center justify-between">
    <label class="text-xs font-medium text-slate-300">
      Object locking (--with-lock)
    </label>
    <div class="flex items-center gap-2">
      <input
        id="minioObjectLockEnabled"
        v-model="modalForm.minioObjectLockEnabled"
        type="checkbox"
        class="h-4 w-4 rounded border-slate-600 bg-default"
      />
      <label for="minioObjectLockEnabled" class="text-xs text-slate-300">
        Enable
      </label>
    </div>
  </div>

  <div class="flex items-center justify-between">
    <label class="text-xs font-medium text-slate-300">
      Versioning (--with-versioning)
    </label>
    <div class="flex items-center gap-2">
      <input
        id="minioVersioningEnabled"
        v-model="modalForm.minioVersioningEnabled"
        type="checkbox"
        class="h-4 w-4 rounded border-slate-600 bg-default"
      />
      <label for="minioVersioningEnabled" class="text-xs text-slate-300">
        Enable
      </label>
    </div>
  </div>

  <div class="space-y-2">
    <label class="block text-xs font-medium text-slate-300">
      Quota
    </label>

    <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
      <div>
        <label class="mb-1 block text-[11px] font-medium text-slate-400">
          Max size
        </label>
        <div class="flex gap-2">
          <input
            v-model="modalForm.minioQuotaMaxSize"
            type="number"
            min="0"
            placeholder="e.g. 100"
            class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
          />
          <select
            v-model="modalForm.minioQuotaMaxSizeUnit"
            class="w-24 rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
          >
            <option value="MiB">MiB</option>
            <option value="GiB">GiB</option>
            <option value="TiB">TiB</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</div>

  
          <!-- Garage-specific fields -->
          <div v-if="backend === 'garage'" class="mt-2 border-t border-slate-800 pt-3 space-y-3">
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

  <div class="space-y-2">
    <label class="block text-xs font-medium text-slate-300">Grant access keys</label>

    <p v-if="loadingGarageKeys" class="text-[11px] text-slate-500">
      Loading Garage keys…
    </p>
    <p v-else-if="garageKeysError" class="text-[11px] text-red-400">
      {{ garageKeysError }}
    </p>

    <div v-else class="space-y-2">
      <div class="text-[11px] text-slate-500">
        Select keys that should access this bucket, then set permissions.
      </div>

      <div
        v-for="k in (garageKeys || [])"
        :key="k.id"
        class="flex items-center justify-between gap-3 rounded-md border border-default bg-default px-3 py-2"
      >
        <div class="min-w-0">
          <div class="text-xs font-medium text-slate-200 truncate">
            {{ k.name || k.id }}
          </div>
          <div class="text-[11px] text-slate-500 font-mono truncate">
            {{ k.id }}
          </div>
        </div>

        <div class="flex items-center gap-3">
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-slate-600 bg-default"
            :checked="isGranted(k.id, k.name)"
            @change="toggleGrant(k.id, k.name, ($event.target as HTMLInputElement).checked)"
          />

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

    <p class="text-[11px] text-slate-500">
      Owner is required for some bucket admin actions (example: website config via S3 APIs).
    </p>
  </div>
  <!-- website + aliases as you already have, still using garageWebsite* and garageAliasesText -->
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
              Each alias will be created with
              <code>garage bucket alias &lt;bucket&gt; &lt;alias&gt;</code>.
            </p>
          </div>
  
          <!-- Ceph RGW fields -->
          <div v-if="backend === 'ceph'" class="mt-2 border-t border-slate-800 pt-3 space-y-4">
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-xs font-medium text-slate-300">
                  Object Locking
                </label>
                <div class="flex items-center gap-2">
                  <input
                    id="cephObjectLockEnabled"
                    v-model="modalForm.objectLockEnabled"
                    type="checkbox"
                    :disabled="mode === 'edit'"
                    class="h-4 w-4 rounded border-slate-600 bg-default"
                  />
                  <label for="cephObjectLockEnabled" class="text-xs text-slate-300">
                    Enable
                  </label>
                </div>
              </div>
              <p class="text-[11px] text-slate-500">
                Locking can only be enabled when creating a bucket. In COMPLIANCE mode
                object versions cannot be overwritten or deleted during the retention period.
              </p>
  
              <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label class="flex flex-col gap-1 text-xs">
                  <span class="font-medium text-slate-300">Mode</span>
                  <select
                    v-model="modalForm.cephObjectLockMode"
                    :disabled="!modalForm.cephObjectLockEnabled || mode === 'edit'"
                    class="rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1 disabled:opacity-60"
                  >
                    <option value="GOVERNANCE">GOVERNANCE</option>
                    <option value="COMPLIANCE">COMPLIANCE</option>
                  </select>
                </label>
  
                <label class="flex flex-col gap-1 text-xs">
                  <span class="font-medium text-slate-300">Days</span>
                  <input
                    v-model="modalForm.cephObjectLockRetentionDays"
                    type="number"
                    min="1"
                    :disabled="!modalForm.cephObjectLockRetentionDays || mode === 'edit'"
                    placeholder="e.g. 30"
                    class="rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1 disabled:opacity-60"
                  />
                </label>
              </div>
            </div>
  
            <!-- Ceph versioning -->
            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <label class="text-xs font-medium text-slate-300">
                  Versioning
                </label>
                <div class="flex items-center gap-2">
                  <input
                    id="cephVersioningEnabled"
                    v-model="modalForm.cephVersioningEnabled"
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-600 bg-default"
                  />
                  <label for="cephVersioningEnabled" class="text-xs text-slate-300">
                    Enable
                  </label>
                </div>
              </div>
              <p class="text-[11px] text-slate-500">
                Enables versioning on this bucket after creation.
              </p>
            </div>
  
            <div class="space-y-2">
              <label class="block text-xs font-medium text-slate-300">
                Encryption
              </label>
              <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <select
                  v-model="modalForm.cephEncryptionMode"
                  class="rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
                >
                  <option value="none">No default encryption</option>
                  <option value="sse-s3">SSE-S3 Encryption</option>
                  <option value="kms">External KMS (SSE-KMS)</option>
                </select>
  
                <input
                  v-if="modalForm.cephEncryptionMode === 'kms'"
                  v-model="modalForm.cephKmsKeyId"
                  type="text"
                  placeholder="KMS key id / alias"
                  class="rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
                />
              </div>
              <p class="text-[11px] text-slate-500">
                SSE-S3 uses RGW-managed encryption keys. KMS mode connects to an external key
                management service.
              </p>
            </div>
  
            <div class="space-y-1">
              <label class="block text-xs font-medium text-slate-300">
                Bucket policy (JSON)
              </label>
              <textarea
                v-model="modalForm.bucketPolicyText"
                rows="4"
                placeholder="Optional bucket policy JSON"
                class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1 font-mono"
              />
              <p v-if="bucketPolicyError" class="text-[11px] text-red-400">
                {{ bucketPolicyError }}
              </p>
              <p v-else class="text-[11px] text-slate-500">
                Leave empty for no bucket policy. If provided, it must be valid JSON.
              </p>
            </div>
  
            <!-- ACL -->
<!-- ACL -->
<div class="space-y-2">
  <label class="block text-xs font-medium text-slate-300">
    ACL
  </label>

  <div class="grid grid-cols-1 gap-2 md:grid-cols-2 text-xs">
    <!-- Scope select -->
    <div class="flex flex-col gap-1">
      <span class="font-medium text-slate-300">Who can access</span>
      <select
        v-model="modalForm.cephAclScope"
        class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
      >
        <option value="owner">Owner only (private)</option>
        <option value="authenticated-users">Authenticated users</option>
        <option value="all-users">Everyone (public)</option>
      </select>
    </div>

    <!-- Permission select -->
    <div class="flex flex-col gap-1">
      <span class="font-medium text-slate-300">Permission</span>
      <select
        v-model="modalForm.cephAclPermission"
        class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
      >
        <option
          v-for="p in cephAclPermissionOptions"
          :key="p.value"
          :value="p.value"
        >
          {{ p.label }}
        </option>
      </select>
    </div>
  </div>

  <p class="text-[11px] text-slate-500">
    Select a single grantee scope and permission. This maps to one bucket ACL configuration.
  </p>
</div>


  
            <div class="space-y-1">
              <label class="block text-xs font-medium text-slate-300">
                Placement target
              </label>
              <input
                v-model="modalForm.cephPlacementTarget"
                type="text"
                placeholder="Optional placement target (LocationConstraint)"
                class="w-full rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
              />
              <p class="text-[11px] text-slate-500">
                Overrides default placement from user and zonegroup when creating the bucket.
              </p>
            </div>
          </div>
  
          <div class="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              @click="emit('close')"
              class="rounded-md border border-default bg-default px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="rounded-md px-3 py-1.5 text-xs font-medium text-white"
            >
              {{ mode === "create" ? "Create" : "Save changes" }}
            </button>
          </div>
        </form>
      </div>
    </div>
</template>
  
<script setup lang="ts">
import { reactive, watch, ref, computed } from "vue";
import type { RgwGateway, RgwUser, S3Bucket, CephAclPermission, CephAclRule, GarageKeyDetail } from "../../types/types";

const bucketPolicyError = ref<string | null>(null);

const props = defineProps<{
  visible: boolean;
  mode: "create" | "edit";
  backend: "minio" | "ceph" | "garage";
  cephGateway?: RgwGateway | null;
  cephUsers: RgwUser[];
  loadingCephUsers: boolean;
  cephUsersError: string | null;
  bucketToEdit: S3Bucket | null;
  garageKeys?: GarageKeyDetail[];
  loadingGarageKeys?: boolean;
  garageKeysError?: string | null;

}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", payload: { mode: "create" | "edit"; form: any }): void;
}>();

const modalForm = reactive({
  name: "",
  region: "",
  owner: "",

  // tags (generic)
  tags: [] as { key: string; value: string }[],

  // MinIO
  minioObjectLockEnabled: false,
  minioVersioningEnabled: false,
  minioQuotaMaxSize: "",
  minioQuotaMaxSizeUnit: "GiB" as "MiB" | "GiB" | "TiB",

  // Garage
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
  garageGrants: [] as Array<{
  keyIdOrName: string;
  read: boolean;
  write: boolean;
  owner: boolean;
}>,


  // Ceph RGW
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



function tagsObjectToArray(
  tags?: Record<string, string>
): { key: string; value: string }[] {
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

  // MinIO
  modalForm.minioObjectLockEnabled = false;
  modalForm.minioVersioningEnabled = false;
  modalForm.minioQuotaMaxSize = "";
  modalForm.minioQuotaMaxSizeUnit = "GiB";

  // Garage
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


  // Ceph
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
      modalForm.owner = props.cephUsers[0]!.uid;
    }
  } else if (props.mode === "edit" && props.bucketToEdit) {
    resetForm();
    modalForm.name = props.bucketToEdit.name;
    modalForm.region = props.bucketToEdit.region ?? "";
    modalForm.owner = props.bucketToEdit.owner ?? "";
    modalForm.tags = tagsObjectToArray(props.bucketToEdit.tags);
    modalForm.bucketPolicyText = props.bucketToEdit.policy ?? "";
    // MinIO edit defaults
    if (props.backend === "minio") {
  modalForm.minioVersioningEnabled =
    props.bucketToEdit.versioning === "Enabled";
  modalForm.minioObjectLockEnabled =
    !!props.bucketToEdit.objectLockEnabled;

  const quotaBytes = props.bucketToEdit.quotaBytes;
  if (typeof quotaBytes === "number" && quotaBytes > 0) {
    const MiB = 1024 * 1024;
    const GiB = 1024 * MiB;
    const TiB = 1024 * GiB;

    let unit: "MiB" | "GiB" | "TiB" = "GiB";
    let value: number;

    if (quotaBytes % TiB === 0) {
      unit = "TiB";
      value = quotaBytes / TiB;
    } else if (quotaBytes % GiB === 0) {
      unit = "GiB";
      value = quotaBytes / GiB;
    } else {
      unit = "MiB";
      value = quotaBytes / MiB;
    }

    modalForm.minioQuotaMaxSize = String(value);
    modalForm.minioQuotaMaxSizeUnit = unit;
  } else {
    modalForm.minioQuotaMaxSize = "";
    modalForm.minioQuotaMaxSizeUnit = "GiB";
  }
}


    // Garage edit defaults
    if (props.backend === "garage") {
  modalForm.garageMaxObjects =
    (props.bucketToEdit as any).garageMaxObjects != null
      ? String((props.bucketToEdit as any).garageMaxObjects)
      : "";

  const quotaBytes = props.bucketToEdit.quotaBytes;
  if (typeof quotaBytes === "number" && quotaBytes > 0) {
    const MiB = 1024 * 1024;
    const GiB = 1024 * MiB;
    const TiB = 1024 * GiB;

    let unit: "MiB" | "GiB" | "TiB" = "GiB";
    let value: number;

    if (quotaBytes % TiB === 0) {
      unit = "TiB";
      value = quotaBytes / TiB;
    } else if (quotaBytes % GiB === 0) {
      unit = "GiB";
      value = quotaBytes / GiB;
    } else {
      unit = "MiB";
      value = quotaBytes / MiB;
    }

    modalForm.garageMaxSize = String(value);
    modalForm.garageMaxSizeUnit = unit;
  } else {
    modalForm.garageMaxSize = "";
    modalForm.garageMaxSizeUnit = "GiB";
  }

  modalForm.garageWebsiteEnabled = !!(props.bucketToEdit as any)
    .garageWebsiteEnabled;
  modalForm.garageWebsiteIndex =
    (props.bucketToEdit as any).garageWebsiteIndex || "index.html";
  modalForm.garageWebsiteError =
    (props.bucketToEdit as any).garageWebsiteError || "";

  const aliases = (props.bucketToEdit as any)
    .garageAliases as string[] | undefined;
  modalForm.garageAliasesText =
    aliases && aliases.length ? aliases.join(",") : "";
}

    if (props.backend === "ceph" && props.bucketToEdit.acl) {
      const aclRules = props.bucketToEdit.acl as CephAclRule[];

      // Prefer public > authenticated > owner, if multiple entries exist
      const publicRule = aclRules.find((r) => r.grantee === "all-users");
      const authRule = aclRules.find((r) => r.grantee === "authenticated-users");
      const ownerRule = aclRules.find((r) => r.grantee === "owner");

      const chosen =
        publicRule || authRule || ownerRule || {
          grantee: "owner",
          permission: "READ" as CephAclPermission,
        };

      modalForm.cephAclScope = chosen.grantee as
        | "owner"
        | "authenticated-users"
        | "all-users";
      modalForm.cephAclPermission = chosen.permission;
    } else {
      // sensible default if no ACL info
      modalForm.cephAclScope = "owner";
      modalForm.cephAclPermission = "READ";
    }
    }
}

watch(
  () => [props.visible, props.mode, props.bucketToEdit, props.backend],
  initFromProps,
  { immediate: true }
);

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
  { value: "READ",         label: "Read" },
  { value: "READ_WRITE",   label: "Read and write" },
];


function addTagRow() {
  modalForm.tags.push({ key: "", value: "" });
}

function removeTagRow(index: number) {
  if (modalForm.tags.length <= 1) return;
  modalForm.tags.splice(index, 1);
}

function onSubmit() {
  const policyText = modalForm.bucketPolicyText?.trim();
  if (policyText) {
    try {
      JSON.parse(policyText);
    } catch {
      bucketPolicyError.value = "Bucket policy must be valid JSON.";
      return;
    }
  }

  const tagsText = modalForm.tags
    .filter((t) => t.key.trim() && t.value.trim())
    .map((t) => `${t.key.trim()}=${t.value.trim()}`)
    .join(",");

  // Build explicit ACL rules for Ceph RGW from the three rows
  const cephAclRules: Array<{
    grantee: "owner" | "authenticated-users" | "all-users";
    permission: CephAclPermission;
  }> = [];

  cephAclRules.push({
    grantee: modalForm.cephAclScope,
    permission: modalForm.cephAclPermission,
  });
 

emit("submit", {
  mode: props.mode,
  form: {
    ...modalForm,
    tagsText,
    cephAclRules,
    garageGrants: modalForm.garageGrants,
  },
});

}
function keyHandle(id: string, name?: string) {
  return name?.trim() ? name.trim() : id;
}

function isGranted(id: string, name?: string) {
  const h = keyHandle(id, name);
  return modalForm.garageGrants.some(g => g.keyIdOrName === h);
}

function grantFor(id: string, name?: string) {
  const h = keyHandle(id, name);
  let g = modalForm.garageGrants.find(x => x.keyIdOrName === h);
  if (!g) {
    g = { keyIdOrName: h, read: true, write: false, owner: false };
    modalForm.garageGrants.push(g);
  }
  return g;
}

function toggleGrant(id: string, name: string | undefined, checked: boolean) {
  const h = keyHandle(id, name);
  if (checked) {
    if (!modalForm.garageGrants.some(g => g.keyIdOrName === h)) {
      modalForm.garageGrants.push({ keyIdOrName: h, read: true, write: false, owner: false });
    }
  } else {
    modalForm.garageGrants = modalForm.garageGrants.filter(g => g.keyIdOrName !== h);
  }
}


</script>
