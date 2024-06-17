<template>
  <tr>
    <td>{{ initiatorGroup.name }}</td>
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
          <InitiatorTable :initiator-group="initiatorGroup" />
          <LogicalUnitNumberTable :initiator-group="initiatorGroup" />
        </template>
      </Disclosure>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { TrashIcon, WrenchIcon } from "@heroicons/vue/20/solid";
import { wrapActions, confirmBeforeAction } from "@45drives/houston-common-ui";
import { inject, ref } from "vue";
import { Disclosure } from "@45drives/houston-common-ui";
import { ResultAsync } from "neverthrow";
import { ProcessError } from "@45drives/houston-common-lib";
import type { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import InitiatorTable from "@/tabs/iSCSI/ui/screens/initiators/InitiatorTable.vue";
import LogicalUnitNumberTable from "@/tabs/iSCSI/ui/screens/logicalUnitNumbers/LogicalUnitNumberTable.vue";
import type { Target } from "@/tabs/iSCSI/types/Target";

const props = defineProps<{ target: Target; initiatorGroup: InitiatorGroup }>();

const emit = defineEmits(["deleteEntry"]);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const showEditor = ref(false);

const deleteEntry = () => {
  return driver
    .andThen((driver) => driver.deleteInitiatorGroupFromTarget(props.target, props.initiatorGroup))
    .map(() => emit("deleteEntry"))
    .mapErr(
      (error) =>
        new ProcessError(`Unable to Initiator Group ${props.initiatorGroup.name}: ${error.message}`)
    );
};

const actions = wrapActions({ deleteEntry });

const promptDeletion = confirmBeforeAction(
  { header: "Confirm", body: `Delete Initiator Group ${props.initiatorGroup.name}?` },
  actions.deleteEntry
);
</script>
