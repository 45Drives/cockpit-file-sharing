<template> 
    <CardContainer>
        <div
            v-if="tempTarget"
            class="space-y-content"
        >
            <div class="space-y-content text-base">
                <div
                    class="text-header"
                >New Target</div>
            </div>

            <InputLabelWrapper>
                <template #label>
                    {{ _("Target Name") }}
                </template>

                <InputField
                    :placeholder="'A unique name for your target'"
                    :validator="targetNameValidator"
                    v-model="tempTarget.name"
                />
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
                    @click="actions.createTarget"
                    :disabled="!modified"
                >{{ ("Create") }}</button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
    import { CardContainer, InputField, InputLabelWrapper, useTempObjectStaging, wrapActions, type InputValidator } from '@45drives/houston-common-ui';
    import type { ResultAsync } from 'neverthrow';
    import { inject, ref } from 'vue';
    import { Target } from '../../types/Target';
    import { ProcessError } from '@45drives/houston-common-lib';
    import type { ISCSIDriver } from '../../types/ISCSIDriver';

    const _ = cockpit.gettext;

    const props = defineProps<{existingTargets: Target[]}>();

    const emit = defineEmits(['closeEditor']);

    const newTarget = ref<Target>(Target.empty());

    const { tempObject: tempTarget, modified, resetChanges } = useTempObjectStaging(newTarget);

    const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

    if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

    const handleClose = () => {
        emit("closeEditor");
        resetChanges();
    }

    const createTarget = () => {
        return driver.andThen((driver) => driver.createTarget(tempTarget.value))
                        .map(() => handleClose())
                        .mapErr((error) => new ProcessError(`Unable to create target ${tempTarget.value.name}: ${error.message}`))
    }

    const actions = wrapActions({createTarget});

    const targetNameValidator: InputValidator = (name: string) => {
        if (!name) {
            return {
                type: "error",
                message: ("A target name is required."),
            }
        }

        if (props.existingTargets.find((target) => (target.name === name)) !== undefined) {
            return {
                type: "error",
                message: ("A target with this name already exists."),
            }
        }

        return;
    }
    
</script>
