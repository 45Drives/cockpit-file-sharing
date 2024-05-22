<script setup lang="ts">
import { defineProps, computed, defineEmits, ref, onMounted, watchEffect, type Ref, type ComponentPublicInstance } from 'vue';
import {
    InputField,
    ToggleSwitch,
    ToggleSwitchGroup,
    CardContainer,
    ParsedTextArea,
    Disclosure,
    SelectMenu,
    useTempObjectStaging,
    wrapActions,
    reportSuccess,
    reportError,
    type SelectMenuOption,
    type InputValidator,
} from "@45drives/houston-common-ui";
import { type SambaShareConfig, defaultSambaShareConfig } from '@/tabs/samba/data-types';
import { Directory, getServer, KeyValueSyntax } from '@45drives/houston-common-lib';
import { getSambaManager } from '@/tabs/samba/samba-manager';
import { okAsync, errAsync } from "neverthrow";
import { BooleanKeyValueSuite } from '@/tabs/samba/ui/BooleanKeyValueSuite'; // TODO: move to common-ui
import { DirectoryCheckerAndPermissions } from '@/common/ui';

const _ = cockpit.gettext;

const props = defineProps<({
    newShare?: false;
    shareName: string;
} | {
    newShare: true;
}) & {
    allShareNames: string[];
}>();

const emit = defineEmits<{
    (e: 'cancel'): void;
    (e: 'apply', value: SambaShareConfig): void;
    (e: 'editedShare', value: SambaShareConfig): void;
    (e: 'addedShare', value: SambaShareConfig): void;
}>();

const shareConf = ref<SambaShareConfig>();

const { tempObject: tempShareConfig, modified, resetChanges } =
    useTempObjectStaging(shareConf);

const sambaManager = getSambaManager();

const loadShareSettings = () =>
    (props.newShare
        ? okAsync(defaultSambaShareConfig())
        : sambaManager
            .andThen(sm => sm.getShare(props.shareName)))
        .map(sc => shareConf.value = sc);

const applyShareSettings =
    () => sambaManager.andThen((sm) => {
        const newShareSettings = tempShareConfig.value;
        if (newShareSettings === undefined) {
            return errAsync(new Error("tempShareConfig.value was undefined!"));
        }
        return props.newShare
            ? sm.addShare(newShareSettings).map(() => emit("addedShare", newShareSettings))
            : sm.editShare(newShareSettings).map(() => emit("editedShare", newShareSettings));
    }).andThen(loadShareSettings);

const actions = wrapActions({
    loadShareSettings,
    applyShareSettings,
});

onMounted(actions.loadShareSettings);

const shareNameValidator: InputValidator = (name: string) => {
    if (!props.newShare) {
        return;
    }
    if (!name) {
        return {
            type: "error",
            message: _("Share name is required."),
        };
    }
    const invalidChars = name.match(/[%<>*?|/\\+=;:",]/g);
    if (invalidChars) {
        return {
            type: "error",
            message: `Invalid character${invalidChars.length > 1 ? 's' : ''}: ${invalidChars
                // unique
                .filter((c, i, a) => a.indexOf(c) === i)
                // wrap in quotes
                .map(c => `'${c}'`)
                // join with commas
                .join(', ')}`,
        };
    }
    if (props.allShareNames.map(n => n.toLowerCase()).includes(name.toLowerCase())) {
        return {
            type: "error",
            message: _("Share already exists.")
        };
    }
    return;
};

const pathChecker = ref<InstanceType<typeof DirectoryCheckerAndPermissions> | null>(null);

const inputsValid = computed<boolean>(() =>
    tempShareConfig.value !== undefined &&
    shareNameValidator(tempShareConfig.value.name) === undefined &&
    pathChecker.value?.isValid === true
);

const revealAdvancedTextarea = ref(false);
watchEffect(() => {
    if (Object.entries(tempShareConfig.value?.advancedOptions ?? {}).length) {
        revealAdvancedTextarea.value = true;
    }
});

const windowsACLsOptions = BooleanKeyValueSuite(() => tempShareConfig.value?.advancedOptions ?? {}, {
    include: {
        "map acl inherit": "yes",
        "acl_xattr:ignore system acls": "yes",
        "vfs objects": "acl_xattr",
    },
    exclude: {}
});

const windowsACLsWithLinuxOptions = BooleanKeyValueSuite(() => tempShareConfig.value?.advancedOptions ?? {}, {
    include: {
        "map acl inherit": "yes",
        "vfs objects": "acl_xattr",
    },
    exclude: {
        "acl_xattr:ignore system acls": "yes",
    }
});

const shadowCopyOptions = BooleanKeyValueSuite(() => tempShareConfig.value?.advancedOptions ?? {}, {
    include: {
        "shadow:snapdir": ".zfs/snapshot",
        "shadow:sort": "desc",
        "shadow:format": "%Y-%m-%d-%H%M%S",
        "vfs objects": "shadow_copy2",
    },
    exclude: {}
});

const macOSSharesOptions = BooleanKeyValueSuite(() => tempShareConfig.value?.advancedOptions ?? {}, {
    include: {
        "fruit:encoding": "native",
        "fruit:metadata": "stream",
        "fruit:zero_file_id": "yes",
        "fruit:nfs_aces": "no",
        "vfs objects": "catia fruit streams_xattr",
    },
    exclude: {}
});

const auditLogsOptions = BooleanKeyValueSuite(() => tempShareConfig.value?.advancedOptions ?? {}, {
    include: {
        "vfs objects": "full_audit",
        "full_audit:priority": "notice",
        "full_audit:facility": "local5",
        "full_audit:success": "connect disconnect openat renameat linkat unlinkat",
        "full_audit:failure": "connect",
        "full_audit:prefix": "???%I???%u???%m???%S???%T???",
    },
    exclude: {}
});

</script>

<template>
    <div class="space-y-content">
        <div
            v-if="newShare"
            class="text-header"
        >
            New Share
        </div>
        <div
            v-if="tempShareConfig"
            class="space-y-content"
        >
            <InputField
                v-model="tempShareConfig.name"
                :placeholder="_('A unique name for your share')"
                :validator="shareNameValidator"
                :disabled="!newShare"
            >
                Share Name
            </InputField>

            <InputField
                v-model="tempShareConfig.description"
                :placeholder="_('Describe your share')"
            >
                Share Description
            </InputField>

            <div>

                <InputField
                    v-model="tempShareConfig.path"
                    :placeholder="_('Share path/directory')"
                    :disabled="!newShare"
                >
                    Path
                </InputField>
                <DirectoryCheckerAndPermissions
                    :path="tempShareConfig.path"
                    ref="pathChecker"
                />
            </div>

            <ToggleSwitchGroup>
                <ToggleSwitch v-model="tempShareConfig.guestOk">
                    {{ _("Guest OK") }}
                </ToggleSwitch>
                <ToggleSwitch v-model="tempShareConfig.readOnly">
                    {{ _("Read Only") }}
                </ToggleSwitch>
                <ToggleSwitch v-model="tempShareConfig.browseable">
                    {{ _("Browseable") }}
                </ToggleSwitch>
                <ToggleSwitch v-model="windowsACLsOptions">
                    {{ _("Windows ACLs") }}
                    <template #description>
                        Administer share permissions from Windows
                    </template>
                </ToggleSwitch>
                <ToggleSwitch v-model="windowsACLsWithLinuxOptions">
                    {{ _("Windows ACLs with Linux/MacOS Support") }}
                    <template #description>
                        {{ _("Administer share permissions from Windows for Windows, Mac, and Linux clients") }}
                    </template>
                </ToggleSwitch>
                <ToggleSwitch v-model="shadowCopyOptions">
                    {{ _("Shadow Copy") }}
                    <template #description>
                        {{ _("Expose per-file snapshots to users") }}
                    </template>
                </ToggleSwitch>
                <ToggleSwitch v-model="macOSSharesOptions">
                    {{ _("MacOS Share") }}
                    <template #description>
                        {{ _("Optimize share for MacOS") }}
                    </template>
                </ToggleSwitch>
                <ToggleSwitch v-model="auditLogsOptions">
                    {{ _("Audit Logs") }}
                    <template #description>
                        {{ _("Turn on audit logging") }}
                    </template>
                </ToggleSwitch>
            </ToggleSwitchGroup>

            <Disclosure v-model:show="revealAdvancedTextarea">
                <template v-slot:label>
                    {{ _("Advanced") }}
                </template>
                <ParsedTextArea
                    :parser="KeyValueSyntax({ trailingNewline: false })"
                    v-model="tempShareConfig.advancedOptions"
                />
            </Disclosure>

            <div class="button-group-row justify-end grow">
                <button
                    class="btn btn-secondary"
                    @click="() => { resetChanges(); $emit('cancel'); }"
                >{{ _("Cancel") }}</button>
                <button
                    class="btn btn-primary"
                    @click="() => { $emit('apply', tempShareConfig!); actions.applyShareSettings(); }"
                    :disabled="!inputsValid"
                >{{ _("Apply") }}</button>
            </div>
        </div>
    </div>
</template>
