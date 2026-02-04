<!-- MinioUserEditModal.vue -->
<template>
  <div v-if="modelValue" class="fixed inset-0 z-50">
    <div class="absolute inset-0 bg-black/40" @click="$emit('update:modelValue', false)"></div>

    <div class="relative z-10 flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-5xl rounded-xl border border-default bg-accent shadow-lg overflow-hidden" role="dialog"
        aria-modal="true">
        <!-- Header (sticky) -->
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-default bg-accent px-6 py-4">
          <div class="min-w-0">
            <h3 class="text-base font-semibold truncate">
              Edit user "{{ user?.username }}"
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              Manage status, access policies/groups, service accounts, and credentials.
            </p>
          </div>

          <button type="button"
            class="inline-flex items-center rounded-md btn-secondary px-3 py-1.5 text-xs text-default hover:opacity-90"
            @click="$emit('update:modelValue', false)" :disabled="loading">
            Close
          </button>
        </div>

        <!-- Body (scrollable area only) -->
        <div class="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-5">
          <div v-if="errorMessage" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {{ errorMessage }}
          </div>

          <div v-if="loading" class="rounded-md border border-default bg-default px-4 py-3 text-sm text-default">
            Updating user...
          </div>

          <div v-else class="space-y-5">
            <!-- Status + identity card -->
            <section class="rounded-lg border border-default bg-default px-4 py-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div class="text-xs text-secondary">Username</div>
                  <div class="mt-1 font-medium text-default">{{ user?.username }}</div>
                </div>

                <div class="flex items-center justify-between sm:justify-end sm:gap-4">
                  <div class="text-xs text-default">Account status</div>
                  <label class="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" v-model="localStatusEnabled" />
                    <span class="text-default">{{ localStatusEnabled ? "Enabled" : "Disabled" }}</span>
                  </label>
                </div>
              </div>
            </section>

            <!-- Access section -->
            <section class="rounded-lg border border-default bg-default">
              <div class="flex items-center justify-between border-b border-default px-4 py-3">
                <div>
                  <div class="text-xs font-semibold uppercase tracking-wide text-default">Access</div>
                  <div class="mt-0.5 text-xs text-muted">
                    Configure policies, groups, and service accounts for this user.
                  </div>
                </div>
              </div>

              <!-- Tabs + New service account button -->
              <div class="px-4 pt-3 flex items-center justify-between gap-3">
                <div class="inline-flex rounded-md border border-default bg-accent p-1 text-xs">
                  <button type="button" class="rounded-md px-3 py-1.5" :class="activeAccessTab === 'policies'
                    ? 'bg-default text-default font-medium'
                    : 'text-muted hover:text-default'" @click="activeAccessTab = 'policies'">
                    Policies
                  </button>

                  <button type="button" class="rounded-md px-3 py-1.5" :class="activeAccessTab === 'groups'
                    ? 'bg-default text-default font-medium'
                    : 'text-muted hover:text-default'" @click="activeAccessTab = 'groups'">
                    Groups
                  </button>

                  <button type="button" class="rounded-md px-3 py-1.5" :class="activeAccessTab === 'serviceAccounts'
                    ? 'bg-default text-default font-medium'
                    : 'text-muted hover:text-default'"
                    @click="activeAccessTab = 'serviceAccounts'; loadServiceAccounts()">
                    Service accounts
                  </button>
                </div>

                <button v-if="activeAccessTab === 'serviceAccounts'" type="button"
                  class="inline-flex items-center justify-center rounded-md btn-primary px-3 py-1.5 text-xs text-default disabled:opacity-60"
                  @click="openCreateServiceAccountModal()" :disabled="loading || !user">
                  New access key
                </button>
              </div>

              <!-- Policies -->
              <div v-if="activeAccessTab === 'policies'" class="px-4 py-4 space-y-3">
                <div class="flex items-center justify-between">
                  <div class="text-sm text-default">Attach MinIO policies</div>
                  <div class="text-xs text-muted">Selected: {{ localPolicies.length }}</div>
                </div>

                <div class="rounded-md border border-default bg-accent">
                  <div class="max-h-56 overflow-y-auto px-3 py-2">
                    <label v-for="p in availablePolicies" :key="p"
                      class="flex items-center gap-2 py-1 text-xs border-b border-default last:border-b-0">
                      <input type="checkbox" :value="p" v-model="localPolicies" />
                      <span class="text-default">{{ p }}</span>
                    </label>

                    <div v-if="!availablePolicies.length" class="py-2 text-xs italic text-secondary">
                      No policies available.
                    </div>
                  </div>
                </div>

                <div class="text-xs text-secondary">
                  Policies control which buckets and actions this user is allowed to access.
                </div>
              </div>

              <!-- Groups -->
              <div v-else-if="activeAccessTab === 'groups'" class="px-4 py-4 space-y-3">
                <div class="flex items-center justify-between">
                  <div class="text-sm text-default">Attach MinIO groups</div>
                  <div class="text-xs text-muted">Selected: {{ localGroups.length }}</div>
                </div>

                <div class="rounded-md border border-default bg-accent">
                  <div class="max-h-56 overflow-y-auto px-3 py-2">
                    <label v-for="g in availableGroups" :key="g" class="flex items-center gap-2 py-1 text-xs">
                      <input type="checkbox" :value="g" v-model="localGroups" />
                      <span class="text-default">{{ g }}</span>
                    </label>

                    <div v-if="!availableGroups.length" class="py-2 text-xs italic text-muted">
                      No groups available.
                    </div>
                  </div>
                </div>

                <div class="text-xs text-muted">
                  Groups help you manage shared access for multiple users at once.
                </div>
              </div>

              <!-- Service accounts -->
              <div v-else class="px-4 py-4 space-y-4">
                <div v-if="saLoading" class="text-xs text-muted">Loading...</div>

                <div v-else class="rounded-md border border-default overflow-hidden">
                  <table class="w-full text-xs">
                    <thead class="bg-accent">
                      <tr class="text-left text-default">
                        <th class="px-3 py-2 font-semibold">Access key</th>
                        <th class="px-3 py-2 font-semibold">Details</th>
                        <th class="px-3 py-2 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>

                    <tbody class="bg-default">
                      <tr v-for="sa in serviceAccounts" :key="sa.accessKey" class="border-t border-default">
                        <td class="px-3 py-2 font-mono break-all text-default">{{ sa.accessKey }}</td>
                        <td class="px-3 py-2 text-muted">
                          <span v-if="sa.name" class="text-default">Name: </span><span class="text-muted">{{
                            sa.name }}</span>
                          <span v-if="sa.description" class="text-default"> | Description: </span>
                          <span v-if="sa.description"
                            class="text-muted inline-block align-bottom max-w-[240px] truncate" :title="sa.description">
                            {{ sa.description }}
                          </span>
                          <span v-if="sa.expiresAt !== undefined" class="text-default">
                            | Expires: </span><span class="text-muted">{{ sa.expiresAt ? formatIsoLocal(sa.expiresAt) :
                              "No expiry" }}
                          </span>


                          <span v-if="sa.status" class="text-default"> | Status: </span><span class="text-muted">{{
                            sa.status
                            }}</span>
                        </td>
                        <td class="px-3 py-2">
                          <div class="flex justify-end gap-2">
                            <button type="button"
                              class="rounded-md btn-secondary px-2 py-1 text-xs"
                              @click="toggleServiceAccount(sa)" :disabled="saActionBusy">
                              {{ sa.status === "disabled" ? "Enable" : "Disable" }}
                            </button>

                            <button type="button"
                              class="rounded-md border border-default bg-danger px-2 py-1 text-xs text-white"
                              @click="removeServiceAccount(sa)" :disabled="saActionBusy">
                              Delete
                            </button>

                            <button type="button"
                              class="rounded-md btn-secondary px-2 py-1 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                              @click="openEditServiceAccountModal(sa)"
                              :disabled="saActionBusy || sa.status === 'disabled'"
                              :title="sa.status === 'disabled' ? 'Enable this access key to edit' : 'Edit'">
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>

                      <tr v-if="!serviceAccounts.length">
                        <td colspan="3" class="px-3 py-3 text-xs text-muted">
                          No service accounts yet.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <!-- Reset secret card -->
            <section class="rounded-lg border border-default bg-default px-4 py-4 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm font-medium text-default">Reset user secret key</div>
                  <div class="text-xs text-muted">
                    If enabled, the user must use the new secret key for MinIO access.
                  </div>
                </div>

                <label class="inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" v-model="resetSecret" />
                  <span class="text-default">{{ resetSecret ? "On" : "Off" }}</span>
                </label>
              </div>

              <div v-if="resetSecret" class="rounded-md border border-default bg-accent p-3 space-y-2">
                <label class="block text-xs font-semibold text-default">New secret key</label>

                <input type="text" v-model="localSecret"
                  class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs"
                  placeholder="Enter a secret key or generate one" />

                <div class="flex items-center justify-between gap-3">
                  <button type="button" class="rounded-md btn-secondary px-2.5 py-1 text-xs"
                    @click="localSecret = generateSecret()">
                    Generate key
                  </button>
                  <div class="text-xs text-muted">
                    Leave empty to let the backend generate a random secret. If you provide a value, that exact secret
                    will be set.
                  </div>
                </div>
              </div>

              <div class="text-xs text-muted">
                Username cannot be changed.
              </div>
            </section>
          </div>
        </div>

        <!-- Footer (sticky) -->
        <div class="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-default bg-accent px-6 py-4">
          <button type="button"
            class="rounded-md btn-secondary px-3 py-1.5 text-xs disabled:opacity-60"
            @click="$emit('update:modelValue', false)" :disabled="loading">
            Cancel
          </button>

          <button type="button"
            class="rounded-md border text-white border-default bg-danger px-3 py-1.5 text-xs text-default disabled:opacity-60"
            @click="onSubmit" :disabled="loading || !user">
            Save changes
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Single source of truth: modal for create/edit service accounts -->
  <MinioServiceAccountModal v-if="saModalOpen" :modelValue="saModalOpen" :username="user?.username ?? ''"
    :serviceAccount="saModalServiceAccount"
    @update:modelValue="(v: boolean) => { saModalOpen = v; if (!v) closeServiceAccountModal(); }"
    @created="async () => { await loadServiceAccounts(); }" @updated="async () => { await loadServiceAccounts(); }" />
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import type { MinioServiceAccount, MinioUserDetails, MinioUserUpdatePayload } from "@/tabs/s3Management/types/types";
import { generateSecret, formatIsoLocal, localTimeZone } from "@/tabs/s3Management/bucketBackends/bucketUtils";
import {
  listMinioServiceAccounts,
  disableMinioServiceAccount,
  enableMinioServiceAccount,
  deleteMinioServiceAccount,
  getMinioServiceAccountInfo,
} from "../../../api/minioCliAdapter";
import MinioServiceAccountModal from "./MinioServiceAccountModal.vue";

interface Props {
  modelValue: boolean;
  loading: boolean;
  errorMessage: string | null;
  availablePolicies: string[];
  availableGroups: string[];
  user: MinioUserDetails | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "submit", payload: MinioUserUpdatePayload): void;
}>();

const user = computed(() => props.user);
const errorMessage = computed(() => props.errorMessage);
const loading = computed(() => props.loading);

const availablePolicies = computed(() => props.availablePolicies ?? []);
const availableGroups = computed(() => props.availableGroups ?? []);

const localPolicies = ref<string[]>([]);
const localGroups = ref<string[]>([]);
const localStatusEnabled = ref(true);

const resetSecret = ref(false);
const localSecret = ref("");

const activeAccessTab = ref<"policies" | "groups" | "serviceAccounts">("policies");

const serviceAccounts = ref<MinioServiceAccount[]>([]);
const saLoading = ref(false);
const saActionBusy = ref(false);

watch(
  () => props.user,
  (u) => {
    if (!u) return;

    localPolicies.value = (u.policies ?? []) as string[];
    localGroups.value = (u.memberOf ?? [])
      .map((g) => g.name)
      .filter((name): name is string => Boolean(name));

    localStatusEnabled.value = u.status === "enabled";

    resetSecret.value = false;
    localSecret.value = "";

    activeAccessTab.value = "policies";
    serviceAccounts.value = [];
  },
  { immediate: true }
);

function onSubmit() {
  if (!props.user) return;

  const payload: MinioUserUpdatePayload = {
    username: props.user.username,
    status: localStatusEnabled.value ? "enabled" : "disabled",
    policies: [...localPolicies.value],
    groups: [...localGroups.value],
    resetSecret: resetSecret.value,
    newSecretKey: resetSecret.value && localSecret.value ? localSecret.value : undefined,
  };

  emit("submit", payload);
}

async function loadServiceAccounts() {
  if (!props.user) return;
  saLoading.value = true;

  try {
    serviceAccounts.value = await listMinioServiceAccounts(props.user.username);
  } finally {
    saLoading.value = false;
  }
}

async function toggleServiceAccount(sa: MinioServiceAccount) {
  if (!sa.accessKey) return;

  saActionBusy.value = true;
  try {
    if (sa.status === "disabled") {
      await enableMinioServiceAccount(sa.accessKey);
    } else {
      await disableMinioServiceAccount(sa.accessKey);
    }
    await loadServiceAccounts();
  } finally {
    saActionBusy.value = false;
  }
}

async function removeServiceAccount(sa: MinioServiceAccount) {
  if (!sa.accessKey) return;

  saActionBusy.value = true;
  try {
    await deleteMinioServiceAccount(sa.accessKey);
    await loadServiceAccounts();
  } finally {
    saActionBusy.value = false;
  }
}

/* Modal handling */
const saModalOpen = ref(false);
const saModalServiceAccount = ref<MinioServiceAccount | null>(null);

function openCreateServiceAccountModal() {
  saModalServiceAccount.value = null; // create
  saModalOpen.value = true;
}

async function openEditServiceAccountModal(sa: MinioServiceAccount) {
  if (!sa.accessKey) return;
  if (sa.status === "disabled") return;

  saActionBusy.value = true;
  try {
    const info = await getMinioServiceAccountInfo(sa.accessKey);

    saModalServiceAccount.value = {
      ...sa,
      name: info.name ?? sa.name,
      description: info.description ?? sa.description,
      expiresAt: info.expiresAt ?? sa.expiresAt ?? null,
      status: info.status ?? sa.status,
      policyJson: info.policyJson,
    } as any;

    saModalOpen.value = true;
  } catch {
    saModalServiceAccount.value = sa;
    saModalOpen.value = true;
  } finally {
    saActionBusy.value = false;
  }
}

function closeServiceAccountModal() {
  saModalOpen.value = false;
  saModalServiceAccount.value = null;
}

</script>
