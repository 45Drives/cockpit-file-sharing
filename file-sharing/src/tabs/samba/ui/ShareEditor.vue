<script setup lang="ts">
import { defineProps, computed, defineEmits, ref, watchEffect } from "vue";
import {
  InputField,
  ToggleSwitch,
  ToggleSwitchGroup,
  InputLabelWrapper,
  ParsedTextArea,
  Disclosure,
  useTempObjectStaging,
  useGlobalProcessingState,
  ValidationScope,
  validationSuccess,
  validationError,
  ValidationResultView,
} from "@45drives/houston-common-ui";
import { type SambaShareConfig, newSambaShareConfig } from "@/tabs/samba/data-types";
import { KeyValueSyntax } from "@45drives/houston-common-lib";
import { KeyValueOptionGroup } from "@/tabs/samba/ui/KeyValueOptionGroup"; // TODO: move to common-ui
import ShareDirectoryInputAndOptions from "@/common/ui/ShareDirectoryInputAndOptions.vue";

const _ = cockpit.gettext;
const _N = cockpit.ngettext;

const props = defineProps<
  (
    | {
        newShare?: false;
        share: SambaShareConfig;
      }
    | {
        newShare: true;
      }
  ) & {
    allShareNames: string[];
  }
>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "apply", value: SambaShareConfig): void;
}>();

const globalProcessingState = useGlobalProcessingState();

const shareConf = computed<SambaShareConfig>(() =>
  props.newShare ? newSambaShareConfig() : props.share
);

const { tempObject: tempShareConfig, modified, resetChanges } = useTempObjectStaging(shareConf);

const validationScope = new ValidationScope();

const { validationResult: shareNameValidationResult } = validationScope.useValidator(() => {
  if (!props.newShare) {
    return validationSuccess();
  }
  const name = tempShareConfig.value.name;
  if (!name) {
    return validationError(_("Share name is required."));
  }
  const invalidChars = name.match(/[%<>*?|/\\+=;:",]/g);
  if (invalidChars) {
    return validationError(
      _N("Invalid character", "Invalid characters", invalidChars.length) +
        `: ${invalidChars
          // unique
          .filter((c, i, a) => a.indexOf(c) === i)
          // wrap in quotes
          .map((c) => `'${c}'`)
          // join with commas
          .join(", ")}`
    );
  }
  if (props.allShareNames.map((n) => n.toLowerCase()).includes(name.toLowerCase())) {
    return validationError(_("Share already exists."));
  }
  return validationSuccess();
});

const revealAdvancedTextarea = ref(false);
watchEffect(() => {
  if (Object.entries(tempShareConfig.value?.advancedOptions ?? {}).length) {
    revealAdvancedTextarea.value = true;
  }
});

const windowsACLsOptions = computed(
  new KeyValueOptionGroup(() => tempShareConfig.value.advancedOptions)
    .requireValuesIf(true, "vfs objects", "acl_xattr")
    .requireValuesIf(true, "map acl inherit", "yes")
    .requireValuesIf(true, "acl_xattr:ignore system acls", "yes")
    .toGetterSetter()
);

const windowsACLsWithLinuxOptions = computed(
  new KeyValueOptionGroup(() => tempShareConfig.value.advancedOptions)
    .requireValuesIf(true, "vfs objects", "acl_xattr")
    .requireValuesIf(true, "map acl inherit", "yes")
    .excludeValuesIf(true, "acl_xattr:ignore system acls", "yes")
    .toGetterSetter()
);

const shadowCopyOptions = computed(
  new KeyValueOptionGroup(() => tempShareConfig.value.advancedOptions)
    .requireValuesIf(true, "vfs objects", "shadow_copy2")
    .setOptionalValuesIf(true, "shadow:snapdir", ".zfs/snapshot")
    .setOptionalValuesIf(true, "shadow:sort", "desc")
    .setOptionalValuesIf(true, "shadow:format", "%Y-%m-%d-%H%M%S")
    .excludeKeysIf(false, /^shadow:/)
    .toGetterSetter()
);

const macOSSharesOptions = computed(
  new KeyValueOptionGroup(() => tempShareConfig.value.advancedOptions)
    .requireValuesIf(true, "vfs objects", "catia fruit streams_xattr")
    .setOptionalValuesIf(true, "fruit:encoding", "native")
    .setOptionalValuesIf(true, "fruit:metadata", "stream")
    .setOptionalValuesIf(true, "fruit:zero_file_id", "yes")
    .setOptionalValuesIf(true, "fruit:nfs_aces", "no")
    .excludeKeysIf(false, /^fruit:/)
    .toGetterSetter()
);

const auditLogsOptions = computed(
  new KeyValueOptionGroup(() => tempShareConfig.value.advancedOptions)
    .requireValuesIf(true, "vfs objects", "full_audit")
    .setOptionalValuesIf(true, "full_audit:priority", "notice")
    .setOptionalValuesIf(true, "full_audit:facility", "local5")
    .setOptionalValuesIf(
      true,
      "full_audit:success",
      "connect disconnect openat renameat linkat unlinkat"
    )
    .setOptionalValuesIf(true, "full_audit:failure", "connect")
    .setOptionalValuesIf(true, "full_audit:prefix", "???%I???%u???%m???%S???%T???")
    .excludeKeysIf(false, /^full_audit:/)
    .toGetterSetter()
);
</script>

<template>
  <div class="space-y-content">
    <div v-if="newShare" class="text-header">{{ _("New Share") }}</div>
    <div class="space-y-content">
      <InputLabelWrapper>
        <template #label>
          {{ _("Share Name") }}
        </template>
        <InputField
          v-model="tempShareConfig.name"
          :placeholder="_('A unique name for your share')"
          :disabled="!newShare"
        />
        <ValidationResultView v-bind="shareNameValidationResult" />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>{{ _("Share Description") }} </template>
        <InputField v-model="tempShareConfig.description" :placeholder="_('Describe your share')" />
      </InputLabelWrapper>

      <ShareDirectoryInputAndOptions
        v-model:path="tempShareConfig.path"
        :disabled="!newShare"
        allowNonExisting
        :validationScope
      />

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
        <ToggleSwitch v-model="tempShareConfig.inheritPermissions">
          {{ _("Inherit Permissions") }}
        </ToggleSwitch>
        <ToggleSwitch v-model="windowsACLsOptions">
          {{ _("Windows ACLs") }}
          <template #description> {{ _("Administer share permissions from Windows") }} </template>
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
          @click="
            () => {
              resetChanges();
              $emit('cancel');
            }
          "
        >
          {{ _("Cancel") }}
        </button>
        <button
          class="btn btn-primary"
          @click="$emit('apply', tempShareConfig)"
          :disabled="!validationScope.isValid() || !modified || globalProcessingState !== 0"
        >
          {{ _("Apply") }}
        </button>
      </div>
    </div>
  </div>
</template>
