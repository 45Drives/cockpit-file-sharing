<!-- MinioAccessManagement.vue -->
<template>
  <div class="space-y-4 sm:px-4 lg:px-6 sm:rounded-lg bg-accent rounded-md border border-default">
    <div
      class="grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-well rounded-md shadow text-default my-2 ring-1 ring-black ring-opacity-5 p-4 m-4">
      <!-- Left: back button -->
      <div>
        <button
          type="button"
          class="inline-flex btn-primary items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-default shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950"
          @click="emit('backToViewSelection')"
        >
          <ArrowUturnLeftIcon class="size-icon" />
          Back
        </button>
      </div>

      <!-- Center: title -->
      <div class="flex items-baseline justify-center gap-2">
        <div>
          <h1 class="text-2xl font-semibold text-default">{{ backendLabel }} Access Management</h1>
          <p class="text-xs text-default mt-1">
            Manage users, policies, and groups for this {{ backendLabel }} deployment.
          </p>
        </div>
      </div>

    </div>

    <div class="px-6 py-6 mx-auto box-border">
      <!-- Tab bar -->
      <div class="border-b border-default mb-4 text-sm">
        <nav class="-mb-px flex space-x-4">
          <button
            type="button"
            class="px-3 py-2 border-b-2 font-semibold"
            :class="activeTab === 'users'
              ? 'border-default text-default'
              : 'border-transparent text-muted hover:text-default'"
            @click="activeTab = 'users'"
          >
            Users
          </button>

          <button
            type="button"
            class="px-3 py-2 border-b-2 font-semibold"
            :class="activeTab === 'policies'
              ? 'border-default text-default'
              : 'border-transparent text-muted hover:text-default'"
            @click="activeTab = 'policies'"
          >
            Policies
          </button>

          <button
            type="button"
            class="px-3 py-2 border-b-2 font-semibold"
            :class="activeTab === 'groups'
              ? 'border-default text-default'
              : 'border-transparent text-muted hover:text-default'"
            @click="activeTab = 'groups'"
          >
            {{ isRustfsBackend ? "User groups" : "Groups" }}
          </button>

          <button
            v-if="isRustfsBackend"
            type="button"
            class="px-3 py-2 border-b-2 font-semibold"
            :class="activeTab === 'accessKeys'
              ? 'border-default text-default'
              : 'border-transparent text-muted hover:text-default'"
            @click="activeTab = 'accessKeys'"
          >
            Access keys
          </button>
        </nav>
      </div>

      <!-- Tab content -->
      <div>
        <MinioUsersTable v-if="activeTab === 'users'" :backendLabel="backendLabel" />

        <MinioPoliciesView v-else-if="activeTab === 'policies'" :backendLabel="backendLabel" />

        <MinioGroupsView v-else-if="activeTab === 'groups'" :backendLabel="backendLabel" />

        <S3AccessKeysView v-else-if="activeTab === 'accessKeys' && isRustfsBackend" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";

import MinioUsersTable from "./S3UsersTable.vue";
import MinioPoliciesView from "./S3PoliciesView.vue";
import MinioGroupsView from "./S3GroupsView.vue";
import S3AccessKeysView from "./S3AccessKeysView.vue";
import { ArrowUturnLeftIcon } from "@heroicons/vue/20/solid";

const activeTab = ref<"users" | "policies" | "groups" | "accessKeys">("users");
const emit = defineEmits<{ (e: "backToViewSelection"): void }>();
const props = defineProps<{
  minioAlias?: string | null;
  backendLabel?: string;
}>();
const backendLabel = props.backendLabel?.trim() || "MinIO";
const isRustfsBackend = computed(() => backendLabel.toLowerCase() === "rustfs");
</script>
