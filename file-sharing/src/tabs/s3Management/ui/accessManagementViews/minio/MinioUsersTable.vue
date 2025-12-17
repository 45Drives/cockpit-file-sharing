<!-- MinioUsersTable.vue -->
<template>
    <div class="px-6 py-6 mx-auto box-border">  
      <section class="bg-default rounded-lg border border-default px-5 py-4 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">User list</h2>
  
          <div class="flex items-center space-x-2">
            <button
              class="inline-flex items-center border border-default bg-primary text-default text-xs font-medium rounded px-3 py-1.5 hover:bg-green-700 disabled:opacity-60 disabled:cursor-default"
              @click="openCreateDialog"
              :disabled="loading"
            >
              Create user
            </button>
          </div>
        </div>
  
        <div
          v-if="error"
          class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {{ error }}
        </div>
  
        <div v-if="loading" class="py-3 text-sm text-gray-600">
          Loading users...
        </div>
  
        <div v-else-if="users.length" class="overflow-x-auto">
          <table class="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th class="px-3 py-2 border-b border-default text-center font-semibold whitespace-nowrap">
                  Username
                </th>
                <th class="px-3 py-2 border-b border-default text-center font-semibold whitespace-nowrap">
                  Status
                </th>
                <th class="px-3 py-2 border-b border-default text-center font-semibold whitespace-nowrap">
                  Policies
                </th>

                <th class="px-3 py-2 border-b border-default text-center font-semibold whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.username" class="text-center">
                <td class="px-3 py-2 border-b border-default">
                  {{ u.username }}
                </td>
                <td class="px-3 py-2 border-b border-default">
                  <span
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="
                      u.status === 'enabled'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                    "
                  >
                    {{ u.status === "enabled" ? "Enabled" : "Disabled" }}
                  </span>
                </td>
                <td class="px-3 py-2 border-b border-default">
                  <span v-if="u.policies && u.policies.length" class="text-xs">
                    {{ u.policyCount }}
                  </span>
                  <span v-else class="text-xs italic text-muted">
                    None
                  </span>
                </td>
                <td class="px-3 py-2 border-b border-default whitespace-nowrap">
                    <button
    class="inline-flex items-center border border-default bg-primary text-xs text-default font-medium rounded px-2 py-1 mr-1"
    @click="onViewUser(u)"
  >
    View
  </button>
  <button
    class="inline-flex items-center border border-default bg-secondary text-default text-xs font-medium rounded px-2 py-1 mr-1"
    @click="openEditDialog(u)"
  >
    Edit
  </button>

                  <!-- You can add Edit / View later if you want -->
                  <button
                    class="inline-flex items-center border border-red-600 bg-red-500 text-white text-xs font-medium rounded px-2 py-1 hover:bg-red-600 disabled:opacity-60"
                    @click="openDeleteDialog(u)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
  
        <div v-else class="py-3 text-sm text-gray-500">
          No MinIO users found.
        </div>
      </section>
  
      <!-- Delete user dialog -->
      <div
        v-if="showDeleteDialog && deleteTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
      >
        <div class="bg-accent rounded-lg shadow-lg max-w-md w-full mx-4">
          <div class="px-5 py-4 border-b border-default">
            <h3 class="text-base font-semibold">
              Delete user "{{ deleteTarget.username }}"
            </h3>
          </div>
  
          <div class="px-5 py-4 space-y-3 text-sm">
            <p>
              Are you sure you want to delete this MinIO user?
            </p>
            <p class="text-xs text-red-600">
              This will revoke their access to MinIO. This action cannot be undone.
            </p>
          </div>
  
          <div class="px-5 py-3 border-t border-default flex justify-end space-x-2">
            <button
              class="px-3 py-1.5 text-xs rounded border border-default bg-secondary"
              @click="closeDeleteDialog"
              :disabled="loading"
            >
              Cancel
            </button>
            <button
              class="px-3 py-1.5 text-xs rounded border border-red-600 bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
              @click="confirmDelete"
              :disabled="loading"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
  
      <!-- Create MinIO user modal -->
      <MinioUserCreateModal
        v-model="showUserDialog"
        :loading="loading"
        :error-message="userDialogError"
        :available-policies="availablePolicies"
        :available-groups="availableGroups"
        @submit="handleUserSubmit"
      />
      <MinioUserDetailsModal
  v-model="showUserDetailsDialog"
  :user="selectedUserDetails"
  :loading="userDetailsLoading"
  :error-message="userDetailsError"
/>
<MinioUserEditModal
  v-model="showEditDialog"
  :user="editTarget"
  :loading="loading"
  :error-message="editDialogError"
  :available-policies="availablePolicies"
  :available-groups="availableGroups"
  @submit="handleUserUpdate"
/>
    </div>
</template>
  
  <script lang="ts" setup>
  import { ref, onMounted } from "vue";
  import MinioUserCreateModal from "./MinioUserCreateModal.vue";
  import MinioUserDetailsModal from "./MinioUserDetailsModal.vue";
  import MinioUserEditModal from "./MinioUserEditModal.vue";

  // Adjust this import path and function names to match your backend adapter.
  import {
    listMinioUsers,
    deleteMinioUser,
    createMinioUser,
    listMinioPolicies,
    getMinioUserInfo,
    updateMinioUser,
    listMinioGroups,
  } from "../../../api/minioCliAdapter";
import type { MinioUser, MinioUserCreatePayload, MinioUserDetails, MinioUserUpdatePayload, } from "@/tabs/s3Management/types/types";
  

  const users = ref<MinioUser[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  
  // Delete dialog state
  const showDeleteDialog = ref(false);
  const deleteTarget = ref<MinioUser | null>(null);
  
  // Create dialog state
  const showUserDialog = ref(false);
  const userDialogError = ref<string | null>(null);
  
  const availablePolicies = ref<string[]>([]);
const availableGroups = ref<string[]>([]); 
  // details modal state
const showUserDetailsDialog = ref(false);
const userDetailsLoading = ref(false);
const userDetailsError = ref<string | null>(null);
const selectedUserDetails = ref<MinioUserDetails | null>(null);
  // Edit dialog state
const showEditDialog = ref(false);
const editTarget = ref<MinioUserDetails | null>(null);
const editDialogError = ref<string | null>(null);

  async function loadUsers() {
    loading.value = true;
    error.value = null;
    try {
      users.value = await listMinioUsers();
    } catch (e: any) {
      error.value = e?.message || "Failed to load MinIO users.";
    } finally {
      loading.value = false;
    }
  }
  
  async function loadPolicies() {
    try {
      availablePolicies.value = await listMinioPolicies();
    } catch (e) {
      // Non-fatal; just log or ignore
      console.warn("Failed to load MinIO policies", e);
    }
  }
  
  function openCreateDialog() {
    userDialogError.value = null;
    showUserDialog.value = true;
  }
  
  function openDeleteDialog(user: MinioUser) {
    deleteTarget.value = user;
    showDeleteDialog.value = true;
  }
  
  function closeDeleteDialog() {
    showDeleteDialog.value = false;
    deleteTarget.value = null;
  }
  
  async function confirmDelete() {
  if (!deleteTarget.value) return;

  const username = deleteTarget.value.username;

  try {
    loading.value = true;
    error.value = null;

    await deleteMinioUser(username);
  } catch (e: any) {
    const msg = (e?.message || "").toLowerCase();

    // If MinIO says the user doesn't exist, treat it as already deleted.
    if (!msg.includes("the specified user does not exist")) {
      error.value = e?.message || "Failed to delete MinIO user.";
      return;
    }
  } finally {
    loading.value = false;
  }

  // Locally remove the user from the list regardless
  users.value = users.value.filter((u) => u.username !== username);
  closeDeleteDialog();
}
  
  async function handleUserSubmit(payload: MinioUserCreatePayload) {
    userDialogError.value = null;
    try {
      loading.value = true;
      await createMinioUser(payload);
      await loadUsers();
      showUserDialog.value = false;
    } catch (e: any) {
      userDialogError.value = e?.message || "Failed to create MinIO user.";
    } finally {
      loading.value = false;
    }
  }
  
  async function onViewUser(user: MinioUser) {
  userDetailsError.value = null;
  selectedUserDetails.value = null;
  showUserDetailsDialog.value = true;
  userDetailsLoading.value = true;

  try {
    selectedUserDetails.value = await getMinioUserInfo(user.username);
  } catch (e: any) {
    userDetailsError.value = e?.message || "Failed to load user details.";
  } finally {
    userDetailsLoading.value = false;
  }
}

function openEditDialog(user: MinioUser) {
  editDialogError.value = null;
  editTarget.value = null;
  showEditDialog.value = true;
  userDetailsLoading.value = true;

  getMinioUserInfo(user.username)
    .then((details) => {
      editTarget.value = details;
    })
    .catch((e: any) => {
      editDialogError.value = e?.message || "Failed to load user for editing.";
    })
    .finally(() => {
      userDetailsLoading.value = false;
    });
}

async function handleUserUpdate(payload: MinioUserUpdatePayload) {
  editDialogError.value = null;
  try {
    loading.value = true;
    await updateMinioUser(payload);
    await loadUsers();
    showEditDialog.value = false;
  } catch (e: any) {
    editDialogError.value = e?.message || "Failed to update MinIO user.";
  } finally {
    loading.value = false;
  }
}
async function loadGroups() {
  try {
    availableGroups.value = await listMinioGroups();
  } catch (e) {
    console.warn("Failed to load MinIO groups", e);
  }
}



  onMounted(() => {
    loadUsers();
    loadPolicies();
    loadGroups()

  });
  </script>
  