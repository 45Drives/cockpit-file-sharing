<template> 
    <CardContainer>
        <div
            v-if="tempInitiator"
            class="space-y-content"
        >
            <div class="space-y-content text-base">
                <div
                    class="text-header"
                >{{ _("New Initiator") }}</div>
            </div>

            <InputLabelWrapper>
                <template #label>
                    {{ _("Name") }}
                </template>

                <InputField
                    v-model="tempInitiator.name"
                />
                <ValidationResultView v-bind="initiatorNameValidationResult" />
            </InputLabelWrapper>
        </div>

        <template v-slot:footer>
            <div class="button-group-row justify-end grow">
                <button
                    class="btn btn-secondary"
                    @click="handleClose"
                >{{ ("Cancel") }}</button>
                <button
                    class="btn btn-primary"
                    @click="actions.createConfiguration"
                    :disabled="!scopeValid || !modified"
                >{{ ("Create") }}</button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
    import { CardContainer, InputField, InputLabelWrapper, useTempObjectStaging, useValidationScope, useValidator, validationError, validationSuccess, ValidationResultView, wrapActions } from '@45drives/houston-common-ui';
    import type { ResultAsync } from 'neverthrow';
    import { inject, ref } from 'vue';
    import { ProcessError } from '@45drives/houston-common-lib';
    import type { ISCSIDriver } from '../../types/ISCSIDriver';
    import type { InitiatorGroup } from '../../types/InitiatorGroup';
    import { Initiator } from '../../types/Initiator';

    const _ = cockpit.gettext;

    const props = defineProps<{initiatorGroup: InitiatorGroup}>();

    const emit = defineEmits(['closeEditor']);

    const newInitiator = ref<Initiator>(Initiator.empty());

    const { tempObject: tempInitiator, modified, resetChanges } = useTempObjectStaging(newInitiator);

    const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

    if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

    const handleClose = () => {
        emit("closeEditor");
        resetChanges();
    }

    const createConfiguration = () => {
        return driver.andThen((driver) => driver.addInitiatorToGroup(props.initiatorGroup, tempInitiator.value))
                        .map(() => handleClose())
                        .mapErr((error) => new ProcessError(`Unable to add initiator ${tempInitiator.value.name} to group ${props.initiatorGroup.name}: ${error.message}`))
    }

    const actions = wrapActions({createConfiguration});
    
    const { scopeValid } = useValidationScope();

    const { validationResult: initiatorNameValidationResult } = useValidator(() => {
        if (!tempInitiator.value.name) {
            return validationError("A name is required.");
        }

        return validationSuccess();
    });
    
</script>
