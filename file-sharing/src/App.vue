<script setup lang="ts">
import { HoustonAppContainer, Modal } from "@45drives/houston-common-ui";
import { SambaTabMain } from "@/tabs/samba/ui";
import { NFSTabMain } from "@/tabs/nfs/ui";
import UserSettingsView from "@/common/ui/UserSettingsView.vue";
import { ref } from "vue";
import { Cog8ToothIcon } from "@heroicons/vue/20/solid";

const appVersion = __APP_VERSION__;

const showUserSettings = ref(false);
</script>

<template>
  <HoustonAppContainer
    moduleName="File Sharing"
    :appVersion="appVersion"
    sourceURL="https://github.com/45Drives/cockpit-file-sharing"
    issuesURL="https://github.com/45Drives/cockpit-file-sharing/issues"
    :tabs="[
      {
        label: 'Samba',
        component: SambaTabMain,
      },
      {
        label: 'NFS',
        component: NFSTabMain,
      },
    ]"
  >
    <template #bottomRightButtonIcons>
      <button @click="showUserSettings = true">
        <Cog8ToothIcon class="size-icon icon-default" />
      </button>
    </template>
  </HoustonAppContainer>
  <Modal :show="showUserSettings">
    <UserSettingsView @close="showUserSettings = false" />
  </Modal>
</template>
