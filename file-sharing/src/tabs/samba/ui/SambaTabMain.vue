<script setup lang="ts">
import { CenteredCardColumn } from "@45drives/houston-common-ui";

import GlobalConfigEditor from "./GlobalConfigEditor.vue";
import ShareListView from "@/tabs/samba/ui/ShareListView.vue";
import { getClusterScope } from "@/common/getClusterScope";

import { provide } from 'vue';
import { clusterScopeInjectionKey } from '@/common/injectionKeys';

provide(clusterScopeInjectionKey, getClusterScope("ctdb"));

</script>

<template>
  <CenteredCardColumn>
    <GlobalConfigEditor />
    <ShareListView />
  </CenteredCardColumn>
</template>
