<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div class="bg-accent rounded-lg shadow-lg max-w-5xl w-full mx-4">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-default flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold">
            User details – {{ user?.username || "…" }}
          </h3>
          <p v-if="user?.authentication" class="text-xs text-default mt-0.5">
            Authentication: {{ user.authentication }}
          </p>
        </div>
        <button class="text-xs px-2 py-1 rounded btn-secondary hover:bg-gray-50" @click="close"
          :disabled="loading">
          Close
        </button>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 space-y-4 text-sm max-h-[70vh] overflow-y-auto">
        <div v-if="loading" class="text-gray-600">
          Loading user details…
        </div>

        <div v-else-if="errorMessage" class="text-xs text-red-600">
          {{ errorMessage }}
        </div>

        <div v-else-if="user">
          <!-- Basic info -->
          <section class="space-y-1">
            <h4 class="text-xs font-semibold uppercase text-default mb-2">
              Basic information
            </h4>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div>
                <span class="font-medium">Username:</span>
                <span class="ml-1 font-mono break-all">{{ user.username }}</span>
              </div>
              <div v-if="user.accessKey && user.accessKey !== user.username">
                <span class="font-medium">Access key:</span>
                <span class="ml-1 font-mono break-all">{{ user.accessKey }}</span>
              </div>
              <div>
                <span class="font-medium">Status:</span>
                <span class="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium" :class="user.status === 'enabled'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'">
                  {{ user.status === "enabled" ? "Enabled" : "Disabled" }}
                </span>
              </div>
            </div>
          </section>

          <!-- Direct policies -->
          <section class="space-y-1">
            <h4 class="text-xs font-semibold uppercase text-default">
              Direct policies
            </h4>
            <div v-if="user.policies && user.policies.length" class="flex flex-wrap gap-1 text-xs">
              <span v-for="p in user.policies" :key="p"
                class="inline-flex items-center rounded-full border border-default bg-default px-2 py-0.5">
                {{ p }}
              </span>
            </div>
            <p v-else class="text-xs text-default">
              No direct policies attached.
            </p>
          </section>

          <!-- Group membership -->
          <section class="space-y-1 mt-4">
            <h4 class="text-xs font-semibold uppercase text-default mb-2">
              Group membership
            </h4>
            <div v-if="user.memberOf && user.memberOf.length" class="space-y-2 text-xs">
              <div v-for="group in user.memberOf" :key="group.name"
                class="border border-default rounded px-2 py-2 bg-default">
                <div class="font-semibold">
                  {{ group.name || "(unnamed group)" }}
                </div>
                <div v-if="group.policies && group.policies.length" class="mt-1">
                  <span class="text-sm text-default mb-2">Policies:</span>
                  <div class="mt-0.5 flex flex-wrap gap-1">
                    <span v-for="p in group.policies" :key="group.name + ':' + p"
                      class="inline-flex items-center rounded-full border border-default bg-accent px-2 py-0.5">
                      {{ p }}
                    </span>
                  </div>
                </div>
                <div v-else class="mt-1 text-sm text-default">
                  No policies attached to this group.
                </div>
              </div>
            </div>
            <p v-else class="text-xs text-default">
              User is not a member of any groups.
            </p>
          </section>

          <!-- Service accounts -->
          <section class="space-y-1 mt-4">
            <h4 class="text-xs font-semibold uppercase text-default mb-2">
              Service accounts
            </h4>

            <div v-if="saLoading" class="text-xs text-default">
              Loading service accounts…
            </div>
            <div v-else-if="saError" class="text-xs text-red-600">
              {{ saError }}
            </div>
            <div v-else class="rounded-md border border-default overflow-hidden">
              <table class="w-full text-xs">
                <thead class="bg-accent">
                  <tr class="text-left text-default">
                    <th class="px-3 py-2 font-semibold">Access key</th>
                    <th class="px-3 py-2 font-semibold">Details</th>
                    <th class="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody class="bg-default">
                  <tr v-for="sa in serviceAccounts" :key="sa.accessKey" class="border-t border-default">
                    <td class="px-3 py-2 font-mono break-all text-default">{{ sa.accessKey }}</td>
                    <td class="px-3 py-2 text-muted">
                      <span v-if="sa.name" class="text-default">Name: </span><span class="text-muted">{{ sa.name }}</span>
                      <span v-if="sa.description" class="text-default"> | Description: </span>
                      <span v-if="sa.description"
                        class="text-muted inline-block align-bottom max-w-[220px] truncate" :title="sa.description">
                        {{ sa.description }}
                      </span>
                      <span v-if="sa.expiresAt !== undefined" class="text-default">
                        | Expires: </span><span class="text-muted">{{ sa.expiresAt ? formatIsoLocal(sa.expiresAt) :
                          "No expiry" }}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-default">
                      {{ sa.status || "unknown" }}
                    </td>
                  </tr>
                  <tr v-if="!serviceAccounts.length">
                    <td colspan="3" class="px-3 py-3 text-xs text-default">
                      No service accounts.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div v-else class="text-xs text-default">
          No user selected.
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";
import type { MinioServiceAccount, MinioUserDetails } from "@/tabs/s3Management/types/types";
import { listMinioServiceAccounts } from "@/tabs/s3Management/api/minioCliAdapter";
import { formatIsoLocal } from "@/tabs/s3Management/bucketBackends/bucketUtils";

const props = defineProps<{
  modelValue: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  user: MinioUserDetails | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const serviceAccounts = ref<MinioServiceAccount[]>([]);
const saLoading = ref(false);
const saError = ref<string | null>(null);

async function loadServiceAccounts() {
  if (!props.user?.username) return;
  saLoading.value = true;
  saError.value = null;
  try {
    serviceAccounts.value = await listMinioServiceAccounts(props.user.username);
  } catch (e: any) {
    saError.value = e?.message ?? "Failed to load service accounts";
    serviceAccounts.value = [];
  } finally {
    saLoading.value = false;
  }
}

watch(
  () => [props.modelValue, props.user?.username],
  ([open, username]) => {
    if (!open || !username) {
      serviceAccounts.value = [];
      saError.value = null;
      saLoading.value = false;
      return;
    }
    void loadServiceAccounts();
  },
  { immediate: true }
);

function close() {
  emit("update:modelValue", false);
}
</script>
