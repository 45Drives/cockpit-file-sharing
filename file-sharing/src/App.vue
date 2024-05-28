<script setup lang="ts">
import { HoustonAppContainer } from "@45drives/houston-common-ui";
import { SambaTabMain } from "@/tabs/samba/ui";
import { NfsTabMain } from "@/tabs/nfs/ui";
</script>

<template>
  <HoustonAppContainer
    module-name="File Sharing"
    :tabs="[
      {
        label: 'Samba',
        component: SambaTabMain,
      },
      {
        label: 'NFS',
        component: NfsTabMain,
      },
    ]"
  />
</template>
