<!-- MinioServiceAccountModal.vue -->
<template>
  <div v-if="modelValue" class="fixed inset-0 z-[60]">
    <div class="absolute inset-0 bg-black/40" @click="emit('update:modelValue', false)"></div>

    <div class="relative z-10 flex min-h-screen items-center justify-center p-4">
      <div class="w-full max-w-4xl rounded-xl border border-default bg-accent shadow-lg overflow-hidden" role="dialog"
        aria-modal="true">
        <div class="flex items-center justify-between border-b border-default bg-accent px-6 py-4">
          <div class="min-w-0">
            <h3 class="text-base font-semibold truncate">
              <span v-if="isEdit">Edit access key</span>
              <span v-else>Create access key</span>
              <span v-if="isEdit"> - {{ serviceAccount?.accessKey }}</span>
            </h3>

            <p class="mt-0.5 text-xs text-muted">
              <span v-if="isEdit">Update policy, expiry, name, description, and status.</span>
              <span v-else>Secret keys are only shown once after creation.</span>
            </p>
          </div>

          <button type="button"
            class="inline-flex items-center rounded-md border border-default bg-secondary px-3 py-1.5 text-xs text-default disabled:opacity-60"
            @click="emit('update:modelValue', false)" :disabled="saving">
            Close
          </button>
        </div>

        <div class="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-4">
          <div v-if="error" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {{ error }}
          </div>

          <div v-if="createdCreds"
            class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <div class="font-semibold">New access key created. Copy the secret now.</div>
            <div class="mt-2 font-mono break-all">Access Key: {{ createdCreds.accessKey }}</div>
            <div class="mt-1 font-mono break-all">Secret Key: {{ createdCreds.secretKey }}</div>

            <div class="mt-1 text-xs">
              Expires ({{ tzLabel }}):
              {{ createdCreds?.expiresAt ? formatIsoLocal(String(createdCreds.expiresAt)) : "No expiry" }}
            </div>
          </div>

          <section class="rounded-lg border border-default bg-default px-4 py-4 space-y-4">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label class="block text-sm mb-1 text-default">Name</label>
                <input v-model="form.name" type="text"
                  class="w-full rounded-md border border-default bg-accent px-2 py-1 text-xs text-default outline-none focus:ring-1"
                  :disabled="saving || hasCreatedCreds" />
              </div>

              <div class="md:col-span-2">
                <label class="block text-sm mb-1 text-default">Description</label>
                <textarea v-model="form.description" rows="3"
                  class="w-full rounded-md border border-default bg-accent px-2 py-1 text-xs text-default outline-none focus:ring-1"
                  :disabled="saving || hasCreatedCreds" />
              </div>

              <!-- Expiry -->
              <div class="md:col-span-2">
                <label class="block text-sm mb-1 text-default">Expiry</label>

                <div v-if="!isEdit" class="flex gap-2">
                  <select v-model="expiryMode"
                    class="w-full rounded-md border border-default bg-accent px-2 py-1 text-xs text-default outline-none focus:ring-1"
                    :disabled="saving || hasCreatedCreds">
                    <option value="datetime">Pick date & time</option>
                    <option value="none">No expiry</option>
                  </select>
                </div>

                <div v-if="expiryMode === 'datetime'" class="mt-2 space-y-2">
                  <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <label class="block text-xs mb-1 text-muted">Date</label>
                      <input v-model="expiryDate" @input="expiryTouched = true" @change="expiryTouched = true"
                        type="date"
                        class="w-full rounded-md border border-default bg-accent px-2 py-1 text-xs text-default outline-none focus:ring-1"
                        :disabled="saving || hasCreatedCreds" />
                    </div>
                    <div>
                      <label class="block text-xs mb-1 text-muted">Time</label>
                      <input v-model="expiryTime" @input="expiryTouched = true" @change="expiryTouched = true"
                        type="time"
                        class="w-full rounded-md border border-default bg-accent px-2 py-1 text-xs text-default outline-none focus:ring-1"
                        :disabled="saving || hasCreatedCreds" />

                      <div class="text-xs text-muted">
                        If time is empty, it will default to 00:00.
                      </div>
                    </div>
                  </div>

                  <div v-if="expiryError"
                    class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {{ expiryError }}
                  </div>

                  <div class="text-xs text-muted">This will be sent as an absolute timestamp.</div>
                </div>

                <div v-else class="mt-2 text-xs text-muted">
                  No expiry set.
                </div>
              </div>

              <!-- Status (edit only) -->
              <div v-if="isEdit" class="flex items-center gap-4">
                <div class="text-md text-default">Status</div>

                <label class="inline-flex items-center gap-2 text-md">
                  <input type="checkbox" :checked="enabled" @change="onToggleEnabled"
                    :disabled="saving || hasCreatedCreds" />
                  <span class="text-default">{{ enabled ? "Enabled" : "Disabled" }}</span>
                </label>
              </div>


              <!-- Create-only keys -->
              <div v-else class="md:col-span-2 rounded-md border border-default bg-accent p-3 space-y-2">
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label class="block text-xs mb-1 text-muted">Access key</label>
                    <div class="flex gap-2">
                      <input v-model="form.accessKey"
                        class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs font-mono text-default"
                        :disabled="saving || hasCreatedCreds" />
                      <button type="button" class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                        @click="form.accessKey = generateAccessKey()" :disabled="saving || hasCreatedCreds">
                        Generate
                      </button>
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs mb-1 text-muted">Secret key</label>
                    <div class="flex gap-2">
                      <input v-model="form.secretKey"
                        class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs font-mono text-default"
                        :disabled="saving || hasCreatedCreds" />
                      <button type="button" class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                        @click="form.secretKey = generateSecret()" :disabled="saving || hasCreatedCreds">
                        Generate
                      </button>
                    </div>

                    <div class="mt-1 text-xs text-muted">
                      Secret key is only shown once after creation. Save it securely.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Policy -->
            <div class="rounded-md border border-default bg-accent p-3 space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="text-xs font-semibold text-default">Access key policy</div>

                  <div class="relative group">
                    <span class="inline-flex h-5 w-5 items-center justify-center rounded  text-muted"
                      >
                      <!-- Info icon (inline SVG) -->
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 16v-4"></path>
                        <path d="M12 8h.01"></path>
                      </svg>
                    </span>

                    <!-- Hover tooltip -->
                    <div
                      class="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-72 -translate-x-1/2 rounded-md border border-default bg-default px-3 py-2 text-xs text-muted opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                      Access keys inherit the parent user's policies and group policies. This policy should be
                      restrictive.
                    </div>
                  </div>
                </div>


                <label class="inline-flex items-center gap-2 text-xs">
                  <span class="text-default">Attach policy JSON</span>
                  <input type="checkbox" v-model="policyEnabled" :disabled="saving || hasCreatedCreds" />
                </label>
              </div>

              <div v-if="policyEnabled" class="space-y-2">
                <label class="block text-xs mb-1 text-muted">Policy JSON</label>

                <textarea v-model="policyJson" rows="12"
                  class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs font-mono text-default"
                  placeholder='{"Version":"2012-10-17","Statement":[...]}' :disabled="saving || hasCreatedCreds" />

                <div class="flex items-center justify-between gap-3">
                  <button type="button" class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                    @click="formatPolicyJson" :disabled="saving || hasCreatedCreds || !policyJson.trim()">
                    Format JSON
                  </button>

                  <div class="text-xs text-muted">Must be valid JSON.</div>
                </div>

                <div v-if="policyError"
                  class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {{ policyError }}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="flex justify-end gap-2 border-t border-default bg-accent px-6 py-4">
          <button type="button"
            class="rounded-md border border-default bg-secondary px-3 py-1.5 text-xs disabled:opacity-60"
            @click="emit('update:modelValue', false)" :disabled="saving">
            {{ hasCreatedCreds ? "Done" : "Cancel" }}
          </button>

          <button v-if="!hasCreatedCreds" type="button"
            class="rounded-md border border-default bg-primary px-3 py-1.5 text-xs text-default disabled:opacity-60"
            @click="submit" :disabled="saving || !username">
            {{ saving ? (isEdit ? "Updating..." : "Creating...") : (isEdit ? "Update" : "Create") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { MinioServiceAccount } from "@/tabs/s3Management/types/types";
import {
  createMinioServiceAccount,
  updateMinioServiceAccount,
  enableMinioServiceAccount,
  disableMinioServiceAccount,
} from "@/tabs/s3Management/api/minioCliAdapter";
import { generateSecret, formatIsoLocal, localTimeZone } from "@/tabs/s3Management/bucketBackends/bucketUtils";

const props = defineProps<{
  modelValue: boolean;
  username: string;
  serviceAccount?: MinioServiceAccount | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "created", creds: { accessKey: string; secretKey: string; expiresAt?: string | null }): void;
  (e: "updated"): void;
}>();

const username = computed(() => props.username?.trim() ?? "");
const isEdit = computed(() => Boolean(props.serviceAccount?.accessKey));

const saving = ref(false);
const error = ref<string | null>(null);

type ExpiryMode = "none" | "datetime";
const expiryMode = ref<ExpiryMode>("datetime"); 
const expiryDate = ref("");
const expiryTime = ref("");

const createdCreds = ref<{ accessKey: string; secretKey: string; expiresAt?: string | null } | null>(null);
const hasCreatedCreds = computed(() => Boolean(createdCreds.value));

const form = ref({
  name: "",
  description: "",
  accessKey: "",
  secretKey: "",
});

const enabled = ref(true);
const policyEnabled = ref(false);
const policyJson = ref("");
const policyError = ref<string | null>(null);
const tzLabel = computed(() => localTimeZone());
const expiryTouched = ref(false);

watch([expiryDate, expiryTime], () => {
  expiryTouched.value = true;
});


watch(
  () => props.serviceAccount,
  (sa) => {
    // reset touch state when modal loads/switches record
    expiryTouched.value = false;
    const iso = (sa as any)?.expiresAt ?? (sa as any)?.expiration ?? null;
    if (iso) expiryTouched.value = true;
  },
  { immediate: true }
);

watch(
  () => [props.modelValue, props.serviceAccount] as const,
  ([open, sa]) => {
    if (!open) return;

    error.value = null;
    policyError.value = null;
    createdCreds.value = null;

    // reset touch state and inputs
    expiryTouched.value = false;
    expiryDate.value = "";
    expiryTime.value = "";

    if (sa?.accessKey) {
      // EDIT mode: populate fields
      form.value.name = sa.name ?? "";
      form.value.description = sa.description ?? "";
      form.value.accessKey = "";
      form.value.secretKey = "";

      enabled.value = ((sa as any)?.status ?? "enabled") !== "disabled";

      // policy
      policyJson.value = (sa as any)?.policyJson ?? "";
      policyEnabled.value = Boolean(policyJson.value?.trim());

      // expiry
      const iso = (sa as any)?.expiresAt ?? (sa as any)?.expiration ?? null;
      if (iso) {
        const parts = isoToLocalDateTimeParts(String(iso));
        if (parts) {
          expiryMode.value = "datetime";
          expiryDate.value = parts.date;
          expiryTime.value = parts.time;
          expiryTouched.value = true; 
        } else {
          expiryMode.value = "datetime";
        }
      } else {
        expiryMode.value = "datetime";
      }
    } else {
      form.value = { name: "", description: "", accessKey: "", secretKey: "" };
      enabled.value = true;

      policyJson.value = "";
      policyEnabled.value = false;

      expiryMode.value = "none";
    }
  },
  { immediate: true }
);

const expiryError = computed(() => {
  if (expiryMode.value !== "datetime") return "";

  if (!expiryTouched.value) return "";

  if (!expiryDate.value) return "Pick a date.";

  const t = (expiryTime.value?.trim() ? expiryTime.value.trim() : "00:00");
  const target = new Date(`${expiryDate.value}T${t}:00`);
  if (Number.isNaN(target.getTime())) return "Invalid date/time.";
  if (target.getTime() <= Date.now()) return "Expiry must be in the future.";
  return "";
});

const selectedExpiryIso = computed(() => {
  if (expiryMode.value !== "datetime") return "";
  if (expiryError.value) return "";

  const t = expiryTime.value?.trim() ? expiryTime.value.trim() : "00:00";
  const d = new Date(`${expiryDate.value}T${t}:00`);
  if (Number.isNaN(d.getTime())) return "";

  return toMcExpiryRFC3339(d);
});
function toMcExpiryRFC3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

const selectedExpiryFormatted = computed(() => {
  return selectedExpiryIso.value ? formatIsoLocal(selectedExpiryIso.value) : "";
});

function validatePolicyJson(): string | null {
  if (!policyEnabled.value) return null;
  const raw = policyJson.value.trim();
  if (!raw) return "Policy JSON is required when enabled.";
  try {
    JSON.parse(raw);
    return null;
  } catch {
    return "Invalid JSON. Please fix syntax errors.";
  }
}

function formatPolicyJson() {
  policyError.value = null;
  const raw = policyJson.value.trim();
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    policyJson.value = JSON.stringify(obj, null, 2);
  } catch {
    policyError.value = "Invalid JSON. Cannot format.";
  }
}

function generateAccessKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 20; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function onToggleEnabled(ev: Event) {
  if (!isEdit.value) return;
  if (saving.value) return;

  const input = ev.target as HTMLInputElement;
  const next = input.checked;

  const accessKey = props.serviceAccount?.accessKey?.trim();
  if (!accessKey) return;

  const prev = enabled.value;
  enabled.value = next;

  saving.value = true;
  error.value = null;

  try {
    if (next) await enableMinioServiceAccount(accessKey);
    else await disableMinioServiceAccount(accessKey);
    emit("updated");
  } catch (e: any) {
    enabled.value = prev;
    error.value = e?.message ?? "Failed to update status";
  } finally {
    saving.value = false;
  }
}

async function submit() {
  const u = username.value;
  if (!u) return;

  policyError.value = validatePolicyJson();
  if (policyError.value) return;

  const expiresAt =
    expiryMode.value === "datetime" ? (selectedExpiryIso.value || undefined) : undefined;

  saving.value = true;
  error.value = null;

  try {
    if (isEdit.value) {
      const accessKey = props.serviceAccount?.accessKey?.trim();
      if (!accessKey) return;

      await updateMinioServiceAccount({
        accessKey,
        name: form.value.name.trim() || undefined,
        description: form.value.description.trim() || undefined,
        expiresAt,
        policyJson: policyEnabled.value ? (policyJson.value.trim() || undefined) : undefined,
      });

      emit("updated");
      emit("update:modelValue", false);
      return;
    }

    const res = await createMinioServiceAccount({
      username: u,
      name: form.value.name.trim() || undefined,
      description: form.value.description.trim() || undefined,
      expiresAt,
      accessKey: form.value.accessKey.trim(),
      secretKey: form.value.secretKey.trim(),
      policyJson: policyEnabled.value ? (policyJson.value.trim() || undefined) : undefined,
    });

    createdCreds.value = res;
    emit("created", res);
  } catch (e: any) {
    error.value = e?.message ?? (isEdit.value ? "Failed to update access key" : "Failed to create access key");
  } finally {
    saving.value = false;
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoToLocalDateTimeParts(iso: string): { date: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());

  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

watch(expiryMode, (m) => {
  if (m === "none") {
    expiryDate.value = "";
    expiryTime.value = "";
  }
});
</script>
