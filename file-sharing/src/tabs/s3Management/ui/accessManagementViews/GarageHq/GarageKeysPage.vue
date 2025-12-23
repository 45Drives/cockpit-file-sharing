<template>
  <div class="space-y-4 sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
    <div
      class="grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-well rounded-md shadow text-default my-2 ring-1 ring-black ring-opacity-5 p-4 m-4">
      <!-- Left -->
      <div>
        <button type="button"
          class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
          @click="emit('backToViewSelection')">
          <ArrowUturnLeftIcon class="size-icon" />
          Back
        </button>
      </div>

      <!-- Center -->
      <div class="justify-self-center">
        <h1 class="text-2xl font-semibold text-default">Garage Access Keys</h1>
        <p class="text-xs text-default mt-1">
          Listing all access keys from Garage and their basic information.
        </p>
      </div>

      <!-- Right -->
      <div class="justify-self-end">
      <button type="button"
        class="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-default shadow-sm hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60"
        @click="openCreateModal" :disabled="loading">
        New key
      </button>
      </div>
    </div>
    <!-- Loding -->
    <section v-if="loading" class="rounded-lg border border-default  px-4 py-3 text-sm text-slate-700">
      <p>Loading keys…</p>
    </section>

    <!-- Error -->
    <section v-else-if="error" class="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p>Error: {{ error }}</p>
    </section>

    <!-- Table / empty state -->
    <section v-else>
      <div v-if="keys.length === 0" class="rounded-lg border border-default  px-4 py-3 text-sm text-default">
        <p>No keys found.</p>
      </div>

      <div v-else class="overflow-x-auto rounded-lg border border-default bg-accent shadow-sm">
        <table class="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th class="px-4 py-2 font-semibold text-default border-b border-default whitespace-nowrap">
                Key ID
              </th>
              <th class="px-4 py-2 font-semibold text-default border-b border-default whitespace-nowrap">
                Name
              </th>
              <th class="px-4 py-2 font-semibold text-default border-b border-default whitespace-nowrap">
                Created
              </th>
              <th class="px-4 py-2 font-semibold text-default border-b border-default whitespace-nowrap">
                Expiration
              </th>
              <th class="px-4 py-2 font-semibold text-default border-b border-default whitespace-nowrap">
                Validity
              </th>
              <th class="px-4 py-2 font-semibold text-default border-b border-default whitespace-nowrap">
                Can Create Buckets
              </th>
              <th class="px-4 py-2 font-semibold text-default border-b border-default whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="key in keys" :key="key.id">
              <td class="px-4 py-2 border-b border-default font-mono text-sm text-default">
                <span class="inline-block max-w-xs truncate align-middle" :title="key.id">
                  {{ key.id }}
                </span>
              </td>
              <td class="px-4 py-2 border-b border-default text-default">
                {{ key.name }}
              </td>
              <td class="px-4 py-2 border-b border-default text-default">
                {{ key.created }}
              </td>
              <td class="px-4 py-2 border-b border-default text-default">
                {{ key.expiration }}
              </td>
              <td class="px-4 py-2 border-b border-default text-default">
                {{ key.validity || "—" }}
              </td>
              <td class="px-4 py-2 border-b border-default">
                <span v-if="key.canCreateBuckets === true"
                  class="inline-flex items-center rounded-full border border-emerald-400 bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-700">
                  Yes
                </span>
                <span v-else-if="key.canCreateBuckets === false"
                  class="inline-flex items-center rounded-full border border-rose-400 bg-rose-50 px-2 py-0.5 text-sm font-medium text-rose-700">
                  No
                </span>
                <span v-else
                  class="inline-flex items-center rounded-full border border-sky-400 bg-sky-50 px-2 py-0.5 text-sm font-medium text-sky-700">
                  Unknown
                </span>
              </td>
              <td class="px-4 py-2 border-b border-default">
                <div class="flex items-center gap-2">
                  <button type="button"
                    class="text-sm inline-flex items-center rounded border bg-primary border-default px-2 py-1 font-medium text-default "
                    @click="openEditModal(key)">
                    Edit
                  </button>
                  <button type="button"
                    class="text-sm inline-flex items-center rounded border border-default bg-danger px-2 py-1 font-medium text-default "
                    @click="handleDelete(key)">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <GarageKeyCreateModal :open="showCreateModal" :saving="saving" @close="closeCreateModal"
      @submit="handleCreateSubmit" />


    <GarageKeyEditModal :open="showEditModal" :saving="saving" :key-detail="editingKey" @close="closeEditModal"
      @submit="handleEditSubmit" />
    </div>
    <GarageKeyCreatedModal :open="showCreatedModal" :key-detail="createdKey" @close="closeCreatedModal"
/>

  
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { GarageKeyDetail } from "@/tabs/s3Management/types/types";
import {
  listGarageKeysWithInfo,
  createGarageKey,
  updateGarageKey,
  deleteGarageKey,
} from "../../../api/garageCliAdapter";
import GarageKeyCreateModal from "./GarageKeyCreateModal.vue";
import GarageKeyEditModal from "./GarageKeyEditModal.vue";
import { confirmBeforeAction, wrapActions } from "@45drives/houston-common-ui";
import { ResultAsync } from "neverthrow";
import { ProcessError } from "@45drives/houston-common-lib";
import {  ArrowUturnLeftIcon } from "@heroicons/vue/20/solid";
import { pushNotification,Notification } from "@45drives/houston-common-ui";
import GarageKeyCreatedModal from "./GarageKeyCreatedModal.vue";

const keys = ref<GarageKeyDetail[]>([]);
const loading = ref<boolean>(true);
const error = ref<string | null>(null);
const saving = ref<boolean>(false);

const showCreateModal = ref<boolean>(false);
const showEditModal = ref<boolean>(false);
const editingKey = ref<GarageKeyDetail | null>(null);
const showCreatedModal = ref(false);
// One-time credentials of newly created key
const createdKey = ref<GarageKeyDetail | null>(null);

async function loadKeys(): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    const data = await listGarageKeysWithInfo();
    keys.value = data;
  } catch (e: any) {
    error.value = e?.message || "Failed to load keys.";
  } finally {
    loading.value = false;
  }
}
const emit = defineEmits<{ (e: "backToViewSelection"): void }>();

const deleteKey = (key: GarageKeyDetail): ResultAsync<void, ProcessError> =>
  ResultAsync.fromPromise(
    deleteGarageKey(key.id),
    (err: any) =>
      new ProcessError(
        `Unable to delete Garage key "${key.name}" (ID: ${key.id}): ${err?.message ?? String(err)
        }`
      )
  ).andThen(() =>
    ResultAsync.fromPromise(
      loadKeys(),
      (err: any) =>
        new ProcessError(
          `Key deleted but failed to reload keys: ${err?.message ?? String(err)}`
        )
    )
  );

const actions = wrapActions({ deleteKey });

function handleDelete(key: GarageKeyDetail): void {
  const run = confirmBeforeAction(
    {
      header: "Confirm deletion",
      body: `Delete key "${key.name}" (ID: ${key.id})? This cannot be undone.`,
    },
    () => actions.deleteKey(key)
  );

  run();
}

function openCreateModal(): void {
  // Clear previous credentials so the banner only reflects the last action
  createdKey.value = null;
  showCreateModal.value = true;
}

function closeCreateModal(): void {
  if (saving.value) return;
  showCreateModal.value = false;
}

async function handleCreateSubmit(payload: {
  name: string;  
  canCreateBuckets: boolean;

  expiresIn?: string;
}): Promise<void> {
  const name = payload.name.trim();
  if (!name || saving.value) return;

  saving.value = true;
  error.value = null;

  try {
    const key = await createGarageKey(name,payload.canCreateBuckets, payload.expiresIn);

    createdKey.value = key; // includes secretKey (one-time)
    showCreateModal.value = false;

    showCreatedModal.value = true;

    pushNotification(new Notification("Key created successfully", "success"));
    await loadKeys();
  } catch (e: any) {
    pushNotification(new Notification("Failed to create key", e.message, "error"));
    // error.value = e?.message || "Failed to create key.";
  } finally {
    saving.value = false;
  }
}


function openEditModal(key: GarageKeyDetail): void {
  editingKey.value = key;
  showEditModal.value = true;
}

function closeEditModal(): void {
  if (saving.value) return;
  showEditModal.value = false;
  editingKey.value = null;
}

async function handleEditSubmit(payload: {
  name: string;
  canCreateBuckets: boolean;
}): Promise<void> {
  if (!editingKey.value) return;

  const name = payload.name.trim();
  if (!name) return;

  saving.value = true;
  error.value = null;

  try {
    await updateGarageKey(editingKey.value.id, name, payload.canCreateBuckets);
    showEditModal.value = false;
    editingKey.value = null;
    await loadKeys();
    pushNotification(new Notification( `Updated key "${name}" sucessfully`, "success"));

  } catch (e: any) {    
    pushNotification(new Notification( `Failed to update key`,e.message, "error"));

    // error.value = e?.message || "Failed to update key.";
  } finally {
    saving.value = false;
  }
}
function closeCreatedModal() {
  showCreatedModal.value = false;
  createdKey.value = null; // important: clear secret from memory
}
onMounted(() => {
  loadKeys();
});
</script>