<template> 
    <CardContainer>
        <div
            v-if="tempPortal"
            class="space-y-content"
        >
            <div class="space-y-content text-base">
                <div
                    class="text-header"
                >New Portal</div>
            </div>

            <InputLabelWrapper>
                <template #label>
                    {{ _("Portal Address") }}
                </template>

                <InputField
                    :placeholder="'The address for your portal'"
                    :validator="portalAddressValidator"
                    v-model="tempPortal.address"
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
                    @click="actions.createPortal"
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
    import { type Target } from '../../types/Target';
    import { ProcessError } from '@45drives/houston-common-lib';
    import type { ISCSIDriver } from '../../types/ISCSIDriver';
    import { Portal } from '../../types/Portal';

    const _ = cockpit.gettext;

    const props = defineProps<{target: Target}>();

    const emit = defineEmits(['closeEditor']);

    const newPortal = ref<Portal>(new Portal(""));

    const { tempObject: tempPortal, modified, resetChanges } = useTempObjectStaging(newPortal);

    const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

    if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

    const handleClose = () => {
        emit("closeEditor");
        resetChanges();
    }

    const createPortal= () => {
        return driver.andThen((driver) => driver.addPortalToTarget(props.target, tempPortal.value))
                        .map(() => handleClose())
                        .mapErr((error) => new ProcessError(`Unable to create portal ${tempPortal.value.address}: ${error.message}`))
    }

    const actions = wrapActions({createPortal});

    const portalAddressValidator: InputValidator = (address: string) => {
        if (!address) {
            return {
                type: "error",
                message: ("A portal address is required."),
            }
        }

        return;
    }
    
</script>
