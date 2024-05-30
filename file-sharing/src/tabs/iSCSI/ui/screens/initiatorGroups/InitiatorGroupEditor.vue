<template> 
    <CardContainer>
        <div
            v-if="tempInitiatorGroup"
            class="space-y-content"
        >
            <div class="space-y-content text-base">
                <div
                    class="text-header"
                >New Initiator Group</div>
            </div>

            <div>
                <InputField
                        :placeholder="'The name for your Initiator Group'"
                        :validator="initiatorGroupNameValidator"
                        v-model="tempInitiatorGroup.name"
                    >
                    {{ ("Group Name") }}
                </InputField>
            </div>
        </div>

        <template v-slot:footer>
            <div class="button-group-row justify-end grow">
                <button
                    class="btn btn-secondary"
                    @click="handleClose"
                >{{ ("Cancel") }}</button>
                <button
                    class="btn btn-primary"
                    @click="actions.createInitiatorGroup"
                    :disabled="!modified"
                >{{ ("Create") }}</button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
import { CardContainer, InputField, useTempObjectStaging, wrapActions, type InputValidator } from '@45drives/houston-common-ui';
import type { ResultAsync } from 'neverthrow';
import { inject, ref } from 'vue';
import { type Target } from '../../types/Target';
import { ProcessError } from '@45drives/houston-common-lib';
import type { ISCSIDriver } from '../../types/ISCSIDriver';
import { InitiatorGroup } from '../../types/InitiatorGroup';

    const props = defineProps<{target: Target}>();

    const emit = defineEmits(['closeEditor']);

    const newInitiatorGroup = ref<InitiatorGroup>(InitiatorGroup.empty());

    const { tempObject: tempInitiatorGroup, modified, resetChanges } = useTempObjectStaging(newInitiatorGroup);

    const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

    if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

    const handleClose = () => {
        emit("closeEditor");
        resetChanges();
    }

    const createInitiatorGroup = () => {
        return driver.andThen((driver) => driver.addInitiatorGroupToTarget(props.target, tempInitiatorGroup.value))
                        .map(() => handleClose())
                        .mapErr((error) => new ProcessError(`Unable to create group ${tempInitiatorGroup.value.name}: ${error.message}`))
    }

    const actions = wrapActions({createInitiatorGroup});

    const initiatorGroupNameValidator: InputValidator = (address: string) => {
        if (!address) {
            return {
                type: "error",
                message: ("A group name is required."),
            }
        }

        return;
    }
    
</script>
