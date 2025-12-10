<template>
    <div class="px-6 py-6 mx-auto box-border">
      <header class="mb-4 flex items-center justify-between">
  <div class="flex items-center gap-2">
    <button
      v-if="showBackButton"
      type="button"
      class="inline-flex items-center border border-gray-300 text-xs font-medium rounded px-2 py-1"
      @click="emit('backToViewSelection')"
    >
      Back
    </button>
    <h1 class="text-2xl font-semibold">
      Ceph RGW Users
    </h1>
  </div>
</header>
  
      <section class="bg-default rounded-lg border border-gray-200 px-5 py-4 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">User List</h2>
          <button
            class="inline-flex items-center border border-blue-600 bg-blue-600 text-white text-xs font-medium rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-default"
            @click="refresh"
            :disabled="loading"
          >
            Refresh
          </button>

          <button
  class="inline-flex items-center border border-green-600 bg-green-600 text-white text-xs font-medium rounded px-3 py-1.5 hover:bg-green-700 disabled:opacity-60 disabled:cursor-default"
  @click="openCreateDialog"
  :disabled="loading"
>
  Create user
</button>
        </div>
  
        <div
          v-if="error"
          class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {{ error }}
        </div>
  
        <div v-if="loading" class="py-3 text-sm ">
          Loading users...
        </div>
  
        <div v-else-if="users.length" class="overflow-x-auto">
          <table class="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th class="px-3 py-2 border-b border-gray-200  text-left font-semibold whitespace-nowrap">
                  Username
                </th>
                <th class="px-3 py-2 border-b border-gray-200  text-left font-semibold whitespace-nowrap">
                  Tenant
                </th>
                <th class="px-3 py-2 border-b border-gray-200  text-left font-semibold whitespace-nowrap">
                  Full name
                </th>
                <th class="px-3 py-2 border-b border-gray-200  text-left font-semibold whitespace-nowrap">
                  Email address
                </th>
                <th class="px-3 py-2 border-b border-gray-200  text-left font-semibold whitespace-nowrap">
                  Suspended
                </th>
                <th class="px-3 py-2 border-b border-gray-200  text-left font-semibold whitespace-nowrap">
                  Max. buckets
                </th>
                <th class="px-3 py-2 border-b border-gray-200  text-left font-semibold whitespace-nowrap">
                  Capacity limit %
                </th>
                <th class="px-3 py-2 border-b border-gray-200  text-left font-semibold whitespace-nowrap">
                  Object limit %
                </th>
                <th class="px-3 py-2 border-b border-gray-200  text-left font-semibold whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.uid" >
                <td class="px-3 py-2 border-b border-gray-200">
                  {{ user.uid }}
                </td>
                <td class="px-3 py-2 border-b border-gray-200">
                  {{ user.tenant || "-" }}
                </td>
                <td class="px-3 py-2 border-b border-gray-200">
                  {{ user.displayName || "-" }}
                </td>
                <td class="px-3 py-2 border-b border-gray-200">
                  {{ user.email || "-" }}
                </td>
                <td class="px-3 py-2 border-b border-gray-200">
                  <span
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="user.suspended
                      ? 'bg-red-50 text-red-700'
                      : 'bg-emerald-50 text-emerald-700'"
                  >
                    {{ user.suspended ? "Yes" : "No" }}
                  </span>
                </td>
                <td class="px-3 py-2 border-b border-gray-200">
                  {{ user.maxBuckets ?? "-" }}
                </td>
                <td class="px-3 py-2 border-b border-gray-200">
                  {{ user.capacityLimitPercent ?? "-" }}
                </td>
                <td class="px-3 py-2 border-b border-gray-200">
                  {{ user.objectLimitPercent ?? "-" }}
                </td>
                <td class="px-3 py-2 border-b border-gray-200 whitespace-nowrap">
                    <button
    class="inline-flex items-center border border-gray-300 text-xs font-medium rounded px-2 py-1 mr-1"
    @click="viewUser(user)"
  >
    View
  </button>

                  <button
                    class="inline-flex items-center border border-gray-300  text-xs font-medium rounded px-2 py-1 mr-1 "
                    @click="onEdit(user)"
                  >
                    Edit
                  </button>
                  <button
                    class="inline-flex items-center border border-red-600 bg-red-500 text-white text-xs font-medium rounded px-2 py-1 hover:bg-red-600"
                    @click="openDeleteDialog(user)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
  
        <div v-else class="py-3 text-sm ">
          No RGW users found.
        </div>
      </section>
  
      <!-- Delete user dialog -->
      <div
        v-if="showDeleteDialog && deleteTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
      >
        <div class=" rounded-lg shadow-lg max-w-md w-full mx-4">
          <div class="px-5 py-4 border-b border-gray-200">
            <h3 class="text-base font-semibold">
              Delete user "{{ deleteTarget.uid }}"
            </h3>
          </div>
  
          <div class="px-5 py-4 space-y-3 text-sm">
            <p>
              Are you sure you want to delete this user?
            </p>
  
            <label class="flex items-start space-x-2">
              <input
                type="checkbox"
                v-model="purgeData"
                class="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span>
                Delete all buckets and objects owned by this user
                (<span class="font-semibold">--purge-data</span>)
              </span>
            </label>
  
            <label class="flex items-start space-x-2">
              <input
                type="checkbox"
                v-model="purgeKeys"
                class="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span>
                Delete this user's access keys
                (<span class="font-semibold">--purge-keys</span>)
              </span>
            </label>
  
            <p class="text-xs text-red-600" v-if="purgeData">
              Warning: purging data will remove all buckets and objects owned by this user. This cannot be undone.
            </p>
          </div>
  
          <div class="px-5 py-3 border-t border-gray-200 flex justify-end space-x-2">
            <button
              class="px-3 py-1.5 text-xs rounded border border-gray-300 "
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
    </div>
    <RgwUserCreateModal
  v-model="showUserDialog"
  :loading="loading"
  :error-message="userDialogError"
  :mode="userDialogMode"
  :initial-user="editingUser"
  @submit="handleUserSubmit"
/>
<RgwUserDetailsModal
  v-model="showDetailsDialog"
  :loading="detailsLoading"
  :error-message="detailsError"
  :user="selectedUserDetails"
/>
</template>
  
  <script lang="ts" setup>
  import { ref, onMounted } from "vue";
  import type { RgwUser, CreateRgwUserOptions, RgwUserDetails } from "@/tabs/s3Management/types/types";
  import { listRgwUsers, deleteRgwUser, createRgwUser, updateRgwUser,getRgwUserInfo } from "../../../api/s3CliAdapter";
  import RgwUserCreateModal from "./RgwUserCreateModal.vue";
  import RgwUserDetailsModal from "./RgwUserDetailsModal.vue";
  const users = ref<RgwUser[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  
  // delete dialog state
  const showDeleteDialog = ref(false);
  const deleteTarget = ref<RgwUser | null>(null);
  const purgeData = ref(false);
  const purgeKeys = ref(true); // default to true, up to you
  

const showUserDialog = ref(false);
const userDialogMode = ref<"create" | "edit">("create");
const editingUser = ref<RgwUser | null>(null);

const userDialogError = ref<string | null>(null);

const showDetailsDialog = ref(false);
const detailsLoading = ref(false);
const detailsError = ref<string | null>(null);
const selectedUserDetails = ref<RgwUserDetails | null>(null);

  const props = defineProps<{
  showBackButton?: boolean;
  }>();
  const emit = defineEmits<{
  (e: "backToViewSelection"): void;
}>();

  async function loadUsers() {
    loading.value = true;
    error.value = null;
    try {
      users.value = await listRgwUsers();
    } catch (e: any) {
      error.value = e?.message || "Failed to load RGW users.";
    } finally {
      loading.value = false;
    }
  }
  
  function refresh() {
    loadUsers();
  }
    
  // open dialog instead of deleting right away
  function openDeleteDialog(user: RgwUser) {
    deleteTarget.value = user;
    // sensible defaults
    purgeData.value = false;
    purgeKeys.value = true;
    showDeleteDialog.value = true;
  }
  
  function closeDeleteDialog() {
    showDeleteDialog.value = false;
    deleteTarget.value = null;
  }
  
  async function confirmDelete() {
    if (!deleteTarget.value) return;
  
    const user = deleteTarget.value;
  
    try {
      loading.value = true;
      error.value = null;
  
      await deleteRgwUser(user.uid, {
        purgeData: purgeData.value,
        purgeKeys: purgeKeys.value,
      });
  
      users.value = users.value.filter((u) => u.uid !== user.uid);
      closeDeleteDialog();
    } catch (e: any) {
      error.value = e?.message || "Failed to delete user.";
    } finally {
      loading.value = false;
    }
  }
  async function handleUserSubmit(payload: { mode: "create" | "edit"; data: CreateRgwUserOptions }) {
  userDialogError.value = null;
  try {
    loading.value = true;

    if (payload.mode === "create") {
      await createRgwUser(payload.data);
    } else {
      await updateRgwUser(payload.data);
    }

    await loadUsers();
    showUserDialog.value = false;
  } catch (e: any) {
    userDialogError.value = e?.message || "Failed to save RGW user.";
  } finally {
    loading.value = false;
  }
}
function openCreateDialog() {
  userDialogMode.value = "create";
  editingUser.value = null;      
  userDialogError.value = null;  
  showUserDialog.value = true;    
}
function onEdit(user: RgwUser) {
  userDialogMode.value = "edit";
  editingUser.value = user;
  userDialogError.value = null;
  showUserDialog.value = true;
}
async function viewUser(user: RgwUser) {
  showDetailsDialog.value = true;
  detailsLoading.value = true;
  detailsError.value = null;
  selectedUserDetails.value = null;

  try {
    selectedUserDetails.value = await getRgwUserInfo(user.uid, user.tenant);
  } catch (e: any) {
    detailsError.value = e?.message || "Failed to load user details.";
  } finally {
    detailsLoading.value = false;
  }
}
  onMounted(() => {
    loadUsers();
  });
  </script>
  