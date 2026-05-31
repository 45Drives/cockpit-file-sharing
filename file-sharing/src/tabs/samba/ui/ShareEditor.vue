<script setup lang="ts">
import {
  defineProps,
  computed,
  defineEmits,
  inject,
  ref,
  watchEffect,
  onMounted,
  type Ref,
  watch,
} from "vue";
import { readOnlyInjectionKey } from "@/common/injectionKeys";
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
import { server } from "@45drives/houston-common-lib";
import { KeyValueSyntax, SambaShareConfig } from "@45drives/houston-common-lib";
import { BooleanKeyValueSuite } from "@/tabs/samba/ui/BooleanKeyValueSuite"; // TODO: move to common-ui
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

// Named `tabReadOnly` to avoid shadowing `tempShareConfig.readOnly`, which is
// the SMB share's own "read only = yes" config field (entirely unrelated).
const tabReadOnly = inject(readOnlyInjectionKey, computed(() => false));

const shareConf = computed<SambaShareConfig>(() =>
  props.newShare ? SambaShareConfig.makeNew() : props.share
);

const { tempObject: tempShareConfig, modified, resetChanges } = useTempObjectStaging(shareConf);
const shareDirectoryOptionsModified = ref(false);

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

watchEffect(() => {
  if (!props.newShare && props.share) {
    resetChanges(); // Re-syncs tempShareConfig with props.share
  }
});

const isDomainJoined = ref(false);

onMounted(async () => {
  isDomainJoined.value = await server.isServerDomainJoined().unwrapOr(false);
});

const windowsACLsOptions = BooleanKeyValueSuite(() => tempShareConfig.value.advancedOptions, {
  include: {
    "map acl inherit": "yes",
    "vfs objects": ["acl_xattr"],
  },
  exclude: {},
});

const shadowCopyOptions = BooleanKeyValueSuite(() => tempShareConfig.value.advancedOptions, {
  include: {
    "vfs objects": ["shadow_copy2"],
  },
  suggest: {
    "shadow:snapdir": ".zfs/snapshot",
    "shadow:sort": "desc",
    "shadow:format": "%Y-%m-%d-%H%M%S",
    "shadow:localtime": "yes",
  },
  exclude: {},
});

const macOSSharesOptions = BooleanKeyValueSuite(() => tempShareConfig.value.advancedOptions, {
  include: {
    "fruit:encoding": "native",
    "fruit:metadata": "stream",
    "fruit:zero_file_id": "yes",
    "fruit:nfs_aces": "no",
    "vfs objects": ["catia", "fruit", "streams_xattr"],
  },
  exclude: {},
});

const auditLogsOptions = BooleanKeyValueSuite(() => tempShareConfig.value.advancedOptions, {
  include: {
    "vfs objects": ["full_audit"],
  },
  suggest: {
    "full_audit:priority": "notice",
    "full_audit:facility": "local5",
    "full_audit:success": ["connect", "disconnect", "openat", "renameat", "linkat", "unlinkat"],
    "full_audit:failure": ["connect"],
    "full_audit:prefix": "???%I???%u???%m???%S???%T???",
  },
  exclude: {},
});

const shareDirectoryInputAndOptionsRef = ref<InstanceType<
  typeof ShareDirectoryInputAndOptions
> | null>(null);

function mutuallyExclusive(a: Ref<boolean>, b: Ref<boolean>) {
  watch(a, (a) => {
    if (a) {
      b.value = false;
    }
  });
  watch(b, (b) => {
    if (b) {
      a.value = false;
    }
  });
}

mutuallyExclusive(
  windowsACLsOptions,
  computed({
    get: () => tempShareConfig.value.inheritPermissions,
    set: (v) => (tempShareConfig.value.inheritPermissions = v),
  })
);
</script>

<template>
  <div class="space-y-content">
    <div v-if="newShare" class="text-header">{{ _("New Share") }}</div>
    <fieldset :disabled="tabReadOnly" class="space-y-content !m-0 !p-0 border-0">
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
        v-model:modified="shareDirectoryOptionsModified"
        ref="shareDirectoryInputAndOptionsRef"
        :newShare="newShare ?? false"
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
        <ToggleSwitch v-if="isDomainJoined" v-model="windowsACLsOptions">
          {{ _("Windows ACLs") }}
          <template #description> {{ _("Administer share permissions from Windows") }} </template>
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

    </fieldset>
      <!-- Disclosure outside the fieldset so its toggle button stays
           interactive in read-only mode (operators still want to inspect
           Advanced). Inner ParsedTextArea is wrapped in its own disabled
           fieldset to block edits. -->
      <Disclosure v-model:show="revealAdvancedTextarea">
        <template v-slot:label>
          {{ _("Advanced") }}
        </template>
        <fieldset :disabled="tabReadOnly" class="!m-0 !p-0 border-0">
          <ParsedTextArea
            :parser="KeyValueSyntax({ trailingNewline: false })"
            v-model="tempShareConfig.advancedOptions"
          />
        </fieldset>
      </Disclosure>

      <div class="button-group-row justify-end grow">
        <button
          class="btn btn-secondary"
          @click="
            () => {
              resetChanges();
              shareDirectoryInputAndOptionsRef?.resetChanges?.();
              $emit('cancel');
            }
          "
        >
          {{ tabReadOnly ? _("Close") : _("Cancel") }}
        </button>
        <button
          v-if="!tabReadOnly"
          class="btn btn-primary"
          @click="$emit('apply', tempShareConfig)"
          :disabled="
            !validationScope.isValid() ||
            (!modified && !shareDirectoryOptionsModified) ||
            globalProcessingState !== 0
          "
        >
          {{ _("Apply") }}
        </button>
      </div>
  </div>
</template>
