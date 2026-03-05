<!-- MinioPoliciesView.vue -->
<template>
  <section class="bg-default rounded-lg border border-default px-5 py-4 shadow-sm">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h2 class="text-lg font-semibold">Policies</h2>
        <p class="text-xs text-muted">
          Manage {{ isRustfsBackend ? "RustFS" : "MinIO" }} policies that can be attached to users and groups.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <div class="relative">
          <MagnifyingGlassIcon class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-icon text-muted" />
          <input
            v-model.trim="searchQuery"
            type="text"
            placeholder="Search policies"
            style="padding-left: 2rem;"
            class="w-72 rounded-md border border-accent bg-accent pl-8 pr-3 py-2.5 text-sm text-default"
          />
        </div>
        <button
          class="inline-flex items-center gap-1 btn-primary text-default text-xs font-semibold rounded px-3 py-1.5 hover:bg-default disabled:opacity-60"
          @click="openCreateDialog" :disabled="loading">
          <PlusIcon class="size-icon" />
          Create policy
        </button>
      </div>
    </div>

    <div v-if="error" class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div v-if="loading" class="py-3 text-sm text-gray-600">
      Loading policies...
    </div>

    <div v-else-if="filteredPolicies.length" class="overflow-x-auto">
      <table class="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">
              Name
            </th>
            <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in filteredPolicies" :key="p">
            <td class="px-3 py-2 border-b border-default">
              <span class="font-mono text-sm">{{ p }}</span>
            </td>
            <td class="px-3 py-2 border-b border-default whitespace-nowrap">
              <button
                class="inline-flex items-center gap-1 btn-primary rounded px-2 py-1 mr-1 text-sm font-semibold"
                @click="onViewEditPolicy(p)">
                <EyeIcon class="size-icon" />
                View
              </button>
              <button
                class="inline-flex items-center gap-1 text-white border border-red-600 bg-red-500 text-default text-sm font-semibold rounded px-2 py-1 hover:bg-red-600 disabled:opacity-60"
                @click="onDeletePolicy(p)" :disabled="loading">
                <TrashIcon class="size-icon" />
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="py-3 text-sm text-muted">
      {{ policies.length ? "No matching policies found." : "No policies found." }}
    </div>

    <MinioPolicyCreateModal v-model="showCreateDialog" :loading="loading" :error-message="createDialogError"
      :backend-label="isRustfsBackend ? 'RustFS' : 'MinIO'"
      @submit="handlePolicyCreate" />

    <MinioPolicyViewEditModal v-model="showViewEditDialog" :policy-name="selectedPolicyName"
      :policy-json="selectedPolicyJson" :loading="viewEditLoading" :error-message="viewEditError"
      :backend-label="isRustfsBackend ? 'RustFS' : 'MinIO'"
      @save="handlePolicySave" />

  </section>
</template>

<script lang="ts" setup>
import { computed, ref, onMounted } from "vue";
import {
  listMinioPolicies,
  getMinioPolicy,
  createOrUpdateMinioPolicy,
  deleteMinioPolicy,
} from "../../../api/minioCliAdapter";
import {
  createOrUpdateRustfsPolicy,
  deleteRustfsPolicy,
  getRustfsPolicy,
  listRustfsPolicies,
} from "../../../api/rustfsCliAdapter";
import MinioPolicyCreateModal from "./S3PolicyCreateModal.vue";
import MinioPolicyViewEditModal from "./S3PolicyViewEditModal.vue";
import { confirm, pushNotification, Notification } from "@45drives/houston-common-ui";
import { unwrap } from "@45drives/houston-common-lib";
import { MagnifyingGlassIcon, PlusIcon, EyeIcon, TrashIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{
  backendLabel?: string;
}>();
const isRustfsBackend = (props.backendLabel?.trim() || "").toLowerCase() === "rustfs";

const policies = ref<string[]>([]);
const searchQuery = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const filteredPolicies = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return policies.value;
  return policies.value.filter((p) => String(p ?? "").toLowerCase().includes(q));
});

// Create dialog
const showCreateDialog = ref(false);
const createDialogError = ref<string | null>(null);

// View/Edit dialog
const showViewEditDialog = ref(false);
const viewEditError = ref<string | null>(null);
const viewEditLoading = ref(false);
const selectedPolicyName = ref<string | null>(null);
const selectedPolicyJson = ref<string | null>(null);

async function loadPolicies() {
  loading.value = true;
  error.value = null;
  try {
    policies.value = isRustfsBackend
      ? await listRustfsPolicies()
      : await listMinioPolicies();
  } catch (e: any) {
    error.value = e?.message || "Failed to load MinIO policies.";
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  createDialogError.value = null;
  showCreateDialog.value = true;
}

async function handlePolicyCreate(payload: { name: string; json: string }) {
  createDialogError.value = null;
  try {
    loading.value = true;
    if (isRustfsBackend) {
      await createOrUpdateRustfsPolicy(payload.name, payload.json);
    } else {
      await createOrUpdateMinioPolicy(payload.name, payload.json);
    }
    await loadPolicies();
    showCreateDialog.value = false;
    pushNotification(new Notification("Success",`Policy "${payload.name} created successfully"`, "success"));

  } catch (e: any) {
    pushNotification(new Notification(`Failed to create MinIO policy`, e?.message, "error"));

    // createDialogError.value = e?.message || "Failed to create MinIO policy.";
  } finally {
    loading.value = false;
  }
}

async function onViewEditPolicy(name: string) {
  selectedPolicyName.value = name;
  selectedPolicyJson.value = null;
  viewEditError.value = null;
  showViewEditDialog.value = true;
  viewEditLoading.value = true;

  try {
    selectedPolicyJson.value = isRustfsBackend
      ? await getRustfsPolicy(name)
      : await getMinioPolicy(name);
  } catch (e: any) {
    pushNotification(new Notification(`Failed to load policy "${name}"`, e?.message, "error"));

    // viewEditError.value = e?.message || `Failed to load policy "${name}".`;
  } finally {
    viewEditLoading.value = false;
  }
}

async function handlePolicySave(payload: { name: string; json: string }) {
  viewEditError.value = null;
  try {
    viewEditLoading.value = true;
    if (isRustfsBackend) {
      await createOrUpdateRustfsPolicy(payload.name, payload.json);
    } else {
      await createOrUpdateMinioPolicy(payload.name, payload.json); // or updateMinioPolicy
    }
    await loadPolicies();
    showViewEditDialog.value = false;

    pushNotification(new Notification("Success", `Policy updated successfully`, "success", 2000));

  } catch (e: any) {
    pushNotification(new Notification(`Failed to update MinIO policy`, e?.message, "error"));

    // viewEditError.value = e?.message || "Failed to update MinIO policy.";
  } finally {
    viewEditLoading.value = false;
  }
}

async function onDeletePolicy(name: string) {
  const confirmed: boolean = await unwrap(confirm({
    header: `Delete policy "${name}"?`,
    body: isRustfsBackend
      ? "Are you sure you want to delete this RustFS policy?"
      : "Are you sure you want to delete this MinIO policy? Any users or groups attached to this policy will lose its permissions.",
    confirmButtonText: "Delete",
    dangerous: true,
  }));
  if (!confirmed) return;
  try {
    loading.value = true;
    error.value = null;
    if (isRustfsBackend) {
      await deleteRustfsPolicy(name);
    } else {
      await deleteMinioPolicy(name);
    }
    await loadPolicies();
    pushNotification(new Notification("Success", `Policy  "${name}". deleted succesfully`, "success", 2000));

  } catch (e: any) {
    pushNotification(new Notification(`Failed to delete policy "${name}".`, e?.message, "error"));

    // error.value = e?.message || `Failed to delete policy "${name}".`;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadPolicies();
});
</script>
