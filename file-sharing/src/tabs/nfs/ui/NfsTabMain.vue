<script setup lang="ts">
import {
  CenteredCardColumn,
  CardContainer,
  wrapActions,
  pushNotification,
  Notification,
  type Action,
} from "@45drives/houston-common-ui";

import { ref, type Ref } from "vue";
import { ResultAsync, okAsync, errAsync } from "neverthrow";
</script>

<template>
  <CenteredCardColumn>
    <CardContainer>
      <template v-slot:header> NFS Manager </template>

      Lorem ipsum
    </CardContainer>
  </CenteredCardColumn>
</template>
