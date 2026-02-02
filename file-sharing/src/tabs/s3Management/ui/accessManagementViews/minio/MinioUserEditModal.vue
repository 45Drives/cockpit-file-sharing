// MinioUserEditModal
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
            class="inline-flex items-center rounded-md border border-default bg-secondary px-3 py-1.5 text-xs text-default hover:opacity-90"
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
                  <div class="mt-0.5 text-xs text-secondary">
                    Configure policies, groups, and service accounts for this user.
                  </div>
                </div>
              </div>

              <!-- Tabs -->
              <div class="px-4 pt-3">
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
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div class="text-sm text-default">
                    Create and manage access keys for this user.
                    <div class="text-xs text-default">Secret keys are only shown once after creation.</div>
                  </div>

                  <button
  type="button"
  class="inline-flex items-center justify-center rounded-md border border-default bg-primary px-3 py-1.5 text-xs text-default disabled:opacity-60"
  @click="openCreateServiceAccountModal()"
  :disabled="loading || !user"
>
  New access key
</button>

                </div>

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
                          <span v-if="sa.name" class="text-default">Name: {{ sa.name }}</span>
                          <span v-if="sa.description"> | Description: {{ sa.description }}</span>
                          <span v-if="sa.expiresAt"> | Expires: {{ sa.expiresAt }}</span>
                          <span v-if="sa.status"> | Status: {{ sa.status }}</span>
                        </td>
                        <td class="px-3 py-2">
                          <div class="flex justify-end gap-2">
                            <button type="button"
                              class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                              @click="toggleServiceAccount(sa)">
                              {{ sa.status === "disabled" ? "Enable" : "Disable" }}
                            </button>
                            <button type="button"
                              class="rounded-md border border-default bg-danger px-2 py-1 text-xs text-default"
                              @click="removeServiceAccount(sa)">
                              Delete
                            </button>
                            <button
  type="button"
  class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
  @click="openEditServiceAccountModal(sa)"
>
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

                <div v-if="createdCreds"
                  class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <div class="font-semibold">New access key created. Copy the secret now.</div>
                  <div class="mt-2 font-mono break-all">Access Key: {{ createdCreds.accessKey }}</div>
                  <div class="mt-1 font-mono break-all">Secret Key: {{ createdCreds.secretKey }}</div>
                </div>

                <!-- Create panel -->
                <div v-if="openCreateServiceAccount" class="rounded-lg border border-default bg-accent p-4 space-y-4">
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-semibold text-default">Create service account</div>
                    <button type="button" class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                      @click="openCreateServiceAccount = false">
                      Cancel
                    </button>
                  </div>

                  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label class="block text-xs mb-1 text-muted">Name</label>
                      <input v-model="saForm.name"
                        class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs" />
                    </div>

                    <div>
                      <label class="block text-xs mb-1 text-muted">Description</label>
                      <input v-model="saForm.description"
                        class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs" />
                    </div>
                    <div>

</div>

                    <div class="md:col-span-2">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <div class="text-xs font-semibold text-default">Access key policy</div>
                          <button type="button"
                            class="inline-flex h-5 w-5 items-center justify-center rounded border border-default bg-secondary text-[10px]"
                            @click="showSaPolicyHelp = !showSaPolicyHelp" title="About access key policies"
                            aria-label="About access key policies">
                            i
                          </button>
                        </div>

                        <label class="inline-flex items-center gap-2 text-xs">
                          <span class="text-default">Restrict beyond user policy</span>
                          <input type="checkbox" v-model="saRestrictPolicyEnabled" />
                        </label>
                      </div>

                      <div v-if="showSaPolicyHelp"
                        class="mt-2 rounded-md border border-default bg-default px-3 py-2 text-xs text-muted">
                        Access keys inherit the parent user's policies and group policies. You can optionally attach an
                        additional IAM policy
                        to further restrict this access key. It cannot grant additional permissions beyond the parent
                        user.
                      </div>

                      <div v-if="saRestrictPolicyEnabled" class="mt-3 space-y-2">
                        <label class="block text-xs mb-1 text-muted">Restricting policy (JSON)</label>
                        <textarea v-model="saPolicyJson" rows="10"
                          class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs font-mono"
                          placeholder='{"Version":"2012-10-17","Statement":[...]}' />
                        <div class="flex items-center justify-between">
                          <button type="button" class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                            @click="formatSaPolicyJson()">
                            Format JSON
                          </button>
                          <div class="text-xs text-muted">
                            This policy should only remove permissions. It cannot add permissions beyond the parent
                            user.
                          </div>
                        </div>

                        <div v-if="saPolicyJsonError"
                          class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {{ saPolicyJsonError }}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label class="block text-xs mb-1 text-default">Access key</label>
                      <div class="flex gap-2">
                        <input v-model="saForm.accessKey"
                          class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs font-mono" />
                        <button type="button" class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                          @click="saForm.accessKey = generateAccessKey()">
                          Generate
                        </button>
                      </div>
                    </div>

                    <div>
                      <label class="block text-xs mb-1 text-default">Secret key</label>
                      <div class="flex gap-2">
                        <input v-model="saForm.secretKey"
                          class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs font-mono" />
                        <button type="button" class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                          @click="saForm.secretKey = generateSecret()">
                          Generate
                        </button>
                      </div>
                      <div class="mt-1 text-xs text-default">
                        Secret keys are only shown once after creation. Save it somewhere secure.
                      </div>
                    </div>
                  </div>

                  <div class="flex justify-end">
                    <button type="button"
                      class="rounded-md border border-default bg-primary px-3 py-1.5 text-xs text-default disabled:opacity-60"
                      @click="createServiceAccount()" :disabled="saCreating">
                      {{ saCreating ? "Creating..." : "Create" }}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <!-- Reset secret card -->
            <section class="rounded-lg border border-default bg-default px-4 py-4 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm font-medium text-default">Reset user secret key</div>
                  <div class="text-xs text-default">
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
                  <button type="button" class="rounded-md border border-default bg-secondary px-2.5 py-1 text-xs"
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
            class="rounded-md border border-default bg-secondary px-3 py-1.5 text-xs disabled:opacity-60"
            @click="$emit('update:modelValue', false)" :disabled="loading">
            Cancel
          </button>

          <button type="button"
            class="rounded-md border border-default bg-danger px-3 py-1.5 text-xs text-default disabled:opacity-60"
            @click="onSubmit" :disabled="loading || !user">
            Save changes
          </button>
        </div>
      </div>
    </div>
  </div>
  <MinioServiceAccountModal
  v-if="saModalOpen"
  :modelValue="saModalOpen"
  :username="user?.username ?? ''"
  :serviceAccount="saModalServiceAccount"
  @update:modelValue="(v: boolean) => { saModalOpen = v; if (!v) closeServiceAccountModal(); }"
  @created="async () => { await loadServiceAccounts(); }"
  @updated="async () => { await loadServiceAccounts(); }"
/>

</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import type { MinioServiceAccount, MinioUserDetails, MinioUserUpdatePayload } from "@/tabs/s3Management/types/types";
import { generateSecret } from "@/tabs/s3Management/bucketBackends/bucketUtils";
import {
  listMinioServiceAccounts,
  createMinioServiceAccount,
  disableMinioServiceAccount,
  enableMinioServiceAccount,
  deleteMinioServiceAccount,
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

const editingServiceAccount = ref<MinioServiceAccount | null>(null);



const localPolicies = ref<string[]>([]);
const localGroups = ref<string[]>([]);
const localStatusEnabled = ref(true);
const resetSecret = ref(false);
const localSecret = ref("");
const activeAccessTab = ref<"policies" | "groups" | "serviceAccounts">("policies");
// Sync local state when user changes
watch(
  () => props.user,
  (u) => {
    if (!u) return;

    // Direct policies as before
    localPolicies.value = (u.policies ?? []) as string[];
    localGroups.value = (u.memberOf ?? [])
      .map((g) => g.name)
      .filter((name): name is string => Boolean(name));

    localStatusEnabled.value = u.status === "enabled";
    resetSecret.value = false;
    localSecret.value = "";
    activeAccessTab.value = "policies";
    serviceAccounts.value = [];
    openCreateServiceAccount.value = false;
    createdCreds.value = null;
    saForm.value = { name: "", description: "", accessKey: "", secretKey: "" };
    saRestrictPolicyEnabled.value = false;
    saPolicyJson.value = "";
    saPolicyJsonError.value = null;
    showSaPolicyHelp.value = false;


  },
  { immediate: true }
);

const errorMessage = computed(() => props.errorMessage);



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
const serviceAccounts = ref<MinioServiceAccount[]>([]);
const saLoading = ref(false);
const saCreating = ref(false);
const openCreateServiceAccount = ref(false);
const createdCreds = ref<{ accessKey: string; secretKey: string } | null>(null);

async function loadServiceAccounts() {
  if (!props.user) return;
  saLoading.value = true;
  createdCreds.value = null;

  try {
    serviceAccounts.value = await listMinioServiceAccounts(props.user.username);
    console.log("serviceaccount : ", serviceAccounts.value)
  } finally {
    saLoading.value = false;
  }
}

async function createServiceAccount() {
  if (!props.user) return;

  saPolicyJsonError.value = validateSaPolicyJson();
  if (saPolicyJsonError.value) return;

  saCreating.value = true;
  createdCreds.value = null;

  try {
    const payload: any = {
      username: props.user.username,
      name: saForm.value.name?.trim() || undefined,
      description: saForm.value.description?.trim() || undefined,
      policyJson: saRestrictPolicyEnabled.value ? saPolicyJson.value.trim() : undefined,
    };

    const res = await createMinioServiceAccount(payload);
    createdCreds.value = { accessKey: res.accessKey, secretKey: res.secretKey };
    openCreateServiceAccount.value = false;

    saForm.value = { name: "", description: "", accessKey: "", secretKey: "" };
    saRestrictPolicyEnabled.value = false;
    saPolicyJson.value = "";
    saPolicyJsonError.value = null;
    showSaPolicyHelp.value = false;

    await loadServiceAccounts();
  } finally {
    saCreating.value = false;
  }
}

async function toggleServiceAccount(sa: MinioServiceAccount) {
  if (!sa.accessKey) return;

  if (sa.status === "disabled") {
    await enableMinioServiceAccount(sa.accessKey);
  } else {
    await disableMinioServiceAccount(sa.accessKey);
  }

  await loadServiceAccounts();
}

async function removeServiceAccount(sa: MinioServiceAccount) {
  if (!sa.accessKey) return;
  await deleteMinioServiceAccount(sa.accessKey);
  await loadServiceAccounts();
}
const saForm = ref({
  name: "",
  description: "",
  accessKey: "",
  secretKey: "",
});

function generateAccessKey(): string {
  // Keep it simple and URL-safe; adjust to your policy.
  // Example: 20 chars
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 20; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
const saRestrictPolicyEnabled = ref(false);
const saPolicyJson = ref("");
const saPolicyJsonError = ref<string | null>(null);
const showSaPolicyHelp = ref(false);

function validateSaPolicyJson(): string | null {
  if (!saRestrictPolicyEnabled.value) return null;
  const raw = saPolicyJson.value.trim();
  if (!raw) return "Policy JSON is required when restriction is enabled.";
  try {
    JSON.parse(raw);
    return null;
  } catch {
    return "Invalid JSON. Please fix syntax errors.";
  }
}

function formatSaPolicyJson() {
  saPolicyJsonError.value = null;
  const raw = saPolicyJson.value.trim();
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    saPolicyJson.value = JSON.stringify(obj, null, 2);
  } catch {
    saPolicyJsonError.value = "Invalid JSON. Cannot format.";
  }
}

const saModalOpen = ref(false);
const saModalServiceAccount = ref<MinioServiceAccount | null>(null);

function openCreateServiceAccountModal() {
  saModalServiceAccount.value = null; // create
  saModalOpen.value = true;
}

function openEditServiceAccountModal(sa: MinioServiceAccount) {
  saModalServiceAccount.value = sa; // edit
  saModalOpen.value = true;
}

function closeServiceAccountModal() {
  saModalOpen.value = false;
  saModalServiceAccount.value = null;
}

</script>