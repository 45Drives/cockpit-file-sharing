<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div class="bg-default rounded-lg shadow-xl max-w-2xl w-full mx-4 overflow-hidden border border-default">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-default flex items-center justify-between bg-default">
        <div class="flex items-center space-x-3">
          <div
            class="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-semibold text-blue-700 uppercase">
            {{ userInitials }}
          </div>

          <div class="space-y-0.5">
            <h3 class="text-base font-semibold">User details</h3>
            <p class="text-sm text-default">
              {{ user?.uid || "No user selected" }}
              <span v-if="user?.tenant" class="text-default">
                · Tenant: {{ user.tenant }}
              </span>
            </p>
          </div>
        </div>

        <button
          class="text-sm px-3 py-1.5 rounded btn-secondary hover:bg-accent disabled:opacity-60"
          @click="close" :disabled="loading">
          Close
        </button>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 space-y-4 text-sm max-h-[70vh] overflow-y-auto">
        <div v-if="loading" class="text-sm text-default">
          Loading user details…
        </div>

        <div v-else-if="errorMessage" class="text-sm text-red-600">
          {{ errorMessage }}
        </div>

        <div v-else-if="user">
          <!-- Top badges -->
          <div class="flex flex-wrap items-center gap-2 text-sm mb-1">
            <span class="inline-flex items-center rounded-full px-2 py-0.5 border text-sm"
              :class="user.suspended ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'">
              <span class="mr-1 h-1.5 w-1.5 rounded-full"
                :class="user.suspended ? 'bg-red-500' : 'bg-emerald-500'"></span>
              {{ user.suspended ? "Suspended" : "Active" }}
            </span>

            <span class="inline-flex items-center rounded-full px-2 py-0.5 border border-default bg-well text-default">
              Max buckets: <span class="ml-1 font-medium">{{ user.maxBuckets ?? "default" }}</span>
            </span>
          </div>

          <!-- Basic -->
          <section class="mt-2">
            <h4 class="text-sm font-semibold uppercase text-default mb-2">Basic information</h4>
            <div
              class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm bg-accent border border-default rounded-lg px-3 py-3">
              <div>
                <div class="text-default font-semibold">Username</div>
                <div class="font-medium break-all">{{ user.uid }}</div>
              </div>
              <div>
                <div class="text-default font-semibold">Tenant</div>
                <div class="font-medium">{{ user.tenant || "-" }}</div>
              </div>
              <div>
                <div class="text-default font-semibold">Full name</div>
                <div class="font-medium">{{ user.displayName || "-" }}</div>
              </div>
              <div>
                <div class="text-default font-semibold">Email</div>
                <div class="font-medium break-all">{{ user.email || "-" }}</div>
              </div>
            </div>
          </section>

          <!-- Quotas + usage -->
          <section class="mt-4">
            <h4 class="text-sm font-semibold uppercase text-default mb-2">Quota usage (user-level)</h4>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <!-- Size -->
              <div class="border border-default rounded-lg px-3 py-2">
                <div class="text-default mb-1 font-semibold">Capacity</div>
                <div class="space-y-1">
                  <div>
                    <span class="text-default">Used:</span>
                    <span class="ml-1 font-medium">{{ fmtKiB(user.quotaUsedSizeKb) }}</span>
                  </div>
                  <div>
                    <span class="text-default">Limit:</span>
                    <span class="ml-1 font-medium">{{ fmtKiBLimit(user.quotaMaxSizeKb) }}</span>
                  </div>
                  <div>
                    <span class="text-default">Available:</span>
                    <span class="ml-1 font-medium">{{ fmtKiBAvailable(user.quotaRemainingSizeKb, user.quotaMaxSizeKb)
                      }}</span>
                  </div>
                  <div>
                    <span class="text-default">Used %:</span>
                    <span class="ml-1 font-medium">{{ fmtPct(user.quotaUsedSizePercent) }}</span>
                  </div>
                </div>
              </div>

              <!-- Objects -->
              <div class="border border-default rounded-lg px-3 py-2">
                <div class="text-default mb-1 font-semibold">Objects</div>
                <div class="space-y-1">
                  <div>
                    <span class="text-default">Used:</span>
                    <span class="ml-1 font-medium">{{ fmtNum(user.quotaUsedObjects) }}</span>
                  </div>
                  <div>
                    <span class="text-default">Limit:</span>
                    <span class="ml-1 font-medium">{{ fmtNumLimit(user.quotaMaxObjects) }}</span>
                  </div>
                  <div>
                    <span class="text-default">Available:</span>
                    <span class="ml-1 font-medium">{{ fmtNumAvailable(user.quotaRemainingObjects, user.quotaMaxObjects)
                      }}</span>
                  </div>
                  <div>
                    <span class="text-default">Used %:</span>
                    <span class="ml-1 font-medium">{{ fmtPct(user.quotaUsedObjectsPercent) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Keys -->
          <section class="mt-4" v-if="user.keys && user.keys.length">
            <div class="flex items-center justify-between mb-1">
              <h4 class="text-sm font-semibold uppercase text-default">S3 access keys</h4>
              <p class="text-[10px] text-default">
                Secret keys are hidden by default.
              </p>
            </div>

            <div class="space-y-2 text-sm">
              <div v-for="(k, idx) in user.keys" :key="k.accessKey + ':' + idx"
                class="border border-default rounded-lg px-3 py-2">
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-default font-semibold">Access key</div>
                    <div class="font-mono text-sm break-all">{{ k.accessKey }}</div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 border border-default bg-accent text-[10px] text-default">
                      Key {{ idx + 1 }}
                    </span>

                    <button v-if="k.secretKey" type="button"
                      class="text-sm px-2 py-1 rounded btn-secondary hover:bg-accent"
                      @click="toggleSecret(k.accessKey, idx)">
                      {{ isSecretVisible(k.accessKey, idx) ? "Hide secret" : "Show secret" }}
                    </button>
                  </div>
                </div>

                <div v-if="k.secretKey" class="mt-2">
                  <div class="text-default font-semibold">Secret key</div>
                  <div class="font-mono text-sm break-all">
                    <span v-if="isSecretVisible(k.accessKey, idx)">{{ k.secretKey }}</span>
                    <span v-else>••••••••••••••••••••••••••••••••</span>
                  </div>
                </div>

                <div v-if="k.user" class="mt-1 text-sm text-default">
                  <span>User:</span>
                  <span class="ml-1">{{ k.user }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Capabilities -->
          <section class="mt-4" v-if="user.caps && user.caps.length">
            <h4 class="text-sm font-semibold uppercase text-default mb-2">Capabilities</h4>

            <div class="border border-default rounded-lg overflow-hidden">
              <table class="min-w-full border-collapse text-sm">
                <thead class="bg-accent">
                  <tr>
                    <th class="border-b border-default px-3 py-1.5 text-left font-semibold">Type</th>
                    <th class="border-b border-default px-3 py-1.5 text-left font-semibold">Permissions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(c, idx) in user.caps" :key="c.type + ':' + c.perm + ':' + idx" class="even:bg-accent">
                    <td class="border-b border-default px-3 py-1.5">{{ c.type }}</td>
                    <td class="border-b border-default px-3 py-1.5">{{ c.perm }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div v-else class="text-sm text-default">No user selected.</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import type { RgwUserDetails } from "@/tabs/s3Management/types/types";

const props = defineProps<{
  modelValue: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  user: RgwUserDetails | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

function close() {
  emit("update:modelValue", false);
}

const userInitials = computed(() => {
  if (!props.user) return "?";

  const name = props.user.displayName || props.user.uid || "";
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();

  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
});

// Secret reveal state
const visibleSecrets = ref<Record<string, boolean>>({});

function secretKeyId(accessKey: string, idx: number) {
  return `${accessKey}:${idx}`;
}

function isSecretVisible(accessKey: string, idx: number) {
  return !!visibleSecrets.value[secretKeyId(accessKey, idx)];
}

function toggleSecret(accessKey: string, idx: number) {
  const id = secretKeyId(accessKey, idx);
  visibleSecrets.value[id] = !visibleSecrets.value[id];
}

// Formatting helpers
function fmtPct(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${v.toFixed(1)}%`;
}

function fmtNum(v?: number | null) {
  if (v == null || !Number.isFinite(v)) return "-";
  return String(v);
}

function fmtNumLimit(v?: number | null) {
  if (v == null) return "Unlimited / not set";
  if (!Number.isFinite(v) || v <= 0) return "Unlimited / not set";
  return String(v);
}

function fmtNumAvailable(remaining?: number | null, max?: number | null) {
  if (max == null || !Number.isFinite(max) || max <= 0) return "Unlimited";
  if (remaining == null || !Number.isFinite(remaining)) return "-";
  return String(remaining);
}

function fmtKiB(kib?: number | null) {
  if (kib == null || !Number.isFinite(kib)) return "-";
  return `${kib} KiB`;
}

function fmtKiBLimit(kib?: number | null) {
  if (kib == null) return "Unlimited / not set";
  if (!Number.isFinite(kib) || kib <= 0) return "Unlimited / not set";
  return `${kib} KiB`;
}

function fmtKiBAvailable(remaining?: number | null, max?: number | null) {
  if (max == null || !Number.isFinite(max) || max <= 0) return "Unlimited";
  if (remaining == null || !Number.isFinite(remaining)) return "-";
  return `${remaining} KiB`;
}
</script>
