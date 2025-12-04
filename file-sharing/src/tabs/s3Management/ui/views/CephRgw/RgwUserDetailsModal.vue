<template>
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
    >
      <div
        class="bg-default rounded-lg shadow-xl max-w-2xl w-full mx-4 overflow-hidden border border-gray-200"
      >
        <!-- Header -->
        <div
          class="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-accent"
        >
          <div class="flex items-center space-x-3">
            <div
              class="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 uppercase"
            >
              {{ userInitials }}
            </div>
            <div class="space-y-0.5">
              <h3 class="text-base font-semibold">
                User details
              </h3>
              <p class="text-xs text-default">
                {{ user?.uid || "No user selected" }}
                <span v-if="user?.tenant" class="text-gray-400">
                  · Tenant: {{ user.tenant }}
                </span>
              </p>
            </div>
          </div>
  
          <button
            class="text-xs px-3 py-1.5 rounded border border-gray-300 bg-secondary hover:bg-gray-100"
            @click="close"
            :disabled="loading"
          >
            Close
          </button>
        </div>
  
        <!-- Body -->
        <div class="px-5 py-4 space-y-4 text-sm max-h-[70vh] overflow-y-auto">
          <!-- States -->
          <div v-if="loading" class="text-gray-600 text-sm">
            Loading user details…
          </div>
  
          <div v-else-if="errorMessage" class="text-xs text-red-600">
            {{ errorMessage }}
          </div>
  
          <div v-else-if="user">
            <!-- Top summary badges -->
            <div class="flex flex-wrap items-center gap-2 text-[11px] mb-1">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 border text-xs"
                :class="user.suspended
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'"
              >
                <span
                  class="mr-1 h-1.5 w-1.5 rounded-full"
                  :class="user.suspended ? 'bg-red-500' : 'bg-emerald-500'"
                ></span>
                {{ user.suspended ? "Suspended" : "Active" }}
              </span>
  
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 border border-gray-200 bg-accent text-gray-700"
              >
                Max buckets:
                <span class="ml-1 font-medium">{{ user.maxBuckets ?? "default" }}</span>
              </span>
  
              <span
                v-if="user.capacityLimitPercent != null"
                class="inline-flex items-center rounded-full px-2 py-0.5 border border-gray-200 bg-accent text-gray-700"
              >
                Quota size:
                <span class="ml-1 font-medium">{{ user.capacityLimitPercent }} KiB</span>
              </span>
  
              <span
                v-if="user.objectLimitPercent != null"
                class="inline-flex items-center rounded-full px-2 py-0.5 border border-gray-200 bg-accent text-gray-700"
              >
                Quota objects:
                <span class="ml-1 font-medium">{{ user.objectLimitPercent }}</span>
              </span>
            </div>
  
            <!-- Basic information -->
            <section class="mt-2">
              <h4 class="text-xs font-semibold uppercase text-default mb-2">
                Basic information
              </h4>
              <div
                class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs bg-accent border border-gray-200 rounded-lg px-3 py-3"
              >
                <div>
                  <div class="text-default">Username</div>
                  <div class="font-medium  break-all">
                    {{ user.uid }}
                  </div>
                </div>
                <div>
                  <div class="text-default">Tenant</div>
                  <div class="font-medium ">
                    {{ user.tenant || "-" }}
                  </div>
                </div>
                <div>
                  <div class="text-default">Full name</div>
                  <div class="font-medium ">
                    {{ user.displayName || "-" }}
                  </div>
                </div>
                <div>
                  <div class="text-default">Email</div>
                  <div class="font-medium  break-all">
                    {{ user.email || "-" }}
                  </div>
                </div>
              </div>
            </section>
  
            <!-- Quotas -->
            <section class="mt-4">
              <h4 class="text-xs font-semibold uppercase text-default mb-2">
                Quotas (user-level)
              </h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div class="border border-gray-200 rounded-lg px-3 py-2 ">
                  <div class="text-default mb-1">
                    Max size
                    <span class="text-[10px] ">(KiB)</span>
                  </div>
                  <div class="font-medium ">
                    {{ user.capacityLimitPercent ?? "-" }}
                  </div>
                </div>
                <div class="border border-gray-200 rounded-lg px-3 py-2 ">
                  <div class="text-default mb-1">
                    Max objects
                  </div>
                  <div class="font-medium ">
                    {{ user.objectLimitPercent ?? "-" }}
                  </div>
                </div>
              </div>
            </section>
  
            <!-- Keys -->
            <section class="mt-4" v-if="user.keys && user.keys.length">
              <div class="flex items-center justify-between mb-1">
                <h4 class="text-xs font-semibold uppercase text-default">
                  S3 access keys
                </h4>
                <p class="text-[10px] ">
                  Secret keys are shown only if available from the API.
                </p>
              </div>
  
              <div class="space-y-2 text-xs">
                <div
                  v-for="(k, idx) in user.keys"
                  :key="k.accessKey + ':' + idx"
                  class="border border-gray-200 rounded-lg px-3 py-2 "
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="truncate">
                      <span class="">Access key</span>
                      <div class="font-mono text-[11px] break-all">
                        {{ k.accessKey }}
                      </div>
                    </div>
                    <span
                      class="inline-flex items-center rounded-full px-2 py-0.5 border border-gray-200 bg-accent text-[10px] text-gray-600 shrink-0"
                    >
                      Key {{ idx + 1 }}
                    </span>
                  </div>
  
                  <div v-if="k.secretKey" class="mt-2">
                    <span >Secret key</span>
                    <div class="font-mono text-[11px] break-all">
                      {{ k.secretKey }}
                    </div>
                  </div>
  
                  <div v-if="k.user" class="mt-1 text-[11px] text-gray-600">
                    <span >User:</span>
                    <span class="ml-1">{{ k.user }}</span>
                  </div>
                </div>
              </div>
            </section>
  
            <!-- Capabilities -->
            <section class="mt-4" v-if="user.caps && user.caps.length">
              <h4 class="text-xs font-semibold uppercase text-default mb-2">
                Capabilities
              </h4>
              <div class="border border-gray-200 rounded-lg overflow-hidden ">
                <table class="min-w-full border-collapse text-xs">
                  <thead class="bg-accent">
                    <tr>
                      <th class="border-b border-gray-200 px-3 py-1.5 text-left font-semibold">
                        Type
                      </th>
                      <th class="border-b border-gray-200 px-3 py-1.5 text-left font-semibold">
                        Permissions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(c, idx) in user.caps"
                      :key="c.type + ':' + c.perm + ':' + idx"
                      class=" even:bg-accent"
                    >
                      <td class="border-b border-gray-200 px-3 py-1.5">
                        {{ c.type }}
                      </td>
                      <td class="border-b border-gray-200 px-3 py-1.5">
                        {{ c.perm }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
  
          <div v-else class="text-xs ">
            No user selected.
          </div>
        </div>
      </div>
    </div>
</template>
  
  <script lang="ts" setup>
  import { computed } from "vue";
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
  
    const name =
      props.user.displayName ||
      props.user.uid ||
      "";
  
    const parts = name
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  });
  </script>
  