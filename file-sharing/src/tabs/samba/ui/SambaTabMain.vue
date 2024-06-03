<script setup lang="ts">
import { getServer, Download } from "@45drives/houston-common-lib";
import {
  CenteredCardColumn,
  Notification,
  pushNotification,
  wrapActions,
  CardContainer,
  FileUploadButton,
  assertConfirm,
} from "@45drives/houston-common-ui";

import GlobalConfigEditor from "./GlobalConfigEditor.vue";
import ShareListView from "@/tabs/samba/ui/ShareListView.vue";
import { getClusterScope } from "@/common/getClusterScope";

import { onMounted, provide, ref } from "vue";
import { clusterScopeInjectionKey, cephClientNameInjectionKey } from "@/common/injectionKeys";

import { getSambaManager } from "@/tabs/samba/samba-manager";

import { ResultAsync, ok, err } from "neverthrow";

const _ = cockpit.gettext;

provide(clusterScopeInjectionKey, getClusterScope("ctdb"));
const cephClientName = ref("client.samba");
provide(cephClientNameInjectionKey, cephClientName);

const server = getServer();

const sambaManager = server.map((server) => getSambaManager(server));

const defaultSmbConfPath = "/etc/samba/smb.conf";

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

const fixSmbConfIncludeRegistry = () =>
  sambaManager.andThen((sm) => sm.patchSmbConfIncludeRegistry(defaultSmbConfPath));

const uploadRef = ref<InstanceType<typeof FileUploadButton> | null>(null);

const importConfig = () =>
  assertConfirm({
    header: _("Overwrite current configuration?"),
    body: _("Any sections in uploaded file will overwrite current configuration sections."),
    dangerous: true,
  })
    .andThen(() => {
      if (uploadRef.value === null) {
        return err(new Error("uploadRef was null!"));
      }
      return uploadRef.value.getUpload();
    })
    .andThen(([file]) => (file === undefined ? err(new Error("No file given")) : ok(file)))
    .andThen((file) => ResultAsync.fromSafePromise(file.text()))
    .andThen((newConfigContents) =>
      sambaManager.andThen((sm) => sm.importConfig(newConfigContents))
    );

const exportConfig = () =>
  sambaManager
    .andThen((sm) => sm.exportConfig())
    .map((config) =>
      Download.content(
        [config],
        `cockpit-file-sharing_samba_exported_${new Date()
          .toISOString()
          .replace(/:/g, "-")
          .replace(/T/, "_")}.conf`
      )
    );

const actions = wrapActions({
  checkSambaConf,
  fixSmbConfIncludeRegistry,
  importConfig,
  exportConfig,
});

onMounted(actions.checkSambaConf);
</script>

<template>
  <CenteredCardColumn>
    <GlobalConfigEditor />
    <ShareListView />
    <CardContainer>
      <template #header>
        {{ _("Import/Export Config") }}
      </template>
      <div class="button-group-row">
        <button class="btn btn-primary" @click="actions.importConfig">
          {{ _("Import") }}
        </button>
        <button class="btn btn-primary" @click="actions.exportConfig">
          {{ _("Export") }}
        </button>
        <FileUploadButton hidden accept=".conf" ref="uploadRef" @upload="" />
      </div>
    </CardContainer>
  </CenteredCardColumn>
</template>
