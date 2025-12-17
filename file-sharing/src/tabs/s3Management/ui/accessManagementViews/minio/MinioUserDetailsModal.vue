<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
  >
    <div class="bg-accent rounded-lg shadow-lg max-w-lg w-full mx-4">
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
        <button
          class="text-xs px-2 py-1 rounded border border-default bg-secondary hover:bg-gray-50"
          @click="close"
          :disabled="loading"
        >
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
                <span
                  class="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium"
                  :class="user.status === 'enabled'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'"
                >
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
              <span
                v-for="p in user.policies"
                :key="p"
                class="inline-flex items-center rounded-full border border-default bg-default px-2 py-0.5"
              >
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
              <div
                v-for="group in user.memberOf"
                :key="group.name"
                class="border border-default rounded px-2 py-2 bg-default"
              >
                <div class="font-medium">
                  {{ group.name || "(unnamed group)" }}
                </div>
                <div v-if="group.policies && group.policies.length" class="mt-1">
                  <span class="text-sm text-default mb-2">Policies:</span>
                  <div class="mt-0.5 flex flex-wrap gap-1">
                    <span
                      v-for="p in group.policies"
                      :key="group.name + ':' + p"
                      class="inline-flex items-center rounded-full border border-default bg-accent px-2 py-0.5"
                    >
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
        </div>

        <div v-else class="text-xs text-default">
          No user selected.
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { MinioUserDetails } from "@/tabs/s3Management/types/types";

const props = defineProps<{
  modelValue: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  user: MinioUserDetails | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

function close() {
  emit("update:modelValue", false);
}
</script>
