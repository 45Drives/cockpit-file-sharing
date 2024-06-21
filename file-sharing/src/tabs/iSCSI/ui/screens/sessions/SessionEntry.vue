<template>
  <tr>
    <td>{{ session.initiatorName }}</td>
    <td>{{ _cockpit.format_bytes(session.readAmountKB * 1024) }}</td>
    <td>{{ _cockpit.format_bytes(session.writeAmountKB * 1024) }}</td>
    <td class="button-group-row justify-end">
      <button @click="showEditor = !showEditor">
        <span class="sr-only">Edit</span>
        <ChevronDownIcon class="size-icon icon-default" />
      </button>
    </td>
  </tr>
  <tr></tr>
  <tr>
    <td colspan="3" class="!py-0">
      <Disclosure :show="showEditor" :transitionDuration="500" v-slot="{ visible }" noButton>
        <template v-if="visible">
          <ConnectionTable :session="session" />
        </template>
      </Disclosure>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { inject, ref } from "vue";
import { ChevronDownIcon } from "@heroicons/vue/20/solid";
import { ResultAsync } from "neverthrow";
import { ProcessError } from "@45drives/houston-common-lib";
import { Disclosure } from "@45drives/houston-common-ui";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import type { Session } from "@/tabs/iSCSI/types/Session";
import ConnectionTable from "@/tabs/iSCSI/ui/screens/connections/ConnectionTable.vue";

const props = defineProps<{ session: Session }>();

const _cockpit = cockpit;

const emit = defineEmits(["deleteEntry"]);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const showEditor = ref(false);

</script>
