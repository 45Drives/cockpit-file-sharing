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
  
            <template v-if="backend === 'ceph' && mode === 'create'">
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
  
            <template v-else>
              <input
                v-model="modalForm.owner"
                type="text"
                placeholder="optional"
                class="w-full rounded-md border border-default bg-default px-3 py-1.5 text-sm text-slate-100 outline-none focus:ring-1"
              />
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
            <p class="text-[11px] text-slate-500">
              Enables object locking on the bucket at creation time (equivalent to
              mc mb --with-lock).
            </p>
  
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
            <p class="text-[11px] text-slate-500">
              Enables object versioning on the bucket at creation time.
            </p>
  
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
  
              <p class="text-[11px] text-slate-500">
                Optional quota limits for the bucket. Leave fields empty for no quota.
              </p>
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
                    v-model="modalForm.cephObjectLockEnabled"
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
                    :disabled="!modalForm.cephObjectLockEnabled || mode === 'edit'"
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
            <div class="space-y-2">
              <label class="block text-xs font-medium text-slate-300">
                ACL
              </label>
  
              <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                <!-- Grantee type -->
                <select
                  v-model="modalForm.cephAclGranteeType"
                  class="rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
                >
                  <option value="owner">Owner</option>
                  <option value="authenticated">Authenticated users</option>
                  <option value="everyone">Everyone (public)</option>
                </select>
  
                <!-- Permission, options depend on grantee -->
                <select
                  v-model="modalForm.cephAclPermission"
                  class="rounded-md border border-default bg-default px-2 py-1.5 text-xs text-slate-100 outline-none focus:ring-1"
                  :disabled="availablePermissions.length === 1"
                >
                  <option
                    v-for="p in availablePermissions"
                    :key="p.value"
                    :value="p.value"
                  >
                    {{ p.label }}
                  </option>
                </select>
              </div>
  
              <p class="text-[11px] text-slate-500">
                When the grantee is Owner, permission is always Full control.
                Authenticated users can only have Read. Everyone can have Read or
                Read and write.
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
  import type { RgwGateway, RgwUser, S3Bucket } from "../../types/types";
  
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
  }>();
  
  const emit = defineEmits<{
    (e: "close"): void;
    (e: "submit", payload: { mode: "create" | "edit"; form: any }): void;
  }>();
  
  const modalForm = reactive({
    name: "",
    region: "",
    owner: "",
  
    // Tags as key/value pairs for UI
    tags: [] as { key: string; value: string }[],
  
    // Garage...
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
  
    // Ceph RGW
    cephObjectLockEnabled: false,
    cephObjectLockMode: "COMPLIANCE" as "GOVERNANCE" | "COMPLIANCE",
    cephObjectLockRetentionDays: "",
    cephEncryptionMode: "none" as "none" | "sse-s3" | "kms",
    cephKmsKeyId: "",
    bucketPolicyText: "",
  
    cephVersioningEnabled: false,
  
    // Grantee UI + underlying ACL fields
    cephAclGranteeType: "owner" as "owner" | "authenticated" | "everyone",
    cephAclGrantee: "",
    cephAclPermission: "FULL_CONTROL" as
      | "READ"
      | "WRITE"
      | "READ_ACP"
      | "WRITE_ACP"
      | "FULL_CONTROL",
  
    cephPlacementTarget: "",
  
    // MinIO...
    minioObjectLockEnabled: false,
    minioVersioningEnabled: false,
    minioQuotaMaxSize: "",
    minioQuotaMaxSizeUnit: "GiB" as "MiB" | "GiB" | "TiB",
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
  
    modalForm.cephObjectLockEnabled = false;
    modalForm.cephObjectLockMode = "COMPLIANCE";
    modalForm.cephObjectLockRetentionDays = "";
    modalForm.cephEncryptionMode = "none";
    modalForm.cephKmsKeyId = "";
    modalForm.bucketPolicyText = "";
    modalForm.cephVersioningEnabled = false;
  
    modalForm.cephAclGranteeType = "owner";
    modalForm.cephAclGrantee = "";
    modalForm.cephAclPermission = "FULL_CONTROL";
    modalForm.cephPlacementTarget = "";
  
    modalForm.minioObjectLockEnabled = false;
    modalForm.minioVersioningEnabled = false;
    modalForm.minioQuotaMaxSize = "";
    modalForm.minioQuotaMaxSizeUnit = "GiB";
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

    // Garage edit defaults (this is the missing part)
    if (props.backend === "garage") {
      // placement / max objects if you have them on S3Bucket
      modalForm.garageMaxObjects =
        (props.bucketToEdit as any).garageMaxObjects != null
          ? String((props.bucketToEdit as any).garageMaxObjects)
          : "";

      // quotaBytes -> size + unit
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

      // website fields if you expose them on S3Bucket
      modalForm.garageWebsiteEnabled = !!(props.bucketToEdit as any).garageWebsiteEnabled;
      modalForm.garageWebsiteIndex =
        (props.bucketToEdit as any).garageWebsiteIndex || "index.html";
      modalForm.garageWebsiteError =
        (props.bucketToEdit as any).garageWebsiteError || "";

      // aliases as comma-separated
      const aliases = (props.bucketToEdit as any).garageAliases as string[] | undefined;
      modalForm.garageAliasesText = aliases && aliases.length ? aliases.join(",") : "";
    }

    // ACL defaults on edit
    modalForm.cephAclGranteeType = "owner";
    modalForm.cephAclGrantee = "";
    modalForm.cephAclPermission = "FULL_CONTROL";
  }
}
  
  watch(
    () => [props.visible, props.mode, props.bucketToEdit, props.backend],
    initFromProps,
    { immediate: true },
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
    },
  );
  
  watch(
    () => modalForm.cephAclGranteeType,
    (type) => {
      if (type === "owner") {
        modalForm.cephAclGrantee = "owner";
        modalForm.cephAclPermission = "FULL_CONTROL";
      } else if (type === "authenticated") {
        modalForm.cephAclGrantee = "authenticated-users";
        modalForm.cephAclPermission = "READ";
      } else if (type === "everyone") {
        modalForm.cephAclGrantee = "all-users";
        if (!["READ", "WRITE"].includes(modalForm.cephAclPermission)) {
          modalForm.cephAclPermission = "READ";
        }
      }
    },
    { immediate: true },
  );
  
  const availablePermissions = computed(() => {
    switch (modalForm.cephAclGranteeType) {
      case "owner":
        return [{ value: "FULL_CONTROL" as const, label: "Full control" }];
      case "authenticated":
        return [{ value: "READ" as const, label: "Read" }];
      case "everyone":
        return [
          { value: "READ" as const, label: "Read" },
          { value: "WRITE" as const, label: "Read and write" },
        ];
      default:
        return [];
    }
  });
  
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
  
    emit("submit", {
      mode: props.mode,
      form: {
        ...modalForm,
        tagsText, 
      },
    });
  }
  </script>
  