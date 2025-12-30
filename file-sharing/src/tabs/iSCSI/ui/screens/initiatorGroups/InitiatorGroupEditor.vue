<template>
    <CardContainer>
        <div v-if="tempInitiatorGroup" class="space-y-content">
            <div class="space-y-content text-base">
                <div class="text-header">{{ _("New Initiator Group") }}</div>
            </div>

            <InputLabelWrapper>
                <template #label>
                    {{ _("Group Name") }}
                </template>

                <InputField :placeholder="'The name for your Initiator Group'" v-model="tempInitiatorGroup.name" />
                <ValidationResultView v-bind="initiatorGroupNameValidationResult" />
            </InputLabelWrapper>
        </div>

        <template v-slot:footer>
            <div class="button-group-row justify-end grow">
                <button class="btn btn-secondary" @click="handleClose">{{ ("Cancel") }}</button>
                <button class="btn btn-primary" @click="promptCreateInitiatorGroup"
                    :disabled="!validationScope.isValid() || !modified || !canCreate">{{ ("Create") }}</button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
import { CardContainer, InputLabelWrapper, InputField, useTempObjectStaging, wrapActions, validationSuccess, validationError, ValidationResultView, ValidationScope, confirmBeforeAction } from '@45drives/houston-common-ui';
import type { ResultAsync } from 'neverthrow';
import { inject, ref, computed, type Ref } from 'vue';
import { ProcessError } from '@45drives/houston-common-lib';
import type { Target } from '@/tabs/iSCSI/types/Target';
import { InitiatorGroup } from '@/tabs/iSCSI/types/InitiatorGroup';
import type { ISCSIDriver } from '@/tabs/iSCSI/types/drivers/ISCSIDriver';


const _ = cockpit.gettext;

const props = defineProps<{
    target: Target
}>();

const emit = defineEmits(['closeEditor', 'created']);
const canEditIscsi = inject<Ref<boolean>>("canEditIscsi");
if (!canEditIscsi) throw new Error("canEditIscsi not provided");
const canCreate = computed(() => canEditIscsi.value);
const newInitiatorGroup = ref<InitiatorGroup>(InitiatorGroup.empty());
const norm = (s: string | undefined | null) => (s ?? "").trim()
const { tempObject: tempInitiatorGroup, modified, resetChanges } = useTempObjectStaging(newInitiatorGroup);

const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver")!;

const handleClose = () => {
    emit("closeEditor");
    resetChanges();
}

const createInitiatorGroup = () => {
    return driver.andThen((driver) => driver.addInitiatorGroupToTarget(props.target, tempInitiatorGroup.value))
        .map(() => { emit("created"), handleClose() })
        .mapErr((error) => new ProcessError(`Unable to create group ${tempInitiatorGroup.value.name}: ${error.message}`))
}

const actions = wrapActions({ createInitiatorGroup });

const promptCreateInitiatorGroup = confirmBeforeAction(
    {
        header: _("Confirm"),
        body: _(
            `Create this initiator group?
      
Changing iSCSI initiator group configuration can cause related targets or resources to restart and may disrupt active sessions using this target.
It is recommended to perform this action during a planned maintenance window or other downtime if it could impact production workloads.`
        ),
        dangerous: true
    },
    actions.createInitiatorGroup
);

const validationScope = new ValidationScope();

const { validationResult: initiatorGroupNameValidationResult } = validationScope.useValidator(() => {
    if (!tempInitiatorGroup.value.name) {
        return validationError("A group name is required.");
    }
    if (duplicateName.value) return validationError("That group name already exists on this target.");

    return validationSuccess();
});

const duplicateName = computed(() => {
    const wanted = norm(tempInitiatorGroup.value?.name);
    if (!wanted) return false;
    return (props.target.initiatorGroups ?? []).some(g => norm(g?.name) === wanted);
});




</script>
