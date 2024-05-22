<script setup lang="ts">
import { CenteredCardColumn, CardContainer, ModalConfirm, wrapActions, pushNotification, Notification, type Action } from "@45drives/houston-common-ui";

import { ref, type Ref } from "vue";
import { ResultAsync, okAsync, errAsync } from "neverthrow";

const modalConfirmRef = ref<InstanceType<typeof ModalConfirm> | null>(null);

const confirmBeforeAction = (
    action: Action<any, any, any>,
    modalConfirmRef: Ref<InstanceType<typeof ModalConfirm> | null>,
    confirmHeader: string,
    confirmBody: string
): typeof action => {
    return (...args: Parameters<typeof action>): ReturnType<typeof action> | ResultAsync<null, never> => {
        if (modalConfirmRef.value === null) {
            return errAsync(new Error("modalConfirmRef is null!"));
        }
        return ResultAsync.fromSafePromise(
            modalConfirmRef.value.ask(confirmHeader, confirmBody, { confirmText: "Yes", cancelText: "No" })
        ).andThen((confirmed) => {
            if (!confirmed) {
                return okAsync(null);
            }
            return action(...args);
        });
    };
};

const deleteDevice = () => okAsync("hello").map((msg) => pushNotification(new Notification("Test", msg)));

const actions = wrapActions({ deleteDevice });

const confirmThenDeleteDevice = confirmBeforeAction(actions.deleteDevice, modalConfirmRef, "Confirm", "Confirm deletion");

</script>

<template>
    <ModalConfirm ref="modalConfirmRef" />
    <CenteredCardColumn>
        <CardContainer>
            <template v-slot:header>
                NFS Manager
            </template>
            <button
                @click="confirmThenDeleteDevice"
                class="btn btn-primary"
            >
                Test confirm
            </button>
            Lorem ipsum
        </CardContainer>
    </CenteredCardColumn>
</template>
