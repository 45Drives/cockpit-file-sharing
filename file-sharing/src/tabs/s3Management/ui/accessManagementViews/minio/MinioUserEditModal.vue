<template>
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
    >
      <div class="bg-accent rounded-lg shadow-lg max-w-lg w-full mx-4">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 class="text-base font-semibold">
            Edit user "{{ user?.username }}"
          </h3>
          <button
            class="text-xs text-gray-500 hover:text-gray-700"
            @click="$emit('update:modelValue', false)"
            :disabled="loading"
          >
            Close
          </button>
        </div>
  
        <!-- Body -->
        <div class="px-5 py-4 space-y-4 text-sm">
          <div
            v-if="errorMessage"
            class="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {{ errorMessage }}
          </div>
  
          <div v-if="loading">
            Updating user...
          </div>
  
          <div v-else class="space-y-4">
            <!-- Status + basic info -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500">Username</p>
                <p class="text-sm font-medium">{{ user?.username }}</p>
              </div>
  
              <label class="flex items-center space-x-2 text-xs">
                <input
                  type="checkbox"
                  v-model="localStatusEnabled"
                />
                <span>Enabled</span>
              </label>
            </div>
  
            <!-- Access: Policies / Groups tabs -->
            <section class="space-y-2">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-semibold uppercase text-gray-500">
                  Access
                </h4>
              </div>
  
              <!-- Tabs -->
              <div class="flex border-b border-gray-200 mb-2 text-xs">
                <button
                  type="button"
                  class="px-3 py-1.5 -mb-px border-b-2"
                  :class="activeAccessTab === 'policies'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'"
                  @click="activeAccessTab = 'policies'"
                >
                  Policies
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 -mb-px border-b-2"
                  :class="activeAccessTab === 'groups'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'"
                  @click="activeAccessTab = 'groups'"
                >
                  Groups
                </button>
              </div>
  
              <!-- Policies pane -->
              <div v-if="activeAccessTab === 'policies'">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[11px] text-gray-500">
                    Attach one or more MinIO policies
                  </span>
                  <span class="text-[11px] text-gray-400">
                    Selected: {{ localPolicies.length }}
                  </span>
                </div>
  
                <div class="border rounded px-2 py-2 max-h-40 overflow-y-auto bg-secondary">
                  <label
                    v-for="p in availablePolicies"
                    :key="p"
                    class="flex items-center space-x-2 text-xs mb-1"
                  >
                    <input
                      type="checkbox"
                      :value="p"
                      v-model="localPolicies"
                    />
                    <span>{{ p }}</span>
                  </label>
  
                  <p
                    v-if="!availablePolicies.length"
                    class="text-xs italic text-gray-500"
                  >
                    No policies available.
                  </p>
                </div>
                <p class="text-[11px] text-gray-500 mt-1">
                  Policies control which buckets and actions this user is allowed to access.
                </p>
              </div>
  
              <!-- Groups pane -->
              <div v-else>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[11px] text-gray-500">
                    Attach user to one or more MinIO groups
                  </span>
                  <span class="text-[11px] text-gray-400">
                    Selected: {{ localGroups.length }}
                  </span>
                </div>
  
                <div class="border rounded px-2 py-2 max-h-40 overflow-y-auto bg-secondary">
                  <label
                    v-for="g in availableGroups"
                    :key="g"
                    class="flex items-center space-x-2 text-xs mb-1"
                  >
                    <input
                      type="checkbox"
                      :value="g"
                      v-model="localGroups"
                    />
                    <span>{{ g }}</span>
                  </label>
  
                  <p
                    v-if="!availableGroups.length"
                    class="text-xs italic text-gray-500"
                  >
                    No groups available.
                  </p>
                </div>
                <p class="text-[11px] text-gray-500 mt-1">
                  Groups let you manage shared access for multiple users at once.
                </p>
              </div>
            </section>
  
            <!-- Reset secret toggle -->
            <div class="border-t border-gray-200 pt-3">
              <label class="flex items-center space-x-2 text-xs">
                <input
                  type="checkbox"
                  v-model="resetSecret"
                />
                <span>Reset user secret key</span>
              </label>
  
              <p class="text-[11px] text-gray-500 mt-1">
                If enabled, the user will need to use the new secret key to access MinIO.
              </p>
  
              <!-- New secret controls -->
              <div
                v-if="resetSecret"
                class="mt-3 border rounded px-3 py-3 bg-secondary space-y-2"
              >
                <label class="block text-xs font-semibold mb-1">
                  New secret key
                </label>
  
                <input
                  type="text"
                  class="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  v-model="localSecret"
                  placeholder="Enter a secret key or generate one"
                />
  
                <div class="flex items-center justify-between mt-2">
                  <button
                    type="button"
                    class="inline-flex items-center border border-blue-600 bg-blue-600 text-white text-[11px] font-medium rounded px-2.5 py-1 hover:bg-blue-700 disabled:opacity-60"
                    @click="generateSecret"
                  >
                    Generate key
                  </button>
                  <p class="text-[11px] text-gray-600 text-right max-w-xs">
                    If left empty, the backend can generate a random secret. If you provide a value here, that exact secret will be set.
                  </p>
                </div>
              </div>
            </div>
  
            <p class="text-[11px] text-gray-500">
              Username and creation date cannot be changed.
            </p>
          </div>
        </div>
  
        <!-- Footer -->
        <div class="px-5 py-3 border-t border-gray-200 flex justify-end space-x-2 bg-secondary">
          <button
            class="px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50"
            @click="$emit('update:modelValue', false)"
            :disabled="loading"
          >
            Cancel
          </button>
          <button
            class="px-3 py-1.5 text-xs rounded border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            @click="onSubmit"
            :disabled="loading || !user"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
</template>
  
  <script lang="ts" setup>
  import { computed, ref, watch } from "vue";
  import type { MinioUserDetails, MinioUserUpdatePayload } from "@/tabs/s3Management/types/types";
  
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
  
  const localPolicies = ref<string[]>([]);
  const localGroups = ref<string[]>([]);
  const localStatusEnabled = ref(true);
  const resetSecret = ref(false);
  const localSecret = ref("");
  const activeAccessTab = ref<"policies" | "groups">("policies");
  
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
  },
  { immediate: true }
);
  
  const errorMessage = computed(() => props.errorMessage);
  
  function generateSecret() {
    const length = 32;
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i += 1) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    localSecret.value = result;
  }
  
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

  </script>
  