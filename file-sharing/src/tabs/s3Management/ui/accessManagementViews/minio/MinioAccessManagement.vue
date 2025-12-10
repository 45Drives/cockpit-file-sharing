<!-- MinioAccessManagement.vue -->
<template>
    <div class="px-6 py-6 mx-auto box-border">
      <!-- Page header -->
      <header class="mb-4 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold">MinIO Access Management</h1>
          <p class="text-xs text-gray-500 mt-1">
            Manage users, policies, and groups for this MinIO deployment.
          </p>
        </div>
      </header>
  
      <!-- Tab bar -->
      <div class="border-b border-gray-200 mb-4 text-sm">
        <nav class="-mb-px flex space-x-4">
          <button
            type="button"
            class="px-3 py-2 border-b-2"
            :class="
              activeTab === 'users'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            "
            @click="activeTab = 'users'"
          >
            Users
          </button>
  
          <button
            type="button"
            class="px-3 py-2 border-b-2"
            :class="
              activeTab === 'policies'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            "
            @click="activeTab = 'policies'"
          >
            Policies
          </button>
  
          <button
            type="button"
            class="px-3 py-2 border-b-2"
            :class="
              activeTab === 'groups'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            "
            @click="activeTab = 'groups'"
          >
            Groups
          </button>
        </nav>
      </div>
  
      <!-- Tab content -->
      <div>
        <MinioUsersTable v-if="activeTab === 'users'" />
  
        <MinioPoliciesView v-else-if="activeTab === 'policies'" />
  
        <MinioGroupsView v-else />
      </div>
    </div>
</template>
  
  <script lang="ts" setup>
  import { ref } from "vue";
  
  // Your existing users page/table:
  import MinioUsersTable from "./MinioUsersTable.vue";
    import MinioPoliciesView from "./MinioPoliciesView.vue";
  import MinioGroupsView from "./MinioGroupsView.vue";
  
  const activeTab = ref<"users" | "policies" | "groups">("users");
  </script>
  