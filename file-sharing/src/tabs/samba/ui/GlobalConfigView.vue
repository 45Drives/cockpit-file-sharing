<script setup lang="ts">
import { InputField } from "@/common/ui";
import type { SambaGlobalConfig } from '@/tabs/samba/data-types';
import { ref, onMounted } from 'vue';
import { CardContainer, useTempObjectStaging, ParsedTextArea, defineActions } from "@45drives/houston-common-ui";
import { getServer, KeyValueSyntax } from '@45drives/houston-common-lib';
import { SambaManager } from '@/tabs/samba/samba-manager';
import { err } from "neverthrow";

const globalConf = ref<SambaGlobalConfig>();

const { tempObject: tempGlobalConfig, modified, resetChanges } = useTempObjectStaging(globalConf);

const loadGlobalSettings = () =>
    getServer()
        .andThen(SambaManager.getGlobalConfig)
        .map(config => globalConf.value = config);

const applyGlobalSettings = (newSettings: SambaGlobalConfig) =>
    getServer()
        .andThen(server =>
            SambaManager.editGlobal(server, newSettings))
        .andThen(loadGlobalSettings);

const actions = defineActions({
    loadGlobalSettings,
    applyGlobalSettings,
});

onMounted(actions.loadGlobalSettings);

</script>

<template>
    <CardContainer>
        <template v-slot:header>
            Global
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
                label="Server Description"
                placeholder="Description of server"
                v-model="tempGlobalConfig.serverString"
            />
            <InputField
                label="Workgroup"
                placeholder="WORKGROUP"
                v-model="tempGlobalConfig.workgroup"
            />
            <ParsedTextArea
                :parser="KeyValueSyntax()"
                v-model="tempGlobalConfig.advancedOptions"
            />

        </div>

        <template v-slot:footer>
            <div class="button-group-row justify-end grow">
                <button>
                    <button
                        class="btn btn-secondary"
                        @click="resetChanges"
                        v-if="modified"
                    >Cancel</button>
                    <button
                        class="btn btn-primary"
                        @click="() => tempGlobalConfig && actions.applyGlobalSettings(tempGlobalConfig)"
                        :disabled="!modified"
                    >Apply</button>
                </button>
            </div>
        </template>
    </CardContainer>
</template>
