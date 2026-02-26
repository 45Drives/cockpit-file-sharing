<template>
  <section class="bg-default rounded-lg border border-default px-5 py-4 shadow-sm">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h2 class="text-lg font-semibold">Keys</h2>
      </div>

      <div class="flex items-center gap-2">
        <input
          v-model.trim="searchQuery"
          type="text"
          placeholder="Search access keys"
          class="rounded-md border border-default bg-default px-3 py-1.5 text-xs text-default"
        />
        <button
          class="inline-flex items-center btn-primary text-default text-xs font-semibold rounded px-3 py-1.5 disabled:opacity-60"
          @click="openCreateDialog"
          :disabled="loading"
        >
          Create key
        </button>

        <button
          class="inline-flex items-center btn-secondary text-default text-xs font-semibold rounded px-3 py-1.5 disabled:opacity-60"
          @click="loadAccessKeys"
          :disabled="loading"
        >
          <ArrowPathIcon class="size-icon mr-1" />
        </button>
      </div>
    </div>

    <div v-if="error" class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div v-if="loading" class="py-3 text-sm text-muted">
      Loading access keys...
    </div>

    <div v-else-if="filteredAccessKeys.length" class="overflow-x-auto">
      <table class="min-w-full border-collapse text-sm">
        <thead>
          <tr class="text-center">
            <th class="px-3 py-2 border-b border-default font-semibold whitespace-nowrap">Access key</th>
            <th class="px-3 py-2 border-b border-default font-semibold whitespace-nowrap">Expiration</th>
            <th class="px-3 py-2 border-b border-default font-semibold whitespace-nowrap">Status</th>
            <th class="px-3 py-2 border-b border-default font-semibold whitespace-nowrap">Name</th>
            <th class="px-3 py-2 border-b border-default font-semibold whitespace-nowrap">Description</th>
            <th class="px-3 py-2 border-b border-default font-semibold whitespace-nowrap">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="key in filteredAccessKeys" :key="key.accessKey" class="text-center">
            <td class="px-3 py-2 border-b border-default font-mono text-xs">{{ key.accessKey }}</td>
            <td class="px-3 py-2 border-b border-default text-xs">
              {{ key.expiresAt ? formatIsoLocal(key.expiresAt) : "No expiry" }}
            </td>
            <td class="px-3 py-2 border-b border-default">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                :class="(key.status ?? 'enabled') === 'enabled' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'"
              >
                {{ (key.status ?? "enabled") === "enabled" ? "Enabled" : "Disabled" }}
              </span>
            </td>
            <td class="px-3 py-2 border-b border-default text-xs">{{ key.name || "-" }}</td>
            <td class="px-3 py-2 border-b border-default text-xs">{{ key.description || "-" }}</td>
            <td class="px-3 py-2 border-b border-default whitespace-nowrap space-x-1">
              <button
                class="inline-flex items-center btn-secondary text-xs text-default font-semibold rounded px-2 py-1"
                @click="openEditDialog(key)"
              >
                Edit
              </button>
              <button
                class="inline-flex items-center text-white border border-red-600 bg-red-500 text-xs font-semibold rounded px-2 py-1 hover:bg-red-600"
                @click="openDeleteDialog(key.accessKey)"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="py-3 text-sm text-muted">
      {{ accessKeys.length ? "No matching RustFS access keys found." : "No RustFS access keys found." }}
    </div>

    <div v-if="showDeleteDialog && deleteTargetAccessKey" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div class="bg-accent rounded-lg shadow-lg max-w-md w-full mx-4">
        <div class="px-5 py-4 border-b border-default">
          <h3 class="text-base font-semibold">
            Delete access key "{{ deleteTargetAccessKey }}"
          </h3>
        </div>

        <div class="px-5 py-4 space-y-3 text-sm">
          <p>Are you sure you want to delete this RustFS access key?</p>
          <p class="text-xs text-red-600">This action cannot be undone.</p>
        </div>

        <div class="px-5 py-3 border-t border-default flex justify-end gap-2">
          <button class="px-3 py-1.5 text-xs rounded btn-secondary font-semibold" @click="closeDeleteDialog" :disabled="deleteLoading">
            Cancel
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded border border-red-600 bg-red-500 text-default hover:bg-red-600 disabled:opacity-60 font-semibold"
            @click="confirmDelete"
            :disabled="deleteLoading"
          >
            {{ deleteLoading ? "Deleting..." : "Delete" }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showCreateDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div class="bg-accent rounded-lg shadow-lg max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div class="px-5 py-4 border-b border-default flex items-center justify-between">
          <h3 class="text-base font-semibold">{{ dialogMode === "edit" ? "Edit Key" : "Create Key" }}</h3>
          <button class="text-xs font-semibold px-2 py-1 rounded btn-secondary" @click="closeCreateDialog" :disabled="createLoading">
            Close
          </button>
        </div>

        <div class="px-5 py-4 text-sm overflow-y-auto max-h-[75vh]">
          <div v-if="createError" class="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {{ createError }}
          </div>

          <div class="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold mb-1">Access Key</label>
                <input
                  v-model.trim="createForm.accessKey"
                  type="text"
                  :disabled="dialogMode === 'edit'"
                  required
                  class="w-full border border-default bg-default rounded px-2 py-1 text-xs font-mono disabled:opacity-70"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold mb-1">Secret Key</label>
                <input
                  v-model="createForm.secretKey"
                  type="text"
                  required
                  class="w-full border border-default bg-default rounded px-2 py-1 text-xs font-mono"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold mb-1">Expiry(empty is indicates permanent validity)</label>
                <input v-model="createForm.expirationLocal" type="datetime-local" class="w-full border border-default bg-default rounded px-2 py-1 text-xs" />
              </div>

              <div>
                <label class="block text-xs font-semibold mb-1">Name</label>
                <input
                  v-model.trim="createForm.name"
                  type="text"
                  required
                  class="w-full border border-default bg-default rounded px-2 py-1 text-xs"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold mb-1">Description</label>
                <textarea v-model.trim="createForm.description" rows="3" class="w-full border border-default bg-default rounded px-2 py-1 text-xs"></textarea>
              </div>

              <div v-if="dialogMode === 'create'" class="rounded border border-default bg-default px-3 py-3">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-sm font-semibold">Use main account policy</div>
                    <div class="text-xs text-muted mt-1">Automatically inherit the main account policy when enabled.</div>
                  </div>
                  <input type="checkbox" v-model="createForm.useMainPolicy" />
                </div>
              </div>

              <div v-if="dialogMode === 'edit'" class="rounded border border-default bg-default px-3 py-3">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-sm font-semibold">Status</div>
                    <div class="text-xs text-muted mt-1">Enable or disable this key.</div>
                  </div>
                  <label class="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" v-model="createForm.statusEnabled" />
                    <span>{{ createForm.statusEnabled ? "Enabled" : "Disabled" }}</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-semibold">
                Policy
              </label>

              <textarea
                v-if="dialogMode === 'edit' || !createForm.useMainPolicy"
                v-model.trim="createForm.policyText"
                rows="18"
                class="w-full min-h-[28rem] border border-default bg-default rounded px-2 py-1 text-xs font-mono"
                placeholder='{"Version":"2012-10-17","Statement":[...]}'
              ></textarea>

              <div
                v-else
                class="w-full min-h-[28rem] border border-default bg-default rounded px-3 py-3 text-xs text-muted"
              >
                Main account policy will be inherited.
              </div>
            </div>
          </div>
        </div>

        <div class="px-5 py-3 border-t border-default flex justify-end gap-2">
          <button class="px-3 py-1.5 text-xs font-semibold rounded btn-secondary" @click="closeCreateDialog" :disabled="createLoading">
            Cancel
          </button>
          <button class="px-3 py-1.5 text-xs font-semibold rounded border border-green-700 bg-green-700 text-white disabled:opacity-60" @click="submitCreate" :disabled="createLoading">
            {{ createLoading ? (dialogMode === "edit" ? "Saving..." : "Creating...") : "Submit" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import { ArrowPathIcon } from "@heroicons/vue/20/solid";
import { formatIsoLocal } from "@/tabs/s3Management/bucketBackends/bucketUtils";
import {
  createRustfsServiceAccount,
  deleteRustfsServiceAccount,
  getRustfsServiceAccountInfo,
  listRustfsServiceAccounts,
  updateRustfsServiceAccount,
} from "../../../api/rustfsCliAdapter";
import type { S3ServiceAccount } from "@/tabs/s3Management/types/types";
import { Notification, pushNotification } from "@45drives/houston-common-ui";

const accessKeys = ref<S3ServiceAccount[]>([]);
const searchQuery = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const filteredAccessKeys = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return accessKeys.value;
  return accessKeys.value.filter((k) => {
    const haystack = [
      k.accessKey,
      k.name,
      k.description,
      k.status,
      k.expiresAt ? formatIsoLocal(k.expiresAt) : "no expiry",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
});

const showCreateDialog = ref(false);
const createLoading = ref(false);
const createError = ref<string | null>(null);
const showDeleteDialog = ref(false);
const deleteTargetAccessKey = ref<string | null>(null);
const deleteLoading = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const createForm = ref({
  accessKey: "",
  secretKey: "",
  expirationLocal: "",
  name: "",
  description: "",
  useMainPolicy: true,
  policyText: "",
  statusEnabled: true,
});

function randomAlphaNum(len: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function resetCreateForm() {
  createForm.value = {
    accessKey: randomAlphaNum(20),
    secretKey: randomAlphaNum(40),
    expirationLocal: "",
    name: "",
    description: "",
    useMainPolicy: true,
    policyText: "",
    statusEnabled: true,
  };
}

async function loadAccessKeys() {
  loading.value = true;
  error.value = null;
  try {
    accessKeys.value = await listRustfsServiceAccounts();
  } catch (e: any) {
    error.value = e?.message || "Failed to load RustFS access keys.";
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  dialogMode.value = "create";
  createError.value = null;
  resetCreateForm();
  showCreateDialog.value = true;
}

async function openEditDialog(sa: S3ServiceAccount) {
  dialogMode.value = "edit";
  createError.value = null;
  createLoading.value = true;
  showCreateDialog.value = true;
  try {
    const info = await getRustfsServiceAccountInfo(sa.accessKey);
    createForm.value = {
      accessKey: sa.accessKey,
      secretKey: "",
      expirationLocal: info.expiration ? toLocalInputValue(info.expiration) : "",
      name: info.name ?? "",
      description: info.description ?? "",
      useMainPolicy: info.impliedPolicy !== false,
      policyText: info.policy ?? "",
      statusEnabled: info.accountStatus !== "off",
    };
  } catch (e: any) {
    createError.value = e?.message || "Failed to load key details.";
  } finally {
    createLoading.value = false;
  }
}

function closeCreateDialog() {
  showCreateDialog.value = false;
  createError.value = null;
}

function toLocalInputValue(value: string): string {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function toIsoOrDefault(localValue: string): string {
  const trimmed = String(localValue ?? "").trim();
  if (!trimmed) return "9999-01-01T00:00:00.000Z";
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return "9999-01-01T00:00:00.000Z";
  return dt.toISOString();
}

async function submitCreate() {
  createError.value = null;
  const accessKey = createForm.value.accessKey.trim();
  const secretKey = createForm.value.secretKey.trim();
  if (!accessKey) {
    createError.value = "Access key is required.";
    return;
  }
  if (!secretKey) {
    createError.value = "Secret key is required.";
    return;
  }
  if (!createForm.value.name.trim()) {
    createError.value = "Name is required.";
    return;
  }

  let policyPayload: unknown = null;
  if (dialogMode.value === "edit" || !createForm.value.useMainPolicy) {
    const raw = createForm.value.policyText.trim();
    if (!raw) {
      createError.value = "Policy is required.";
      return;
    }
    try {
      policyPayload = JSON.parse(raw);
    } catch {
      createError.value = "Policy must be valid JSON.";
      return;
    }
  }

  createLoading.value = true;
  try {
    if (dialogMode.value === "create") {
      await createRustfsServiceAccount({
        accessKey,
        secretKey,
        name: createForm.value.name.trim() || undefined,
        description: createForm.value.description.trim() || undefined,
        expiration: toIsoOrDefault(createForm.value.expirationLocal),
        policy: createForm.value.useMainPolicy ? null : policyPayload,
      });
    } else {
      await updateRustfsServiceAccount({
        accessKey,
        newName: createForm.value.name.trim(),
        newDescription: createForm.value.description,
        newExpiration: toIsoOrDefault(createForm.value.expirationLocal),
        newPolicy: JSON.stringify(policyPayload),
        newStatus: createForm.value.statusEnabled ? "on" : "off",
      });
    }
    closeCreateDialog();
    await loadAccessKeys();
    pushNotification(
      new Notification(
        dialogMode.value === "edit" ? "Access key updated successfully" : "Access key created successfully",
        "success"
      )
    );
  } catch (e: any) {
    createError.value = e?.message || `Failed to ${dialogMode.value === "edit" ? "update" : "create"} access key.`;
  } finally {
    createLoading.value = false;
  }
}

function openDeleteDialog(accessKey: string) {
  deleteTargetAccessKey.value = accessKey;
  showDeleteDialog.value = true;
}

function closeDeleteDialog() {
  showDeleteDialog.value = false;
  deleteTargetAccessKey.value = null;
}

async function confirmDelete() {
  if (!deleteTargetAccessKey.value) return;
  deleteLoading.value = true;
  try {
    await deleteRustfsServiceAccount(deleteTargetAccessKey.value);
    await loadAccessKeys();
    closeDeleteDialog();
    pushNotification(new Notification("Success","Access key deleted successfully", "success"));
  } catch (e: any) {
    pushNotification(new Notification("Failed to delete access key", e?.message ?? "Unknown error", "error"));
  } finally {
    deleteLoading.value = false;
  }
}

onMounted(() => {
  void loadAccessKeys();
});
</script>
