<script setup lang="ts">
import { CenteredCardColumn } from "@45drives/houston-common-ui";

import GlobalConfigEditor from "./GlobalConfigEditor.vue";
import ShareListView from "@/tabs/samba/ui/ShareListView.vue";
import { getClusterScope } from "@/common/getClusterScope";

import { provide, ref } from 'vue';
import { clusterScopeInjectionKey, cephClientNameInjectionKey } from '@/common/injectionKeys';

provide(clusterScopeInjectionKey, getClusterScope("ctdb"));
const cephClientName = ref("client.samba");
provide(cephClientNameInjectionKey, cephClientName);

</script>

<template>
  <CenteredCardColumn>
    <GlobalConfigEditor />
    <ShareListView />
  </CenteredCardColumn>
</template>
