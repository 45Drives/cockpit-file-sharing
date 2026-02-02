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

          <section class="rounded-lg border border-default bg-default px-4 py-4 space-y-4">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label class="block text-xs mb-1 text-muted">Name</label>
                <input v-model="form.name" type="text"
                  class="w-full rounded-md border border-default bg-accent px-2 py-1 text-xs text-default outline-none focus:ring-1"
                  :disabled="saving" />
              </div>

              <div>
                <label class="block text-xs mb-1 text-muted">Description</label>
                <input v-model="form.description" type="text"
                  class="w-full rounded-md border border-default bg-accent px-2 py-1 text-xs text-default outline-none focus:ring-1"
                  :disabled="saving" />
              </div>

              

              <div>
                <label class="block text-xs mb-1 text-muted">Expiry duration</label>

                <div class="flex gap-2">
                  <select v-model="expiryPreset"
                    class="w-full rounded-md border border-default bg-accent px-2 py-1 text-xs text-default outline-none focus:ring-1"
                    :disabled="saving">
                    <option value="">Custom / none</option>
                    <option value="1h">1h</option>
                    <option value="12h">12h</option>
                    <option value="1d">1d</option>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                    <option value="90d">90d</option>
                    <option value="365d">365d</option>
                  </select>

                  <button type="button"
                    class="rounded-md border border-default bg-secondary px-2.5 py-1 text-xs disabled:opacity-60"
                    @click="applyExpiryPreset" :disabled="saving || !expiryPreset">
                    Apply
                  </button>
                </div>

                <input v-model="form.expiry" type="text" placeholder="e.g. 30d, 12h, 1y (empty = no expiry)"
                  class="mt-2 w-full rounded-md border border-default bg-accent px-2 py-1 text-xs text-default outline-none focus:ring-1"
                  :disabled="saving" />

                <div class="mt-1 text-xs text-muted">
                  Leave empty to clear expiry.
                </div>
              </div>
<!-- Replace your current Status block with this -->
<div v-if="isEdit" class="flex items-center justify-between md:justify-start md:gap-3">
  <div class="text-xs text-muted">Status</div>

  <div class="flex items-center gap-2">
    <label class="inline-flex items-center gap-2 text-xs">
      <input type="checkbox" v-model="enabled" :disabled="saving" />
      <span class="text-default">{{ enabled ? "Enabled" : "Disabled" }}</span>
    </label>

    <button
      v-if="!enabled"
      type="button"
      class="rounded-md border border-default bg-primary px-2.5 py-1 text-xs text-default disabled:opacity-60"
      @click="enableNow"
      :disabled="saving"
    >
      Enable
    </button>

    <button
      v-else
      type="button"
      class="rounded-md border border-default bg-secondary px-2.5 py-1 text-xs disabled:opacity-60"
      @click="disableNow"
      :disabled="saving"
    >
      Disable
    </button>
  </div>
</div>



              <div v-else class="md:col-span-2 rounded-md border border-default bg-accent p-3 space-y-2">
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label class="block text-xs mb-1 text-muted">Access key </label>
                    <div class="flex gap-2">
                      <input v-model="form.accessKey"
                        class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs font-mono text-default"
                        :disabled="saving" />
                      <button type="button" class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                        @click="form.accessKey = generateAccessKey()" :disabled="saving">
                        Generate
                      </button>
                    </div>
                  </div>

                  <div>
                    <label class="block text-xs mb-1 text-muted">Secret key </label>
                    <div class="flex gap-2">
                      <input v-model="form.secretKey"
                        class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs font-mono text-default"
                        :disabled="saving" />
                      <button type="button" class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                        @click="form.secretKey = generateSecret()" :disabled="saving">
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

            <div class="rounded-md border border-default bg-accent p-3 space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="text-xs font-semibold text-default">Access key policy</div>
                  <button type="button"
                    class="inline-flex h-5 w-5 items-center justify-center rounded border border-default bg-secondary text-[10px]"
                    @click="showPolicyHelp = !showPolicyHelp" title="About access key policies"
                    aria-label="About access key policies">
                    i
                  </button>
                </div>

                <label class="inline-flex items-center gap-2 text-xs">
                  <span class="text-default">Attach policy JSON</span>
                  <input type="checkbox" v-model="policyEnabled" :disabled="saving" />
                </label>
              </div>

              <div v-if="showPolicyHelp"
                class="rounded-md border border-default bg-default px-3 py-2 text-xs text-muted">
                Access keys inherit the parent user's policies and group policies. This policy should be restrictive.
              </div>

              <div v-if="policyEnabled" class="space-y-2">
                <label class="block text-xs mb-1 text-muted">Policy JSON</label>

                <textarea v-model="policyJson" rows="12"
                  class="w-full rounded-md border border-default bg-default px-2 py-1 text-xs font-mono text-default"
                  placeholder='{"Version":"2012-10-17","Statement":[...]}' :disabled="saving" />

                <div class="flex items-center justify-between gap-3">
                  <button type="button" class="rounded-md border border-default bg-secondary px-2 py-1 text-xs"
                    @click="formatPolicyJson" :disabled="saving || !policyJson.trim()">
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

            <div v-if="createdCreds"
              class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div class="font-semibold">New access key created. Copy the secret now.</div>
              <div class="mt-2 font-mono break-all">Access Key: {{ createdCreds.accessKey }}</div>
              <div class="mt-1 font-mono break-all">Secret Key: {{ createdCreds.secretKey }}</div>
            </div>
          </section>
        </div>

        <div class="flex justify-end gap-2 border-t border-default bg-accent px-6 py-4">
          <button type="button"
            class="rounded-md border border-default bg-secondary px-3 py-1.5 text-xs disabled:opacity-60"
            @click="emit('update:modelValue', false)" :disabled="saving">
            Cancel
          </button>

          <button type="button"
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
import { generateSecret } from "@/tabs/s3Management/bucketBackends/bucketUtils";
import type { MinioServiceAccount } from "@/tabs/s3Management/types/types";
import {
  createMinioServiceAccount,
  updateMinioServiceAccount,
  enableMinioServiceAccount,
  disableMinioServiceAccount,
} from "@/tabs/s3Management/api/minioCliAdapter";

const props = defineProps<{
  modelValue: boolean;
  username: string;
  serviceAccount?: MinioServiceAccount | null; // when present => edit mode
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "created", creds: { accessKey: string; secretKey: string; expiresAt?: string | null }): void;
  (e: "updated"): void;
}>();

const isEdit = computed(() => Boolean(props.serviceAccount?.accessKey));

const saving = ref(false);
const error = ref<string | null>(null);

const createdCreds = ref<{ accessKey: string; secretKey: string; expiresAt?: string | null } | null>(null);

const form = ref({
  name: "",
  description: "",
  expiry: "",
  accessKey: "",
  secretKey: "",
});

const enabled = ref(true);

const policyEnabled = ref(false);
const policyJson = ref("");
const policyError = ref<string | null>(null);
const showPolicyHelp = ref(false);

const expiryPreset = ref("");

// Prevent watcher from firing when we set enabled programmatically
const ignoreEnabledWatch = ref(false);

watch(
  () => props.serviceAccount,
  (sa) => {
    error.value = null;
    policyError.value = null;
    createdCreds.value = null;
    expiryPreset.value = "";

    ignoreEnabledWatch.value = true;

    if (sa?.accessKey) {
      form.value.name = (sa as any)?.name ?? "";
      form.value.description = (sa as any)?.description ?? "";
      form.value.expiry = (sa as any)?.expiry ?? "";
      form.value.accessKey = "";
      form.value.secretKey = "";

      enabled.value = ((sa as any)?.status ?? "enabled") !== "disabled";

      policyJson.value = (sa as any)?.policyJson ?? "";
      policyEnabled.value = Boolean(policyJson.value?.trim());
    } else {
      form.value = { name: "", description: "", expiry: "", accessKey: "", secretKey: "" };
      enabled.value = true;

      policyJson.value = "";
      policyEnabled.value = false;
    }

    // release on next tick-ish (microtask)
    queueMicrotask(() => {
      ignoreEnabledWatch.value = false;
    });
  },
  { immediate: true }
);

function applyExpiryPreset() {
  if (!expiryPreset.value) return;
  form.value.expiry = expiryPreset.value;
}

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

async function enableNow() {
  const accessKey = props.serviceAccount?.accessKey?.trim();
  if (!accessKey) return;

  saving.value = true;
  error.value = null;

  try {
    await enableMinioServiceAccount(accessKey);
    enabled.value = true;
    emit("updated");
  } catch (e: any) {
    // revert UI if it failed
    enabled.value = false;
    error.value = e?.message ?? "Failed to enable access key";
  } finally {
    saving.value = false;
  }
}

async function disableNow() {
  const accessKey = props.serviceAccount?.accessKey?.trim();
  if (!accessKey) return;

  saving.value = true;
  error.value = null;

  try {
    await disableMinioServiceAccount(accessKey);
    enabled.value = false;
    emit("updated");
  } catch (e: any) {
    // revert UI if it failed
    enabled.value = true;
    error.value = e?.message ?? "Failed to disable access key";
  } finally {
    saving.value = false;
  }
}

// Checkbox toggles immediately
watch(enabled, async (v, prev) => {
  if (!isEdit.value) return;
  if (ignoreEnabledWatch.value) return;
  if (saving.value) return;
  if (v === prev) return;

  if (v) await enableNow();
  else await disableNow();
});

async function submit() {
  const username = props.username?.trim();
  if (!username) return;

  policyError.value = validatePolicyJson();
  if (policyError.value) return;

  saving.value = true;
  error.value = null;
  createdCreds.value = null;

  try {
    if (isEdit.value) {
      const accessKey = props.serviceAccount?.accessKey?.trim();
      if (!accessKey) return;

      // Do NOT push status here; status is handled by enable/disable commands above.
      await updateMinioServiceAccount({
        accessKey,
        name: form.value.name.trim() || undefined,
        description: form.value.description.trim() || undefined,
        expiry: form.value.expiry.trim() || undefined,
        policyJson: policyEnabled.value ? (policyJson.value.trim() || undefined) : undefined,
      });

      emit("updated");
      emit("update:modelValue", false);
      return;
    }

    const res = await createMinioServiceAccount({
      username,
      name: form.value.name.trim() || undefined,
      description: form.value.description.trim() || undefined,
      expiry: form.value.expiry.trim() || undefined,
      accessKey: form.value.accessKey.trim(),
      secretKey: form.value.secretKey.trim() ,
      policyJson: policyEnabled.value ? (policyJson.value.trim() || undefined) : undefined,
    });

    createdCreds.value = res;
    emit("created", res);
    emit("update:modelValue", false);
  } catch (e: any) {
    error.value = e?.message ?? (isEdit.value ? "Failed to update access key" : "Failed to create access key");
  } finally {
    saving.value = false;
  }
}
</script>
