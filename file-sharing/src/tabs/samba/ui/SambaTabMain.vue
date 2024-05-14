<script setup lang="ts">
import { getServer } from "@45drives/houston-common-lib";
import { CenteredCardColumn, reportError, useGlobalProcessingState } from "@45drives/houston-common-ui";

import { SambaManager } from '../samba-manager';

import GlobalConfigView from './GlobalConfigView.vue';
import { onMounted, ref } from 'vue';
import { type SambaConfig } from '@/tabs/samba/data-types';

import { ResultAsync, errAsync } from "neverthrow";

const { globalProcessingWrapPromise } = useGlobalProcessingState();

const sambaSettings = ref<SambaConfig>();

getServer()
    .andThen((server) => ResultAsync.combine([
        SambaManager.loadSettings(server).map((settings) => sambaSettings.value = settings),
    ]))
    .mapErr(reportError);

</script>

<template>
    <CenteredCardColumn>
        <GlobalConfigView
            v-if="sambaSettings"
            :global-config="sambaSettings.global"
        />
        <div> TEST </div>

    </CenteredCardColumn>
</template>
