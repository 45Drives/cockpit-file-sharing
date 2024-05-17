<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import type { SambaGlobalConfig } from '@/tabs/samba/data-types';
import {
    InputField,
    ToggleSwitch,
    ToggleSwitchGroup,
    CardContainer,
    ParsedTextArea,
    Disclosure,
    SelectMenu,
    useTempObjectStaging,
    wrapActions,
    reportSuccess,
    type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { getServer, KeyValueSyntax } from '@45drives/houston-common-lib';
import { BooleanKeyValueSuite } from '@/tabs/samba/ui/BooleanKeyValueSuite'; // TODO: move to common-ui
import { SambaManager } from '@/tabs/samba/samba-manager';

const _ = cockpit.gettext;

const globalConf = ref<SambaGlobalConfig>();

const { tempObject: tempGlobalConfig, modified, resetChanges } = useTempObjectStaging(globalConf);

const revealAdvancedTextarea = ref(false);

const macOSSharesOptions = BooleanKeyValueSuite(() => tempGlobalConfig.value?.advancedOptions ?? {}, {
    "fruit:encoding": "native",
    "fruit:metadata": "stream",
    "fruit:zero_file_id": "yes",
    "fruit:nfs_aces": "no",
    "vfs objects": "catia fruit streams_xattr",
});

const logLevelOptions: SelectMenuOption<number>[] = [5, 4, 3, 2, 1, 0].map(n => ({ label: n.toString(), value: n }));

const loadGlobalSettings = () =>
    getServer()
        .andThen(SambaManager.getGlobalConfig)
        .map(config => globalConf.value = config);

const applyGlobalSettings = (newSettings: SambaGlobalConfig) =>
    getServer()
        .andThen(server =>
            SambaManager.editGlobal(server, newSettings))
        .andThen(() => loadGlobalSettings())
        .map(() => reportSuccess(_("Updated global Samba configuration.")));

const actions = wrapActions({
    loadGlobalSettings,
    applyGlobalSettings,
});

onMounted(actions.loadGlobalSettings);

watch(() => tempGlobalConfig.value?.advancedOptions ?? {}, (advOpts) => {
    if (Object.entries(advOpts).length) {
        revealAdvancedTextarea.value = true;
    }
}, { deep: true });

</script>

<template>
    <CardContainer>
        <template v-slot:header>
            {{ _("Global Configuration") }}
            <span
                v-if="modified"
                class="ml-1"
            > *</span>
        </template>

        <div
            v-if="tempGlobalConfig"
            class="space-y-content"
        >
            <InputField
                :placeholder="_('Description of server')"
                v-model="tempGlobalConfig.serverString"
            >
                {{ _("Server Description") }}
            </InputField>
            <InputField
                label="Workgroup"
                placeholder="WORKGROUP"
                v-model="tempGlobalConfig.workgroup"
            >
                {{ _("Workgroup") }}
            </InputField>
            <ToggleSwitchGroup>
                <ToggleSwitch v-model="macOSSharesOptions">
                    {{ _("Global MacOS Shares") }}
                    <template v-slot:description>
                        {{ _("Optimize all shares for MacOS") }}
                    </template>
                </ToggleSwitch>
            </ToggleSwitchGroup>
            <SelectMenu
                v-model="tempGlobalConfig.logLevel"
                :options="logLevelOptions"
            >
                {{ _("Log Level") }}
            </SelectMenu>
            <Disclosure v-model:show="revealAdvancedTextarea">
                <template v-slot:label>
                    {{ _("Advanced") }}
                </template>
                <ParsedTextArea
                    :parser="KeyValueSyntax({ trailingNewline: false })"
                    v-model="tempGlobalConfig.advancedOptions"
                />
            </Disclosure>
        </div>

        <template v-slot:footer>
            <div class="button-group-row justify-end grow">
                <button
                    class="btn btn-secondary"
                    @click="resetChanges"
                    v-if="modified"
                >{{ _("Cancel") }}</button>
                <button
                    class="btn btn-primary"
                    @click="() => tempGlobalConfig && actions.applyGlobalSettings(tempGlobalConfig)"
                    :disabled="!modified"
                >{{ _("Apply") }}</button>
            </div>
        </template>
    </CardContainer>
</template>
