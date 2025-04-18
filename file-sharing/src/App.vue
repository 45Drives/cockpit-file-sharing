<script setup lang="ts">
import {
  HoustonAppContainer,
  Modal,
  type HoustonAppTabEntry,
  globalProcessingWrapPromise,
  CardContainer,
  CenteredCardColumn,
} from "@45drives/houston-common-ui";
import { SambaTabMain } from "@/tabs/samba/ui";
import ISCSITabMain from "@/tabs/iSCSI/ui/ISCSITabMain.vue";
import { NFSTabMain } from "@/tabs/nfs/ui";
import UserSettingsView from "@/common/ui/UserSettingsView.vue";
import { ref, computed, watchEffect, type WatchStopHandle, onUnmounted, watch } from "vue";
import { Cog8ToothIcon } from "@heroicons/vue/20/solid";
import { useUserSettings } from "@/common/user-settings";
import { type ResultAsync, ok } from "neverthrow";
import { BashCommand, Directory, getServer } from "@45drives/houston-common-lib";

const _ = cockpit.gettext;

const appVersion = __APP_VERSION__;

const showUserSettings = ref(false);

const showSambaTab = ref(true);
const showNfsTab = ref(true);
const showIscsiTab = ref(true);

const sambaConfigured = (): ResultAsync<boolean, never> => {
  return getServer()
    .andThen((server) => server.execute(new BashCommand("command -v net")))
    .map((_) => true)
    .orElse((_) => ok(false));
};

const nfsConfigured = (): ResultAsync<boolean, never> => {
  return getServer()
    .andThen((server) => server.execute(new BashCommand("command -v exportfs")))
    .map((_) => true)
    .orElse((_) => ok(false));
};

const iscsiConfigured = (): ResultAsync<boolean, never> => {
  return getServer()
    .andThen((server) => new Directory(server, "/sys/kernel/scst_tgt").exists())
    .orElse((_) => ok(false));
};

let watchStopHandle: WatchStopHandle;

globalProcessingWrapPromise(useUserSettings(true)).then((userSettings) => {
  watchStopHandle = watch(
    userSettings,
    (userSettings) => {
      switch (userSettings.samba.tabVisibility) {
        case "always":
          showSambaTab.value = true;
          break;
        case "never":
          showSambaTab.value = false;
          break;
        case "auto":
          globalProcessingWrapPromise(
            sambaConfigured()
              .map((value) => (showSambaTab.value = value))
              .unwrapOr(null)
          );
          break;
      }
      switch (userSettings.nfs.tabVisibility) {
        case "always":
          showNfsTab.value = true;
          break;
        case "never":
          showNfsTab.value = false;
          break;
        case "auto":
          globalProcessingWrapPromise(
            nfsConfigured()
              .map((value) => (showNfsTab.value = value))
              .unwrapOr(null)
          );
          break;
      }
      switch (userSettings.iscsi.tabVisibility) {
        case "always":
          showIscsiTab.value = true;
          break;
        case "never":
          showIscsiTab.value = false;
          break;
        case "auto":
          globalProcessingWrapPromise(
            iscsiConfigured()
              .map((value) => (showIscsiTab.value = value))
              .unwrapOr(null)
          );
          break;
      }
    },
    { immediate: true }
  );
});

onUnmounted(() => watchStopHandle?.());

const visibleTabs = computed<HoustonAppTabEntry[]>(() => [
  ...(showSambaTab.value
    ? [
        {
          label: "Samba",
          component: SambaTabMain,
        },
      ]
    : []),
  ...(showNfsTab.value
    ? [
        {
          label: "NFS",
          component: NFSTabMain,
        },
      ]
    : []),
  ...(showIscsiTab.value
    ? [
        {
          label: "iSCSI",
          component: ISCSITabMain,
        },
      ]
    : []),
]);
</script>

<template>
  <HoustonAppContainer
    moduleName="File Sharing"
    :appVersion="appVersion"
    sourceURL="https://github.com/45Drives/cockpit-file-sharing"
    issuesURL="https://github.com/45Drives/cockpit-file-sharing/issues"
    :tabs="visibleTabs"
  >
    <template v-if="visibleTabs.length === 0">
      <CenteredCardColumn>
        <CardContainer>
          <template #header>
            {{ _("No tabs to be displayed") }}
          </template>
          {{
            _(
              'Make sure at least one of samba, nfs, or scst are installed, or set the tab visibility to "Always Show" in the bottom-right settings menu.'
            )
          }}
        </CardContainer>
      </CenteredCardColumn>
    </template>
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
