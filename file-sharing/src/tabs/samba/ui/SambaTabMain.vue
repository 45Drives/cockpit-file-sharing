<script setup lang="ts">
import { getServer } from "@45drives/houston-common-lib";
import {
  CenteredCardColumn,
  Notification,
  pushNotification,
  wrapActions,
} from "@45drives/houston-common-ui";

import GlobalConfigEditor from "./GlobalConfigEditor.vue";
import ShareListView from "@/tabs/samba/ui/ShareListView.vue";
import { getClusterScope } from "@/common/getClusterScope";

import { onMounted, provide, ref } from "vue";
import { clusterScopeInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";

import { getSambaManager } from "@/tabs/samba/samba-manager";

const _ = cockpit.gettext;

provide(clusterScopeInjectionKey, getClusterScope("ctdb"));
const cephClientName = ref("client.samba");
provide(cephClientNameInjectionKey, cephClientName);

const sambaManager = getServer().map((server) => getSambaManager(server));

const defaultSmbConfPath = "/etc/samba/smb.conf";

const fixSmbConfIncludeRegistry = () =>
  sambaManager.andThen((sm) => sm.patchSmbConfIncludeRegistry(defaultSmbConfPath));

const checkSambaConf = () =>
  sambaManager
    .andThen((sm) => sm.checkIfSmbConfIncludesRegistry(defaultSmbConfPath))
    .map((smbConfHasIncludeRegistry) => {
      if (!smbConfHasIncludeRegistry) {
        pushNotification(
          new Notification(
            _("Samba is Misconfigured"),
            _(
              "'include = registry' is missing from the global section of /etc/samba/smb.conf, which is required for File Sharing to manage shares."
            ),
            "error",
            "never"
          ).addAction(_("Fix now"), async () => {
            await actions.fixSmbConfIncludeRegistry();
          })
        );
      }
    });

const actions = wrapActions({
  fixSmbConfIncludeRegistry,
  checkSambaConf,
});

onMounted(actions.checkSambaConf);
</script>

<template>
  <CenteredCardColumn>
    <GlobalConfigEditor />
    <ShareListView />
  </CenteredCardColumn>
</template>
import { getSambaManager } from '@/tabs/samba/samba-manager'; import { getServer } from
'@45drives/houston-common-lib';
