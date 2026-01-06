<template>
  <tr>
    <td>{{ initiatorGroup.name }}</td>
    <td class="button-group-row justify-end">
      <button @click="showEditor = !showEditor">
        <span class="sr-only">Edit</span>
        <WrenchIcon class="size-icon icon-default" />
      </button>
      <button @click="promptDeletion" :disabled="!canCreate">
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
import { computed, inject, ref, type Ref } from "vue";
import { Disclosure } from "@45drives/houston-common-ui";
import { ResultAsync } from "neverthrow";
import { ProcessError } from "@45drives/houston-common-lib";
import type { InitiatorGroup } from "@/tabs/iSCSI/types/InitiatorGroup";
import type { ISCSIDriver } from "@/tabs/iSCSI/types/drivers/ISCSIDriver";
import InitiatorTable from "@/tabs/iSCSI/ui/screens/initiators/InitiatorTable.vue";
import LogicalUnitNumberTable from "@/tabs/iSCSI/ui/screens/logicalUnitNumbers/LogicalUnitNumberTable.vue";
import type { Target } from "@/tabs/iSCSI/types/Target";
import { useUserSettings } from "@/common/user-settings";

const props = defineProps<{ target: Target; initiatorGroup: InitiatorGroup }>();
// NOTE: add 'groupWillDelete' to your emits
const emit = defineEmits(["deleteEntry", "groupWillDelete"]);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;
const showEditor = ref(false);
const canEditIscsi = inject<Ref<boolean>>("canEditIscsi");
if (!canEditIscsi) throw new Error("canEditIscsi not provided");
const canCreate = computed(() => canEditIscsi.value);

const deleteEntry = () => {
  return driver
    .andThen((d) =>
      // 1) Gather LUN filePaths and tell parent
      d.getLogicalUnitNumbersOfInitiatorGroup(props.initiatorGroup)
        .map((luns) =>
          luns
            .map((l) => l.blockDevice?.filePath)
            .filter((p): p is string => typeof p === "string")
        )
        .andThen((paths) => {
          emit("groupWillDelete", paths);
          // 2) Delete the group
          return d.deleteInitiatorGroupFromTarget(props.target, props.initiatorGroup);
        })
    )
    .map(() => emit("deleteEntry"))
    .mapErr(
      (error) =>
        new ProcessError(
          `Unable to delete Initiator Group ${props.initiatorGroup.name}: ${error.message}`
        )
    );
};

const actions = wrapActions({ deleteEntry });

const deletionBody = computed(() => {
  const base = `Delete initiator group "${props.initiatorGroup.name}"?`;

  const clusteredWarning = `Deleting this initiator group may restart related resources and impact active sessions. Recommended to perform during a maintenance window.`;

  const isClustered = useUserSettings().value.iscsi.clusteredServer === true;

  return isClustered ? `${base}\n${clusteredWarning.trim()}` : base;
});

const promptDeletion = confirmBeforeAction(
  {
    header: "Confirm Deletion",
    body: deletionBody.value,
    dangerous: true
  },
  actions.deleteEntry
);

</script>
