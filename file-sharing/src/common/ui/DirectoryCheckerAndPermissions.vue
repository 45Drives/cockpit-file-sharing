<script setup lang="ts">
import { ref, defineModel, watchEffect, type Ref, computed, defineExpose } from "vue";
import { InputFeedback, wrapActions, type Feedback } from "@45drives/houston-common-ui";
import { getServer, Directory, ProcessError, Server, FileSystemNode, type CommandOptions, Path } from '@45drives/houston-common-lib';
import { ResultAsync, okAsync, ok } from "neverthrow";

const _ = cockpit.gettext;

const usePathInfo = (path: Ref<string>, server?: Server, commandOptions: CommandOptions = { superuser: 'try' }) => {
    const serverResult = server ? okAsync<Server, ProcessError>(server) : getServer();

    const fsNode = (path: string) => serverResult.map(server => new FileSystemNode(server, path));

    const exists = ref<boolean>(false);
    const updateExists = () => {
        fsNode(path.value)
            .andThen((node) => node.exists(commandOptions))
            .map((existsValue) => exists.value = existsValue);
    };
    watchEffect(updateExists);

    const isDirectory = ref<boolean>(false);
    const updateIsDirectory = () => {
        if (!exists.value) {
            isDirectory.value = false;
        }
        fsNode(path.value)
            .andThen((node) => node.isDirectory(commandOptions))
            .map((isDirectoryValue) => isDirectory.value = isDirectoryValue);
    };
    watchEffect(updateIsDirectory);

    const isFile = ref<boolean>(false);
    const updateIsFile = () => {
        if (!exists.value) {
            isFile.value = false;
        }
        fsNode(path.value)
            .andThen((node) => node.isFile(commandOptions))
            .map((isFileValue) => isFile.value = isFileValue);
    };
    watchEffect(updateIsFile);

    const isAbsolute = computed<boolean>(() => new Path(path.value).isAbsolute());
    const isRelative = computed<boolean>(() => !isAbsolute.value);

    const forceUpdatePathInfo = () => {
        updateExists();
        updateIsDirectory();
        updateIsFile();
    };

    return {
        exists,
        isDirectory,
        isFile,
        isAbsolute,
        isRelative,
        forceUpdatePathInfo,
    };
};

const path = defineModel<string>("path", { required: true });

const { exists, isDirectory, isAbsolute, forceUpdatePathInfo } = usePathInfo(path);

const server = getServer();

const createDirectory = () =>
    server.andThen(server =>
        new Directory(server, path.value)
            .create(true, { superuser: 'try' })).map(forceUpdatePathInfo);

const actions = wrapActions({
    createDirectory
});

const isValid = computed<boolean>(() => isAbsolute.value && isDirectory.value);

defineExpose({
    isValid
});

</script>

<template>
    <InputFeedback
        v-if="!path"
        type="error"
    >
        {{ _("Share path is required.") }}
    </InputFeedback>
    <InputFeedback
        v-else-if="!isAbsolute"
        type="error"
    >
        {{ _("Share path must be absolute.") }}
    </InputFeedback>
    <InputFeedback
        v-else-if="!exists"
        type="warning"
    >
        <span class="space-x-1">
            <span>{{ _("Path does not exist.") }}</span>
            <template v-if="false /* if zfs TODO */">
                <button
                    @click="actions.createDirectory"
                    class="underline"
                >
                    {{ _("Create directory") }}
                </button>
                <span>
                    or
                </span>
                <button class="underline">
                    {{ _("Create ZFS dataset") }}
                </button>
            </template>
            <button
                v-else
                @click="actions.createDirectory"
                class="underline"
            >
                {{ _("Create now") }}
            </button>
        </span>
    </InputFeedback>
    <InputFeedback
        v-else-if="!isDirectory"
        type="error"
    >
        {{ _("Path exists but is not a directory.") }}
    </InputFeedback>
    <button
        v-else
        class="text-feedback text-primary"
    >
        {{ _("Edit permissions") }}
    </button>
</template>
