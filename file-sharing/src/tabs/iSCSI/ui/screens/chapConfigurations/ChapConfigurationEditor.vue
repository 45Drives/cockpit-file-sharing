<template> 
    <CardContainer>
        <div
            v-if="tempConfiguration"
            class="space-y-content"
        >
            <div class="space-y-content text-base">
                <div
                    class="text-header"
                >{{ _("New CHAP Configuration") }}</div>
            </div>

            <InputLabelWrapper>
                <template #label>
                    {{ _("Username") }}
                </template>

                <InputField
                    :validator="configurationUsernameValidator"
                    v-model="tempConfiguration.username"
                />
            </InputLabelWrapper>

            <InputLabelWrapper>
                <template #label>
                    {{ _("Password") }}
                </template>

                <InputField
                    :validator="configurationPasswordValidator"
                    v-model="tempConfiguration.password"
                />
            </InputLabelWrapper>

            <InputLabelWrapper>
                <template #label>
                    {{ _("CHAP Type") }}
                </template>

                <SelectMenu
                    v-model="tempConfiguration.chapType"
                    :options="chapTypeOptions"
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
                    @click="actions.createConfiguration"
                    :disabled="!modified"
                >{{ ("Create") }}</button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
    import { CardContainer, InputFeedback, InputField, InputLabelWrapper, SelectMenu, useTempObjectStaging, wrapActions, type InputValidator, type SelectMenuOption } from '@45drives/houston-common-ui';
    import type { ResultAsync } from 'neverthrow';
    import { computed, inject, ref } from 'vue';
    import { type Target } from '../../types/Target';
    import { ProcessError } from '@45drives/houston-common-lib';
    import type { ISCSIDriver } from '../../types/ISCSIDriver';
    import { CHAPConfiguration, CHAPType } from '../../types/CHAPConfiguration';

    const _ = cockpit.gettext;

    const props = defineProps<{target: Target, outgoingUserPresent: boolean}>();

    const emit = defineEmits(['closeEditor']);

    const chapTypeOptions = computed(() => {
        let chapTypes;

        if (props.outgoingUserPresent) {
            chapTypes = [({label: CHAPType.IncomingUser.toString(), value: CHAPType.IncomingUser})]
        }
        else {
            chapTypes = Object.values(CHAPType).map(chapType => ({label: chapType.toString(), value: chapType}));
        }

        return chapTypes;
    })

    const newConfiguration = ref<CHAPConfiguration>(CHAPConfiguration.empty());

    const { tempObject: tempConfiguration, modified, resetChanges } = useTempObjectStaging(newConfiguration);

    const driver = inject<ResultAsync<ISCSIDriver, ProcessError>>("iSCSIDriver");

    if (driver === undefined) {
		throw new Error("iSCSI Driver is null");
	}

    const handleClose = () => {
        emit("closeEditor");
        resetChanges();
    }

    const createConfiguration = () => {
        return driver.andThen((driver) => driver.addCHAPConfigurationToTarget(props.target, tempConfiguration.value))
                        .map(() => handleClose())
                        .mapErr((error) => new ProcessError(`Unable to create configuration for user ${tempConfiguration.value.username}: ${error.message}`))
    }

    const actions = wrapActions({createConfiguration});

    const configurationUsernameValidator: InputValidator = (username: string) => {
        if (!username) {
            return {
                type: "error",
                message: ("A username is required."),
            }
        }

        return;
    }

    const configurationPasswordValidator: InputValidator = (password: string) => {
        if (!password) {
            return {
                type: "error",
                message: ("A password is required."),
            }
        }

        if (password.length < 12) {
            return {
                type: "error",
                message: ("The password must be at least 12 characters."),
            }
        }

        return;
    }
    
</script>
