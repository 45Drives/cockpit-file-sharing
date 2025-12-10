<!-- MinioGroupsView.vue -->
<template>
    <section class="bg-default rounded-lg border border-gray-200 px-5 py-4 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h2 class="text-lg font-semibold">Groups</h2>
          <p class="text-xs text-gray-500">
            Manage MinIO groups that can hold multiple users and shared policies.
          </p>
        </div>
  
        <button
          class="inline-flex items-center border border-green-600 bg-green-600 text-white text-xs font-medium rounded px-3 py-1.5 hover:bg-green-700 disabled:opacity-60"
          @click="openCreateDialog"
          :disabled="loading || !usernames.length"
        >
          Create group
        </button>
      </div>
  
      <div
        v-if="error"
        class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ error }}
      </div>
  
      <div v-if="loading" class="py-3 text-sm text-gray-600">
        Loading groups...
      </div>
  
      <div v-else-if="groups.length" class="overflow-x-auto">
        <table class="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th class="px-3 py-2 border-b border-gray-200 text-left font-semibold whitespace-nowrap">
                Group
              </th>
              <th class="px-3 py-2 border-b border-gray-200 text-left font-semibold whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in groups" :key="g">
              <td class="px-3 py-2 border-b border-gray-200">
                <span class="font-mono text-xs">{{ g }}</span>
              </td>
              <td class="px-3 py-2 border-b border-gray-200 whitespace-nowrap">
                <button
    class="inline-flex items-center border border-gray-300 text-xs font-medium rounded px-2 py-1 mr-1"
    @click="onViewGroup(g)"
  >
    View
  </button>
  <button
    class="inline-flex items-center border border-gray-300 text-xs font-medium rounded px-2 py-1 mr-1"
    @click="onEditGroup(g)"
  >
    Edit
  </button>                <button
                  class="inline-flex items-center border border-red-600 bg-red-500 text-white text-xs font-medium rounded px-2 py-1 hover:bg-red-600 disabled:opacity-60"
                  @click="onDeleteGroup(g)"
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
        No groups found.
      </div>
  
      <!-- Create group modal -->
      <MinioGroupCreateModal
        v-model="showCreateDialog"
        :loading="loading"
        :error-message="createDialogError"
        :available-users="usernames"
        @submit="handleGroupCreate"
      />
      <MinioGroupModal
  v-model="showGroupDialog"
  :group="selectedGroup"
  :loading="groupDialogLoading"
  :error-message="groupDialogError"
  :available-users="usernames"
  :available-policies="availablePolicies"
  :mode="groupDialogMode"
  @submit="handleGroupUpdate"
  @switch-mode="groupDialogMode = $event"
/>
      <!-- Delete confirm dialog -->
      <div
        v-if="showDeleteDialog && deleteTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
      >
        <div class="bg-accent rounded-lg shadow-lg max-w-md w-full mx-4">
          <div class="px-5 py-4 border-b border-gray-200">
            <h3 class="text-base font-semibold">
              Delete group "{{ deleteTarget }}"
            </h3>
          </div>
  
          <div class="px-5 py-4 space-y-3 text-sm">
            <p>
              Are you sure you want to delete this MinIO group?
            </p>
            <p class="text-xs text-red-600">
              All users will be removed from this group. This action cannot be undone.
            </p>
          </div>
  
          <div class="px-5 py-3 border-t border-gray-200 flex justify-end space-x-2">
            <button
              class="px-3 py-1.5 text-xs rounded border border-gray-300 bg-secondary hover:bg-gray-100"
              @click="closeDeleteDialog"
              :disabled="loading"
            >
              Cancel
            </button>
            <button
              class="px-3 py-1.5 text-xs rounded border border-red-600 bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
              @click="confirmDeleteGroup"
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
  import { ref, computed, onMounted } from "vue";
  import {
  listMinioGroups,
  createMinioGroup,
  deleteMinioGroup,
  listMinioUsers,
  getMinioGroupInfo,
  updateMinioGroup,
  listMinioPolicies,
} from "../../../api/minioCliAdapter";
  import MinioGroupCreateModal from "./MinioGroupCreateModal.vue";
  import type { MinioUser,MinioGroupInfo } from "@/tabs/s3Management/types/types";
  import MinioGroupModal from "./MinioGroupModal.vue";
  
  const groups = ref<string[]>([]);
  const users = ref<MinioUser[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  
  // Create dialog state
  const showCreateDialog = ref(false);
  const createDialogError = ref<string | null>(null);
  
  // Delete dialog state
  const showDeleteDialog = ref(false);
  const deleteTarget = ref<string | null>(null);
  
  const usernames = computed(() => users.value.map((u) => u.username));

  // Combined view/edit group dialog
const showGroupDialog = ref(false);
const groupDialogLoading = ref(false);
const groupDialogError = ref<string | null>(null);
const selectedGroup = ref<MinioGroupInfo | null>(null);
const groupDialogMode = ref<"view" | "edit">("view");

// Policies for group edit
const availablePolicies = ref<string[]>([]);

  
  async function loadGroups() {
    loading.value = true;
    error.value = null;
    try {
      groups.value = await listMinioGroups();
    } catch (e: any) {
      error.value = e?.message || "Failed to load MinIO groups.";
    } finally {
      loading.value = false;
    }
  }
  
  async function loadUsers() {
    try {
      users.value = await listMinioUsers();
    } catch (e) {
      console.warn("Failed to load MinIO users for group creation", e);
    }
  }
  
  function openCreateDialog() {
    createDialogError.value = null;
    showCreateDialog.value = true;
  }
  
  async function handleGroupCreate(payload: { name: string; members: string[] }) {
    createDialogError.value = null;
    try {
      loading.value = true;
      await createMinioGroup(payload.name, payload.members);
      await loadGroups();
      showCreateDialog.value = false;
    } catch (e: any) {
      createDialogError.value = e?.message || "Failed to create MinIO group.";
    } finally {
      loading.value = false;
    }
  }
  async function handleGroupUpdate(payload: { name: string; members: string[]; policies: string[] }) {
  groupDialogError.value = null;
  try {
    groupDialogLoading.value = true;
    await updateMinioGroup(payload.name, payload.members, payload.policies);
    await loadGroups();
    showGroupDialog.value = false;
  } catch (e: any) {
    groupDialogError.value = e?.message || "Failed to update MinIO group.";
  } finally {
    groupDialogLoading.value = false;
  }
}

  async function openGroupDialog(name: string, mode: "view" | "edit") {
  groupDialogError.value = null;
  selectedGroup.value = null;
  groupDialogMode.value = mode;
  showGroupDialog.value = true;
  groupDialogLoading.value = true;

  try {
    selectedGroup.value = await getMinioGroupInfo(name);
  } catch (e: any) {
    groupDialogError.value = e?.message || "Failed to load group details.";
  } finally {
    groupDialogLoading.value = false;
  }
}

function onViewGroup(name: string) {
  openGroupDialog(name, "view");
}

function onEditGroup(name: string) {
  openGroupDialog(name, "edit");
}
  function onDeleteGroup(name: string) {
    deleteTarget.value = name;
    showDeleteDialog.value = true;
  }
  
  function closeDeleteDialog() {
    showDeleteDialog.value = false;
    deleteTarget.value = null;
  }
  
  async function confirmDeleteGroup() {
    if (!deleteTarget.value) return;
  
    const name = deleteTarget.value;
    try {
      loading.value = true;
      error.value = null;
      await deleteMinioGroup(name);
      await loadGroups();
      closeDeleteDialog();
    } catch (e: any) {
      error.value = e?.message || "Failed to delete MinIO group.";
    } finally {
      loading.value = false;
    }
  }
  
  async function loadPolicies() {
  try {
    availablePolicies.value = await listMinioPolicies();
  } catch (e) {
    console.warn("Failed to load MinIO policies for groups", e);
  }
}
  onMounted(() => {
    loadGroups();
    loadUsers();
    loadPolicies();
  });
  </script>
  