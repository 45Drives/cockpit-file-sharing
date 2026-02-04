<template>
  <div class="space-y-4 sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
    <div
      class="grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-well rounded-md shadow text-default my-2 ring-1 ring-black ring-opacity-5 p-4 m-4">
      <!-- Left -->
      <div>
        <button type="button"
          class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-default shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
          @click="emit('backToViewSelection')">
          <ArrowUturnLeftIcon class="size-icon" />
          Back
        </button>
      </div>

      <!-- Center -->
      <div class="justify-self-center">
        <h1 class="text-2xl font-semibold text-default">Ceph RGW Users</h1>
      </div>

      <!-- Right -->
      <div class="justify-self-end">
        <button
          class="inline-flex items-center btn-primary text-default text-xs font-medium rounded px-3 py-1.5 hover:bg-primary disabled:opacity-60 disabled:cursor-default"
          @click="openCreateDialog" :disabled="loading">
          Create user
        </button>
      </div>
    </div>
    <div class="px-6 py-6 mx-auto box-border">

      <section class="bg-default rounded-lg border border-default px-5 py-4 shadow-sm">
        <div class="mb-3 grid grid-cols-3 items-center">
          <div></div>
          <div></div>
          <div class="justify-self-end flex items-center gap-2">
            <button
              class="inline-flex items-center border bg-primary  text-default text-xs font-medium rounded px-3 py-1.5 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-default"
              @click="refresh" :disabled="loading" aria-label="Refresh" title="Refresh">
              <ArrowPathIcon class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div v-if="error" class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ error }}
        </div>

        <div v-if="loading" class="py-3 text-sm">Loading users...</div>

        <div v-else-if="users.length" class="overflow-x-auto">
          <table class="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">Username</th>
                <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">Tenant</th>
                <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">Full name</th>
                <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">Email address
                </th>
                <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">Suspended</th>
                <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">Max. buckets
                </th>
                <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">Capacity Used %
                </th>
                <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">Object Used %
                </th>
                <th class="px-3 py-2 border-b border-default text-left font-semibold whitespace-nowrap">Actions</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="user in users" :key="user.uid">
                <td class="px-3 py-2 border-b border-default">{{ user.uid }}</td>
                <td class="px-3 py-2 border-b border-default">{{ user.tenant || "-" }}</td>
                <td class="px-3 py-2 border-b border-default">{{ user.displayName || "-" }}</td>
                <td class="px-3 py-2 border-b border-default">{{ user.email || "-" }}</td>
                <td class="px-3 py-2 border-b border-default">
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="user.suspended ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'">
                    {{ user.suspended ? "Yes" : "No" }}
                  </span>
                </td>
                <td class="px-3 py-2 border-b border-default">{{ user.maxBuckets ?? "-" }}</td>
                <td class="px-3 py-2 border-b border-default">
                  <span class="cursor-help" :title="quotaTooltipBytes(user)">
                    {{ user.quotaUsedSizePercent != null ? user.quotaUsedSizePercent.toFixed(1) + '%' : '-' }}
                  </span>
                </td>

                <td class="px-3 py-2 border-b border-default">
                  <span class="cursor-help" :title="quotaTooltipObjects(user)">
                    {{ user.quotaUsedObjectsPercent != null ? user.quotaUsedObjectsPercent.toFixed(1) + '%' : '-' }}
                  </span>
                </td>
                <td class="px-3 py-2 border-b border-default whitespace-nowrap">
                  <button
                    class="inline-flex items-center border border-default text-xs bg-primary font-medium rounded px-2 py-1 mr-1"
                    @click="openDetails(user)">
                    Details
                  </button>

                  <template v-if="!isProtectedUser(user)">
                    <button
                      class="inline-flex items-center btn-secondary text-xs font-medium rounded px-2 py-1 mr-1"
                      @click="onEdit(user)">
                      Edit
                    </button>

                    <button
                      class="inline-flex items-center border border-red-600 bg-red-500 text-default text-xs font-medium rounded px-2 py-1 hover:bg-red-600"
                      @click="openDeleteDialog(user)">
                      Delete
                    </button>
                  </template>

                  <template v-else>
                    <span class="text-xs text-default">Protected</span>
                  </template>
                </td>

              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="py-3 text-sm">No RGW users found.</div>
      </section>

      <!-- Delete user dialog -->
      <div v-if="showDeleteDialog && deleteTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
        <div class="rounded-lg shadow-lg max-w-md w-full mx-4 bg-default border border-default overflow-hidden">
          <div class="px-5 py-4 border-b border-default">
            <h3 class="text-base font-semibold">Delete user "{{ deleteTarget.uid }}"</h3>
          </div>

          <div class="px-5 py-4 space-y-3 text-sm">
            <p>Are you sure you want to delete this user?</p>

            <label class="flex items-start space-x-2">
              <input type="checkbox" v-model="purgeData" class="mt-0.5 h-4 w-4 rounded border-default" />
              <span>
                Delete all buckets and objects owned by this user
                (<span class="font-semibold">--purge-data</span>)
              </span>
            </label>

            <label class="flex items-start space-x-2">
              <input type="checkbox" v-model="purgeKeys" class="mt-0.5 h-4 w-4 rounded border-default" />
              <span>
                Delete this user's access keys
                (<span class="font-semibold">--purge-keys</span>)
              </span>
            </label>

            <p class="text-xs text-red-600" v-if="purgeData">
              Warning: purging data will remove all buckets and objects owned by this user. This cannot be undone.
            </p>
          </div>

          <div class="px-5 py-3 border-t border-default flex justify-end space-x-2">
            <button class="px-3 py-1.5 text-xs rounded border border-default" @click="closeDeleteDialog"
              :disabled="loading">
              Cancel
            </button>
            <button
              class="px-3 py-1.5 text-xs rounded border border-red-600 bg-red-500 text-default hover:bg-red-600 disabled:opacity-60"
              @click="confirmDelete" :disabled="loading">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>

    <RgwUserCreateModal v-model="showUserDialog" :loading="loading" :error-message="userDialogError"
      :mode="userDialogMode" :initial-user="editingUser" @submit="handleUserSubmit" />

    <RgwUserDetailsModal v-model="showDetailsDialog" :loading="detailsLoading" :error-message="detailsError"
      :user="selectedUserDetails" />
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from "vue";
import type { RgwUser, CreateRgwUserOptions, RgwUserDetails } from "@/tabs/s3Management/types/types";
import { listRgwUsers, deleteRgwUser, createRgwUser, updateRgwUser, getRgwUserInfo } from "../../../api/cephCliAdapter";
import RgwUserCreateModal from "./RgwUserCreateModal.vue";
import { ArrowPathIcon, ArrowUturnLeftIcon } from "@heroicons/vue/20/solid";
import { formatBytes } from "@/tabs/s3Management/bucketBackends/bucketUtils";
import RgwUserDetailsModal from "./RgwUserDetailsModal.vue";
import { pushNotification, Notification } from "@45drives/houston-common-ui";

const users = ref<RgwUser[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const showDeleteDialog = ref(false);
const deleteTarget = ref<RgwUser | null>(null);
const purgeData = ref(false);
const purgeKeys = ref(true);

const showUserDialog = ref(false);
const userDialogMode = ref<"create" | "edit">("create");
const editingUser = ref<RgwUser | null>(null);
const userDialogError = ref<string | null>(null);

const showDetailsDialog = ref(false);
const detailsLoading = ref(false);
const detailsError = ref<string | null>(null);
const selectedUserDetails = ref<RgwUserDetails | null>(null);

const props = defineProps<{ showBackButton?: boolean }>();
const emit = defineEmits<{ (e: "backToViewSelection"): void }>();

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

function openDeleteDialog(user: RgwUser) {
  if (isProtectedUser(user)) return;
  deleteTarget.value = user;
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
    pushNotification(new Notification("Success", `User "${user.displayName}"deleted successfuly`, "success", 2000))

  } catch (e: any) {
    pushNotification(new Notification("Failed to delete user", `${e.message}`, "error"));
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
      pushNotification(new Notification("Success", `User "${payload.data.uid}" created`, "success", 2000))


    } else {
      await updateRgwUser(payload.data);
      pushNotification(new Notification("Success", `User "${payload.data.uid}" updated`, "success", 2000))

    }

    await loadUsers();
    showUserDialog.value = false;
  } catch (e: any) {
    pushNotification(new Notification(e.message, "error"));

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
  if (isProtectedUser(user)) return;
  userDialogMode.value = "edit";
  editingUser.value = user;
  userDialogError.value = null;
  showUserDialog.value = true;
}

async function openDetails(user: RgwUser) {
  showDetailsDialog.value = true;
  detailsLoading.value = true;
  detailsError.value = null;

  // start with table data so modal matches table immediately
  selectedUserDetails.value = { ...(user as any), keys: [], caps: [] };

  try {
    const extra = await getRgwUserInfo(user.uid, user.tenant);
    selectedUserDetails.value = { ...(selectedUserDetails.value as any), ...extra };
  } catch (e: any) {
    detailsError.value = e?.message || "Failed to load user details.";
  } finally {
    detailsLoading.value = false;
  }
}


function quotaTooltipBytes(user: RgwUser): string {
  const usedKb = user.quotaUsedSizeKb ?? null;
  const maxKb = user.quotaMaxSizeKb ?? null;
  const remainingKb = user.quotaRemainingSizeKb ?? null;

  const usedBytes = usedKb != null ? usedKb * 1024 : null;
  const maxBytes = maxKb != null ? maxKb * 1024 : null;
  const remainingBytes = remainingKb != null ? remainingKb * 1024 : null;

  const usedLine = `Used: ${usedBytes != null ? formatBytes(usedBytes) : "-"}`;
  const maxLine = `Limit: ${maxBytes != null ? formatBytes(maxBytes) : "Unlimited / not set"}`;
  const availLine =
    remainingBytes != null ? `Available: ${formatBytes(remainingBytes)}` : `Available: ${maxKb != null ? "-" : "Unlimited"}`;

  return `${usedLine}\n${availLine}\n${maxLine}`;
}

function quotaTooltipObjects(user: RgwUser): string {
  const used = user.quotaUsedObjects ?? null;
  const max = user.quotaMaxObjects ?? null;
  const remaining = user.quotaRemainingObjects ?? null;

  const usedLine = `Used: ${used != null ? used : "-"}`;
  const maxLine = `Limit: ${max != null && max > 0 ? max : "Unlimited / not set"}`;
  const availLine =
    remaining != null ? `Available: ${remaining}` : `Available: ${max != null && max > 0 ? "-" : "Unlimited"}`;

  return `${usedLine}\n${availLine}\n${maxLine}`;
}
function isProtectedUser(user: RgwUser): boolean {
  const uid = String(user?.uid ?? "").trim().toLowerCase();
  return uid === "dashboard" || uid === "houstonui" || uid === "ceph-dashboard"  ;
}

onMounted(() => {
  loadUsers();
});
</script>
