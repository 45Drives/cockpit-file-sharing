<script setup lang="ts">
import {
  pushNotification, Notification, HoustonAppContainer, globalProcessingWrapPromise
} from '@45drives/houston-common-ui';
import { onMounted, watch } from 'vue';
import {
  SambaTabMain
} from '@/tabs/samba/ui';
import {
  NfsTabMain
} from '@/tabs/nfs/ui';

onMounted(() => {
  const notif =
    new Notification("Test", "Hello, world!")
      .addAction("Push me", () =>
        globalProcessingWrapPromise(new Promise(resolve => setTimeout(() => resolve(), 1000))));
  pushNotification(notif);
});

const tabs = [
  {
    label: 'Samba',
    component:
      SambaTabMain
  },
  {
    label: 'NFS',
    component: NfsTabMain
  },
];

</script>

<template>
  <HoustonAppContainer
    module-name="File & Block Sharing"
    :tabs="tabs"
  />
</template>
