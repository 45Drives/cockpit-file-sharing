<template>
    <CardContainer>
        <template #header>
                Create New File
        </template>
        <div
            class="space-y-content"
        >
            <InputLabelWrapper>
                <template #label>
                    {{ _("File Size") }}
                </template>
                
                <ByteInput v-model="tempOptions.fileSize"/>
                <ValidationResultView v-bind="fileSizeValidationResult"/>
            </InputLabelWrapper>
        </div>
        <template v-slot:footer>
            <div class="button-group-row justify-end grow">
                <button
                    class="btn btn-secondary"
                    @click="emit('close')"
                >{{ ("Cancel") }}</button>
                <button
                    class="btn btn-primary"
                    @click="actions.createFile"
                    :disabled="!validationScope.isValid()"
                >{{ ("Create") }}</button>
            </div>
        </template>
    </CardContainer>
</template>

<script setup lang="ts">
import { BashCommand, getServer } from "@45drives/houston-common-lib";
import {
  CardContainer, InputLabelWrapper, pushNotification, Notification, useTempObjectStaging, validationError, ValidationResultView,
  ValidationScope,
  validationSuccess,
  wrapActions,
  ByteInput,
} from "@45drives/houston-common-ui";
import { ref } from "vue";

const _ = cockpit.gettext;

const emit = defineEmits<{
  (e: "close"): void;
}>();

const props = defineProps<{ filePath: string }>();

const creationOptions = ref(
    {
        fileSize: 0,
    });

const { tempObject: tempOptions, modified, resetChanges} = useTempObjectStaging(creationOptions);

const createFile = () => {
    return getServer()
        .andThen((server) => server.execute(new BashCommand(`dd if=/dev/zero of=${props.filePath} bs=1 count=0 seek=${tempOptions.value.fileSize}`)))
        .map(() => {
            pushNotification(new Notification("Success", `Created file successfully.`, "success", 2000))
            emit('close');
        })
        .mapErr((error) => {
            pushNotification(new Notification("Error", `Unable to create file: ${error.message}`, "error"));
        });
}

const actions = wrapActions({createFile});

const validationScope = new ValidationScope();

const { validationResult: fileSizeValidationResult } = validationScope.useValidator(() => {
        if (!tempOptions.value.fileSize) {
            return validationError("File Size is required.");
        }

        return validationSuccess();
    });
</script>
