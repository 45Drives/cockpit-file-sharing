<template>
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
        <!-- <button
          class="btn btn-secondary flex flex-row items-baseline gap-1"
          @click="actions.importFromSmbConf"
        >
          <span>
            {{ _("Import configuration from") }}
          </span>
          <span class="font-mono">
            {{ smbConfPath }}
          </span>
          <ToolTip class="self-center" above>
            {{
              _(
                "File Sharing uses Samba's net registry to configure shares. " +
                  "Click this button to import configuration from /etc/samba/smb.conf into the net registry for management."
              )
            }}
          </ToolTip>
        </button> -->

        <FileUploadButton hidden accept=".conf" ref="uploadRef" @upload="" />
      </div>
    </CardContainer>
</template>

<script setup lang="ts">
    import {
        CenteredCardColumn,
        Notification,
        pushNotification,
        wrapActions,
        CardContainer,
        FileUploadButton,
        assertConfirm,
        reportSuccess,
        computedResult,
        ToolTip,
        wrapAction,
    } from "@45drives/houston-common-ui";
    import { ConfigurationManager } from "../../types/ConfigurationManager";
    import { Download, getServer } from "@45drives/houston-common-lib";
    import { ref } from "vue";
    import { ResultAsync, err, ok } from "neverthrow";

    const _ = cockpit.gettext;

    const configurationManager = createConfigurationManager();

    const emit = defineEmits(['configUpdated']);

    function createConfigurationManager() {
        return getServer().map((server) => {
            return new ConfigurationManager(server);
        })
    }

    const exportConfig = () =>
        configurationManager
        .andThen((manager) => manager.exportConfiguration())
        .map((configString) => 
            Download.content(
            [configString],
                `cockpit-file-sharing_iSCSI_exported_${new Date()
                    .toISOString()
                    .replace(/:/g, "-")
                    .replace(/T/, "_")}.conf`
                )
            );


    const uploadRef = ref<InstanceType<typeof FileUploadButton> | null>(null);
    
    const importConfig = () =>
        assertConfirm({
            header: _("Overwrite current configuration?"),
            body: _(
            "The current iSCSI configuration will be force updated to the provided configuration file, discarding the existing configuration. \n\nYou should export a copy of your config first."
            ),
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
            .andThen((newConfigContents) => configurationManager.andThen((manager) => manager.importConfiguration(newConfigContents)))
            .map(() => {
                    emit('configUpdated');
                    return reportSuccess(_("Imported configuration"))
                });

    const actions = wrapActions({exportConfig, importConfig});

</script>