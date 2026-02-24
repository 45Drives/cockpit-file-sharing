<!-- MinioGroupsView.vue -->
<template>
  <section class="bg-default rounded-lg border border-default px-5 py-4 shadow-sm">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h2 class="text-lg font-semibold">Groups</h2>
        <p class="text-xs text-muted">
          Manage {{ isRustfsBackend ? "RustFS" : "MinIO" }} groups that can hold multiple users and shared policies.
        </p>
      </div>

      <button
        class="inline-flex items-center btn-primary text-default text-xs font-medium rounded px-3 py-1.5 hover:bg-default disabled:opacity-60"
        @click="openCreateDialog" :disabled="loading || (!isRustfsBackend && !usernames.length)">
        Create group
      </button>
    </div>

    <div v-if="error" class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div v-if="loading" class="py-3 text-sm text-gray-600">
      Loading groups...
    </div>

    <div v-else-if="groups.length" class="overflow-x-auto">
      <table class="min-w-full border-collapse text-sm">
        <thead>
          <tr class="text-center">
            <th class="px-3 py-2 border-b border-default font-semibold whitespace-nowrap">
              Group
            </th>
            <th class="px-3 py-2 border-b border-default  font-semibold whitespace-nowrap">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in groups" :key="g" class="text-center">
            <td class="px-3 py-2 border-b border-default">
              <span class="font-mono text-xs">{{ g }}</span>
            </td>
            <td class="px-3 py-2 border-b border-default whitespace-nowrap">
              <button
                class="inline-flex items-center btn-secondary text-xs font-medium rounded px-2 py-1 mr-1"
                @click="onViewGroup(g)">
                View
              </button>
              <button
                class="inline-flex items-center btn-primary text-xs font-medium rounded px-2 py-1 mr-1"
                @click="onEditGroup(g)">
                Edit
              </button> <button
                class="inline-flex items-center text-white border border-red-600 bg-red-500 text-default text-xs font-medium rounded px-2 py-1 hover:bg-red-600 disabled:opacity-60"
                @click="onDeleteGroup(g)" :disabled="loading">
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="py-3 text-sm text-muted">
      No groups found.
    </div>

    <!-- Create group modal -->
    <MinioGroupCreateModal v-model="showCreateDialog" :loading="loading" :error-message="createDialogError"
      :available-users="usernames" :require-member="!isRustfsBackend" :backend-label="isRustfsBackend ? 'RustFS' : 'MinIO'"
      @submit="handleGroupCreate" />
    <MinioGroupModal v-model="showGroupDialog" :group="selectedGroup" :loading="groupDialogLoading"
      :error-message="groupDialogError" :available-users="usernames" :available-policies="availablePolicies"
      :mode="groupDialogMode" @submit="handleGroupUpdate" @switch-mode="groupDialogMode = $event" />
    <!-- Delete confirm dialog -->
    <div v-if="showDeleteDialog && deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div class="bg-accent rounded-lg shadow-lg max-w-md w-full mx-4">
        <div class="px-5 py-4 border-b border-default">
          <h3 class="text-base font-semibold">
            Delete group "{{ deleteTarget }}"
          </h3>
        </div>

        <div class="px-5 py-4 space-y-3 text-sm">
          <p>
            Are you sure you want to delete this {{ isRustfsBackend ? "RustFS" : "MinIO" }} group?
          </p>
          <p v-if="!isRustfsBackend" class="text-xs text-red-600">
            All users will be removed from this group. This action cannot be undone.
          </p>
          <p v-else-if="deleteTargetMemberCount > 0" class="text-xs text-red-600">
            This group has {{ deleteTargetMemberCount }} member(s). Continue to remove all members and delete the group?
          </p>
          <p v-else class="text-xs text-red-600">
            This action cannot be undone.
          </p>
        </div>

        <div class="px-5 py-3 border-t border-default flex justify-end space-x-2">
          <button class="px-3 py-1.5 text-xs rounded btn-secondary hover:bg-gray-100"
            @click="closeDeleteDialog" :disabled="loading">
            Cancel
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded border border-red-600 bg-red-500 text-default hover:bg-red-600 disabled:opacity-60"
            @click="confirmDeleteGroup" :disabled="loading">
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
import {
  createRustfsGroup,
  listRustfsGroups,
  getRustfsGroupInfo,
  listRustfsPolicies,
  listRustfsUsers,
  deleteRustfsGroup,
  updateRustfsGroup,
} from "../../../api/rustfsCliAdapter";
import MinioGroupCreateModal from "./MinioGroupCreateModal.vue";
import type { MinioUser, MinioGroupInfo } from "@/tabs/s3Management/types/types";
import MinioGroupModal from "./MinioGroupModal.vue";
import { pushNotification, Notification } from "@45drives/houston-common-ui";

const props = defineProps<{
  backendLabel?: string;
}>();
const isRustfsBackend = (props.backendLabel?.trim() || "").toLowerCase() === "rustfs";

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
const deleteTargetMemberCount = ref<number>(0);

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
    groups.value = isRustfsBackend
      ? await listRustfsGroups()
      : await listMinioGroups();
  } catch (e: any) {
    pushNotification(new Notification(
      isRustfsBackend ? `Failed to load RustFS groups` : `Failed to load MinIO groups`,
      e?.message,
      "error"
    ));

    // error.value = e?.message || "Failed to load MinIO groups.";
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  try {
    users.value = isRustfsBackend
      ? await listRustfsUsers()
      : await listMinioUsers();
  } catch (e) {
    pushNotification(new Notification(`Failed to load MinIO users for group creation`, e as any, "error"));
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
    if (isRustfsBackend) {
      await createRustfsGroup(payload.name, payload.members);
    } else {
      await createMinioGroup(payload.name, payload.members);
    }
    showCreateDialog.value = false;
    try {
      await loadGroups();
    } catch {
      // Keep dialog closed when create succeeded; reload failure is non-fatal here.
    }
    pushNotification(new Notification(
      "Success",
      `${isRustfsBackend ? "RustFS" : "MinIO"} group "${payload.name}" created`,
      "success",
      2000
    ));

  } catch (e: any) {
    pushNotification(new Notification(
      `Failed to create ${isRustfsBackend ? "RustFS" : "MinIO"} group`,
      e?.message,
      "error"
    ));

    // createDialogError.value = e?.message || "Failed to create MinIO group.";
  } finally {
    loading.value = false;
  }
}
async function handleGroupUpdate(payload: { name: string; members: string[]; policies: string[] }) {
  groupDialogError.value = null;
  try {
    groupDialogLoading.value = true;
    if (isRustfsBackend) {
      await updateRustfsGroup(payload.name, payload.members, payload.policies);
    } else {
      await updateMinioGroup(payload.name, payload.members, payload.policies);
    }
    showGroupDialog.value = false;
    selectedGroup.value = null;
    try {
      await loadGroups();
    } catch {
      // Keep dialog closed when update succeeded; reload failure is non-fatal here.
    }
  } catch (e: any) {
    pushNotification(new Notification(`Failed to update MinIO group"`, e?.message, "error"));

    // groupDialogError.value = e?.message || "Failed to update MinIO group.";
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
    selectedGroup.value = isRustfsBackend
      ? await getRustfsGroupInfo(name)
      : await getMinioGroupInfo(name);
  } catch (e: any) {
    pushNotification(new Notification(`Failed to load group details"`, e?.message, "error"));

    // groupDialogError.value = e?.message || "Failed to load group details.";
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
async function onDeleteGroup(name: string) {
  deleteTarget.value = name;
  if (isRustfsBackend) {
    try {
      const info = await getRustfsGroupInfo(name);
      deleteTargetMemberCount.value = info.members?.length ?? 0;
    } catch {
      deleteTargetMemberCount.value = 0;
    }
  } else {
    deleteTargetMemberCount.value = 0;
  }
  showDeleteDialog.value = true;
}

function closeDeleteDialog() {
  showDeleteDialog.value = false;
  deleteTarget.value = null;
  deleteTargetMemberCount.value = 0;
}

async function confirmDeleteGroup() {
  if (!deleteTarget.value) return;

  const name = deleteTarget.value;
  try {
    loading.value = true;
    error.value = null;
    if (isRustfsBackend) {
      await deleteRustfsGroup(name, { removeMembersFirst: true });
    } else {
      await deleteMinioGroup(name);
    }
    await loadGroups();
    closeDeleteDialog();
    pushNotification(new Notification("Success", `Deleted MinIo group "${name}"`, "success", 2000));
  } catch (e: any) {
    pushNotification(new Notification(`Failed to delete MinIo group "{$name}"`, e?.message, "error"));

    // error.value = e?.message || "Failed to delete MinIO group.";
  } finally {
    loading.value = false;
  }
}

async function loadPolicies() {
  try {
    availablePolicies.value = isRustfsBackend
      ? await listRustfsPolicies()
      : await listMinioPolicies();
  } catch (e: any) {
    pushNotification(new Notification(`Failed to load MinIO policies for groups"`, e?.message, "error"));

  }
}
onMounted(() => {
  loadGroups();
  loadUsers();
  loadPolicies();
});
</script>
