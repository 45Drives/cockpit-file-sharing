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
      </div>
    </CardContainer>
</template>

<script setup lang="ts">
    import {
        wrapActions,
        CardContainer,
        assertConfirm,
        reportSuccess
    } from "@45drives/houston-common-ui";
    import { ConfigurationManager } from "../../../types/ConfigurationManager";
    import { Download, Upload, getServer } from "@45drives/houston-common-lib";

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
            Download.text(
            configString,
                `cockpit-file-sharing_iSCSI_exported_${new Date()
                    .toISOString()
                    .replace(/:/g, "-")
                    .replace(/T/, "_")}.conf`
                )
            );

    
    const importConfig = () =>
        assertConfirm({
            header: _("Overwrite current configuration?"),
            body: _(
            "The current iSCSI configuration will be force updated to the provided configuration file, discarding the existing configuration. \n\nYou should export a copy of your config first."
            ),
            dangerous: true,
        })
            .andThen(() => Upload.text(".conf"))
            .andThen((newConfigContents) => configurationManager.andThen((manager) => manager.importConfiguration(newConfigContents)))
            .map(() => {
                    emit('configUpdated');
                    return reportSuccess(_("Imported configuration"))
                });

    const actions = wrapActions({exportConfig, importConfig});

</script>