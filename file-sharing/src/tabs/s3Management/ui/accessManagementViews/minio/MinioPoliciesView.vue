<!-- MinioPoliciesView.vue -->
<template>
    <section class="bg-default rounded-lg border border-default px-5 py-4 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h2 class="text-lg font-semibold">Policies</h2>
          <p class="text-xs text-gray-500">
            Manage MinIO policies that can be attached to users and groups.
          </p>
        </div>
  
        <button
          class="inline-flex items-center border border-default bg-primary text-white text-xs font-medium rounded px-3 py-1.5 hover:bg-default disabled:opacity-60"
          @click="openCreateDialog"
          :disabled="loading"
        >
          Create policy
        </button>
      </div>
  
      <div
        v-if="error"
        class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ error }}
      </div>
  
      <div v-if="loading" class="py-3 text-sm text-gray-600">
        Loading policies...
      </div>
  
      <div v-else-if="policies.length" class="overflow-x-auto">
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
            <tr v-for="p in policies" :key="p">
              <td class="px-3 py-2 border-b border-default">
                <span class="font-mono text-xs">{{ p }}</span>
              </td>
              <td class="px-3 py-2 border-b border-default whitespace-nowrap">
                <button
                  class="inline-flex items-center border border-default text-xs font-medium bg-primary rounded px-2 py-1 mr-1"
                  @click="onViewEditPolicy(p)"
                >
                  View
                </button>
                <button
                  class="inline-flex items-center border border-red-600 bg-red-500 text-white text-xs font-medium rounded px-2 py-1 hover:bg-red-600 disabled:opacity-60"
                  @click="onDeletePolicy(p)"
                  :disabled="loading"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
  
      <div v-else class="py-3 text-sm text-gray-500">
        No policies found.
      </div>
  
      <MinioPolicyCreateModal
        v-model="showCreateDialog"
        :loading="loading"
        :error-message="createDialogError"
        @submit="handlePolicyCreate"
      />
  
      <MinioPolicyViewEditModal
        v-model="showViewEditDialog"
        :policy-name="selectedPolicyName"
        :policy-json="selectedPolicyJson"
        :loading="viewEditLoading"
        :error-message="viewEditError"
        @save="handlePolicySave"
      />
  
      <div
        v-if="showDeleteDialog && deleteTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
      >
        <div class="bg-accent rounded-lg shadow-lg max-w-md w-full mx-4">
          <div class="px-5 py-4 border-b border-default">
            <h3 class="text-base font-semibold">
              Delete policy "{{ deleteTarget }}"
            </h3>
          </div>
  
          <div class="px-5 py-4 space-y-3 text-sm">
            <p>
              Are you sure you want to delete this MinIO policy?
            </p>
            <p class="text-xs text-red-600">
              Any users or groups attached to this policy will lose its permissions.
            </p>
          </div>
  
          <div class="px-5 py-3 border-t border-default flex justify-end space-x-2">
            <button
              class="px-3 py-1.5 text-xs rounded border border-default bg-secondary hover:bg-gray-100"
              @click="closeDeleteDialog"
              :disabled="loading"
            >
              Cancel
            </button>
            <button
              class="px-3 py-1.5 text-xs rounded border border-red-600 bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
              @click="confirmDeletePolicy"
              :disabled="loading"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </section>
</template>
  
  <script lang="ts" setup>
  import { ref, onMounted } from "vue";
  import {
    listMinioPolicies,
    getMinioPolicy,
    createOrUpdateMinioPolicy,
    deleteMinioPolicy,
  } from "../../../api/minioCliAdapter";
  import MinioPolicyCreateModal from "./MinioPolicyCreateModal.vue";
  import MinioPolicyViewEditModal from "./MinioPolicyViewEditModal.vue";
  
  const policies = ref<string[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  
  // Create dialog
  const showCreateDialog = ref(false);
  const createDialogError = ref<string | null>(null);
  
  // View/Edit dialog
  const showViewEditDialog = ref(false);
  const viewEditError = ref<string | null>(null);
  const viewEditLoading = ref(false);
  const selectedPolicyName = ref<string | null>(null);
  const selectedPolicyJson = ref<string | null>(null);
  
  // Delete confirm
  const showDeleteDialog = ref(false);
  const deleteTarget = ref<string | null>(null);
  
  async function loadPolicies() {
    loading.value = true;
    error.value = null;
    try {
      policies.value = await listMinioPolicies();
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
      await createOrUpdateMinioPolicy(payload.name, payload.json);
      await loadPolicies();
      showCreateDialog.value = false;
    } catch (e: any) {
      createDialogError.value = e?.message || "Failed to create MinIO policy.";
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
      selectedPolicyJson.value = await getMinioPolicy(name);
    } catch (e: any) {
      viewEditError.value = e?.message || `Failed to load policy "${name}".`;
    } finally {
      viewEditLoading.value = false;
    }
  }
  
  async function handlePolicySave(payload: { name: string; json: string }) {
    viewEditError.value = null;
    try {
      viewEditLoading.value = true;
      await createOrUpdateMinioPolicy(payload.name, payload.json); // or updateMinioPolicy
      await loadPolicies();
      showViewEditDialog.value = false;
    } catch (e: any) {
      viewEditError.value = e?.message || "Failed to update MinIO policy.";
    } finally {
      viewEditLoading.value = false;
    }
  }
  
  function onDeletePolicy(name: string) {
    deleteTarget.value = name;
    showDeleteDialog.value = true;
  }
  
  function closeDeleteDialog() {
    showDeleteDialog.value = false;
    deleteTarget.value = null;
  }
  
  async function confirmDeletePolicy() {
    if (!deleteTarget.value) return;
  
    const name = deleteTarget.value;
    try {
      loading.value = true;
      error.value = null;
      await deleteMinioPolicy(name);
      await loadPolicies();
      closeDeleteDialog();
    } catch (e: any) {
      error.value = e?.message || `Failed to delete policy "${name}".`;
    } finally {
      loading.value = false;
    }
  }
  
  onMounted(() => {
    loadPolicies();
  });
  </script>
  