<template>
    <div class="max-w-5xl mx-auto px-6 py-6 font-sans">
      <!-- One-time credentials banner -->
      <section
        v-if="createdKey && createdKey.secretKey"
        class="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
      >
        <p class="font-semibold">
          Access key created
        </p>
        <p class="mt-1">
          <span class="font-medium">Key ID:</span>
          <code class="ml-1 break-all">{{ createdKey.id }}</code>
        </p>
        <p class="mt-1">
          <span class="font-medium">Secret key:</span>
          <code class="ml-1 break-all">{{ createdKey.secretKey }}</code>
        </p>
        <p class="mt-1 text-[11px]">
          Copy these credentials now. For security reasons, the secret key cannot be shown again.
        </p>
      </section>
  
      <header class="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold text-default">
            Garage Access Keys
          </h1>
          <p class="mt-1 text-sm text-slate-500">
            Listing all access keys from Garage and their basic information.
          </p>
        </div>
  
        <button
          type="button"
          class="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60"
          @click="openCreateModal"
          :disabled="loading"
        >
          New key
        </button>
      </header>
  
      <!-- Loading -->
      <section
        v-if="loading"
        class="rounded-lg border border-slate-200  px-4 py-3 text-sm text-slate-700"
      >
        <p>Loading keys…</p>
      </section>
  
      <!-- Error -->
      <section
        v-else-if="error"
        class="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
      >
        <p>Error: {{ error }}</p>
      </section>
  
      <!-- Table / empty state -->
      <section v-else>
        <div
          v-if="keys.length === 0"
          class="rounded-lg border border-slate-200  px-4 py-3 text-sm text-default"
        >
          <p>No keys found.</p>
        </div>
  
        <div
          v-else
          class="overflow-x-auto rounded-lg border border-slate-200 bg-accent shadow-sm"
        >
          <table class="min-w-full text-left text-sm">
            <thead >
              <tr>
                <th class="px-4 py-2 font-semibold text-default border-b border-slate-200 whitespace-nowrap">
                  Key ID
                </th>
                <th class="px-4 py-2 font-semibold text-default border-b border-slate-200 whitespace-nowrap">
                  Name
                </th>
                <th class="px-4 py-2 font-semibold text-default border-b border-slate-200 whitespace-nowrap">
                  Created
                </th>
                <th class="px-4 py-2 font-semibold text-default border-b border-slate-200 whitespace-nowrap">
                  Expiration
                </th>
                <th class="px-4 py-2 font-semibold text-default border-b border-slate-200 whitespace-nowrap">
                  Validity
                </th>
                <th class="px-4 py-2 font-semibold text-default border-b border-slate-200 whitespace-nowrap">
                  Can Create Buckets
                </th>
                <th class="px-4 py-2 font-semibold text-default border-b border-slate-200 whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="key in keys"
                :key="key.id"
                class=" transition-colors"
              >
                <td class="px-4 py-2 border-b border-slate-100 font-mono text-xs text-slate-800">
                  <span
                    class="inline-block max-w-xs truncate align-middle"
                    :title="key.id"
                  >
                    {{ key.id }}
                  </span>
                </td>
                <td class="px-4 py-2 border-b border-slate-100 text-default">
                  {{ key.name }}
                </td>
                <td class="px-4 py-2 border-b border-slate-100 text-default">
                  {{ key.created }}
                </td>
                <td class="px-4 py-2 border-b border-slate-100 text-default">
                  {{ key.expiration }}
                </td>
                <td class="px-4 py-2 border-b border-slate-100 text-default">
                  {{ key.validity || "—" }}
                </td>
                <td class="px-4 py-2 border-b border-slate-100">
                  <span
                    v-if="key.canCreateBuckets === true"
                    class="inline-flex items-center rounded-full border border-emerald-400 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  >
                    Yes
                  </span>
                  <span
                    v-else-if="key.canCreateBuckets === false"
                    class="inline-flex items-center rounded-full border border-rose-400 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700"
                  >
                    No
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center rounded-full border border-sky-400 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"
                  >
                    Unknown
                  </span>
                </td>
                <td class="px-4 py-2 border-b border-slate-100">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="text-xs inline-flex items-center rounded border border-slate-300 px-2 py-1 font-medium text-slate-700 "
                      @click="openEditModal(key)"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="text-xs inline-flex items-center rounded border border-rose-300 px-2 py-1 font-medium text-rose-700 "
                      @click="handleDelete(key)"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
  
      <GarageKeyCreateModal
        :open="showCreateModal"
        :saving="saving"
        @close="closeCreateModal"
        @submit="handleCreateSubmit"
      />
  
      
      <GarageKeyEditModal
        :open="showEditModal"
        :saving="saving"
        :key-detail="editingKey"
        @close="closeEditModal"
        @submit="handleEditSubmit"
      />
     
    </div>
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
  
  const keys = ref<GarageKeyDetail[]>([]);
  const loading = ref<boolean>(true);
  const error = ref<string | null>(null);
  const saving = ref<boolean>(false);
  
  const showCreateModal = ref<boolean>(false);
  const showEditModal = ref<boolean>(false);
  const editingKey = ref<GarageKeyDetail | null>(null);
  
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
  
  const deleteKey = (key: GarageKeyDetail): ResultAsync<void, ProcessError> =>
    ResultAsync.fromPromise(
      deleteGarageKey(key.id),
      (err: any) =>
        new ProcessError(
          `Unable to delete Garage key "${key.name}" (ID: ${key.id}): ${
            err?.message ?? String(err)
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
      const key = await createGarageKey(name, payload.canCreateBuckets, payload.expiresIn);
  
      createdKey.value = key; // includes id + secretKey (only once, on creation)
      showCreateModal.value = false;
  
      await loadKeys();
    } catch (e: any) {
      error.value = e?.message || "Failed to create key.";
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
    } catch (e: any) {
      error.value = e?.message || "Failed to update key.";
    } finally {
      saving.value = false;
    }
  }
  
  onMounted(() => {
    loadKeys();
  });
  </script>
  