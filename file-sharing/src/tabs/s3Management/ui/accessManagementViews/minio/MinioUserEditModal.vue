<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div class="bg-accent rounded-lg shadow-lg max-w-lg w-full mx-4">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-default flex items-center justify-between">
        <h3 class="text-base font-semibold">
          Edit user "{{ user?.username }}"
        </h3>

      </div>

      <!-- Body -->
      <div class="px-5 py-4 space-y-4 text-sm">
        <div v-if="errorMessage" class="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {{ errorMessage }}
        </div>

        <div v-if="loading">
          Updating user...
        </div>

        <div v-else class="space-y-4">
          <!-- Status + basic info -->
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-default">Username</p>
              <p class="text-sm font-medium">{{ user?.username }}</p>
            </div>

            <label class="flex items-center space-x-2 text-xs">
              <input type="checkbox" v-model="localStatusEnabled" />
              <span>Enabled</span>
            </label>
          </div>

          <!-- Access: Policies / Groups tabs -->
          <section class="space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-semibold uppercase text-default">
                Access
              </h4>
            </div>

            <!-- Tabs -->
            <div class="flex border-b border-default mb-2 text-xs">
              <button type="button" class="px-3 py-1.5 -mb-px border-b-2" :class="activeAccessTab === 'policies'
                ? 'border-default text-default font-medium'
                : 'border-transparent text-secondary hover:text-default'" @click="activeAccessTab = 'policies'">
                Policies
              </button>
              <button type="button" class="px-3 py-1.5 -mb-px border-b-2" :class="activeAccessTab === 'groups'
                ? 'border-default text-default font-medium'
                : 'border-transparent text-secondary hover:text-gray-700'" @click="activeAccessTab = 'groups'">
                Groups
              </button>
            </div>

            <!-- Policies pane -->
            <div v-if="activeAccessTab === 'policies'">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm text-default">
                  Attach one or more MinIO policies
                </span>
                <span class="text-sm text-default">
                  Selected: {{ localPolicies.length }}
                </span>
              </div>

              <div class="border border-default rounded px-2 py-2 max-h-40 overflow-y-auto bg-default">
                <label v-for="p in availablePolicies" :key="p"
                  class="flex items-center space-x-2 text-xs mb-1 border-b border-default">
                  <input type="checkbox" :value="p" v-model="localPolicies" class="bg-default" />
                  <span>{{ p }}</span>
                </label>

                <p v-if="!availablePolicies.length" class="text-xs italic text-default">
                  No policies available.
                </p>
              </div>
              <p class="text-sm text-default mt-1">
                Policies control which buckets and actions this user is allowed to access.
              </p>
            </div>

            <!-- Groups pane -->
            <div v-else>
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-default">
                  Attach user to one or more MinIO groups
                </span>
                <span class="text-sm text-default">
                  Selected: {{ localGroups.length }}
                </span>
              </div>

              <div class="border border-default rounded px-2 py-2 max-h-40 overflow-y-auto bg-default">
                <label v-for="g in availableGroups" :key="g" class="flex items-center space-x-2 text-xs mb-1">
                  <input type="checkbox bg-default" :value="g" v-model="localGroups" />
                  <span>{{ g }}</span>
                </label>

                <p v-if="!availableGroups.length" class="text-xs italic text-default">
                  No groups available.
                </p>
              </div>
              <p class="text-sm text-default mt-1">
                Groups let you manage shared access for multiple users at once.
              </p>
            </div>
          </section>

          <!-- Reset secret toggle -->
          <div class="border-t border-default pt-3">
            <label class="flex items-center space-x-2 text-sm">
              <input type="checkbox" v-model="resetSecret" class="bg-default" />
              <span>Reset user secret key</span>
            </label>

            <p class="text-xs text-default mt-1">
              If enabled, the user will need to use the new secret key to access MinIO.
            </p>

            <!-- New secret controls -->
            <div v-if="resetSecret" class="mt-3 border border-default rounded px-3 py-3 bg-default space-y-2">
              <label class="block text-xs font-semibold mb-1">
                New secret key
              </label>

              <input type="text"
                class="w-full border rounded bg-default text-default px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                v-model="localSecret" placeholder="Enter a secret key or generate one" />

              <div class="flex items-center justify-between mt-2">
                <button type="button"
                  class="inline-flex items-center border border-default bg-primary text-default text-sm font-medium rounded px-2.5 py-1 hover:bg-primary disabled:opacity-60"
                @click="localSecret = generateSecret()">
                  Generate key
                </button>
                <p class="text-xs text-muted text-right max-w-xs">
                  If left empty, the backend can generate a random secret. If you provide a value here, that exact
                  secret will be set.
                </p>
              </div>
            </div>
          </div>

          <p class="text-sm text-default font-semibold">
            Username cannot be changed.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-3 border-t border-default flex justify-end space-x-2">
        <button class="px-3 py-1.5 text-xs rounded border border-default bg-primary hover:bg-gray-50"
          @click="$emit('update:modelValue', false)" :disabled="loading">
          Cancel
        </button>
        <button
          class="px-3 py-1.5 text-xs rounded border border-default bg-danger text-default hover:bg-danger disabled:opacity-60"
          @click="onSubmit" :disabled="loading || !user">
          Save changes
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import type { MinioUserDetails, MinioUserUpdatePayload } from "@/tabs/s3Management/types/types";
import { generateSecret } from "@/tabs/s3Management/bucketBackends/bucketUtils";

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