<template>
  <tr>
    <td>{{ target.name }}</td>
    <td class="button-group-row justify-end">
      <button @click="showEditor = !showEditor">
        <span class="sr-only">Edit</span>
        <WrenchIcon class="size-icon icon-default" />
      </button>
      <button @click="promptDeletion">
        <span class="sr-only">Delete</span>
        <TrashIcon class="size-icon icon-danger" />
      </button>
    </td>
  </tr>
  <tr></tr>
  <tr>
    <td colspan="3" class="!py-0">
      <Disclosure :show="showEditor" :transitionDuration="500" v-slot="{ visible }" noButton>
        <template v-if="visible">
          <PortalTable :target="target" />
          <InitiatorGroupTable :target="target" />
          <ChapConfigurationTable :target="target" />
          <SessionTable :target="target" :currentlyOpen="showEditor" />
        </template>
      </Disclosure>
    </td>
  </tr>
</template>

<script setup lang="ts">
import type { Target } from "@/tabs/iSCSI/types/Target";
import { TrashIcon, WrenchIcon } from "@heroicons/vue/20/solid";
import { wrapActions, confirmBeforeAction } from "@45drives/houston-common-ui";
import { ProcessError } from "@45drives/houston-common-lib";
import type { ResultAsync } from "neverthrow";
import { inject, ref } from "vue";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import { Disclosure } from "@45drives/houston-common-ui";
import PortalTable from "../portal/PortalTable.vue";
import InitiatorGroupTable from "../initiatorGroups/InitiatorGroupTable.vue";
import SessionTable from "../sessions/SessionTable.vue";
import ChapConfigurationTable from "../chapConfigurations/ChapConfigurationTable.vue";

const props = defineProps<{ target: Target }>();

const emit = defineEmits(["deleteTarget"]);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const showEditor = ref(false);

const deleteTarget = () => {
  return driver
    .andThen((driver) => driver.removeTarget(props.target))
    .map(() => emit("deleteTarget"))
    .mapErr(
      (error) => new ProcessError(`Unable to delete target ${props.target.name}: ${error.message}`)
    );
};

const actions = wrapActions({ deleteTarget: deleteTarget });

const promptDeletion = confirmBeforeAction(
  { header: "Confirm", body: `Delete target ${props.target.name}?` },
  actions.deleteTarget
);
</script>
