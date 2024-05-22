<script setup lang="ts">
import { CenteredCardColumn } from "@45drives/houston-common-ui";

import GlobalConfigView from './GlobalConfigView.vue';
import ShareListView from '@/tabs/samba/ui/ShareListView.vue';


</script>

<template>
    <CenteredCardColumn>
        <GlobalConfigView />
        <ShareListView />
    </CenteredCardColumn>
</template>
