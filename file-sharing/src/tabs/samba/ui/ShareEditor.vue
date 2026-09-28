<script setup lang="ts">
import { computed, ref, watchEffect, onMounted, type Ref, watch, toRaw } from "vue";
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
  computedResult,
  reportError,
  reportSuccess,
} from "@45drives/houston-common-ui";
import { server } from "@45drives/houston-common-lib";
import { KeyValueSyntax, SambaShareConfig } from "@45drives/houston-common-lib";
import { BooleanKeyValueSuite } from "@/tabs/samba/ui/BooleanKeyValueSuite"; // TODO: move to common-ui
import ShareDirectoryInputAndOptions from "@/common/ui/ShareDirectoryInputAndOptions.vue";
import type { ShareDefinition } from "@/common/share-common";
import type { SambaSelinuxCheck, SambaManager } from "../samba-manager";
import { okAsync } from "neverthrow";
import CephOptionsView from "@/common/ui/CephOptions.vue";
import { isCephOptions } from "@/common/mountpoint-options";

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
    manager: InstanceType<typeof SambaManager>;
  }
>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "apply", value: ShareDefinition<SambaShareConfig>): void;
}>();

const globalProcessingState = useGlobalProcessingState();

const defaultConfig = {
  ...SambaShareConfig.makeNew(),
  type: "samba" as const,
  mountpointOptions: { fsType: "" },
};
const [shareConf] = computedResult<ShareDefinition<SambaShareConfig>>(() => {
  if (props.newShare) {
    return okAsync(defaultConfig);
  }
  return props.manager.getShareDefinition(toRaw(props.share));
});

const { tempObject: tempShareConfig, modified, resetChanges } = useTempObjectStaging(shareConf);
const shareDirectoryOptionsModified = ref(false);

const validationScope = new ValidationScope();

const { validationResult: shareNameValidationResult } = validationScope.useValidator(() => {
  if (!props.newShare) {
    return validationSuccess();
  }
  const name = tempShareConfig.value?.name;
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
const checkingSelinux = ref(false);
const selinuxCheck = ref<SambaSelinuxCheck>();

onMounted(async () => {
  isDomainJoined.value = await server.isServerDomainJoined().unwrapOr(false);
});

const windowsACLsOptions = BooleanKeyValueSuite(
  () => tempShareConfig.value?.advancedOptions ?? {},
  {
    include: {
      "map acl inherit": "yes",
      "vfs objects": ["acl_xattr"],
    },
    exclude: {},
  }
);

const shadowCopyOptions = BooleanKeyValueSuite(() => tempShareConfig.value?.advancedOptions ?? {}, {
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

const labelingPathForSamba = ref(false);
const selinuxCheckFailed = ref(false);
let selinuxCheckId = 0;

async function checkSambaSelinuxLabel() {
  const path = tempShareConfig.value?.path;
  if (!path) {
    return;
  }
  const checkId = ++selinuxCheckId;
  checkingSelinux.value = true;
  selinuxCheckFailed.value = false;
  selinuxCheck.value = undefined;
  try {
    await props.manager.checkSambaSelinuxLabel(path).match(
      (check) => {
        if (checkId === selinuxCheckId) {
          selinuxCheck.value = check;
        }
      },
      () => {
        if (checkId === selinuxCheckId) {
          selinuxCheckFailed.value = true;
        }
      }
    );
  } finally {
    if (checkId === selinuxCheckId) {
      checkingSelinux.value = false;
    }
  }
}

async function applySambaSelinuxLabel() {
  if (!tempShareConfig.value?.path) {
    return;
  }

  labelingPathForSamba.value = true;
  try {
    await props.manager.labelPathForSamba(tempShareConfig.value).match(
      () => {
        reportSuccess(_("Applied Samba SELinux label to ") + tempShareConfig.value!.path);
        void checkSambaSelinuxLabel();
      },
      reportError
    );
  } finally {
    labelingPathForSamba.value = false;
  }
}

const macOSSharesOptions = BooleanKeyValueSuite(
  () => tempShareConfig.value?.advancedOptions ?? {},
  {
    include: {
      "fruit:encoding": "native",
      "fruit:metadata": "stream",
      "fruit:zero_file_id": "yes",
      "fruit:nfs_aces": "no",
      "vfs objects": ["catia", "fruit", "streams_xattr"],
    },
    exclude: {},
  }
);

const auditLogsOptions = BooleanKeyValueSuite(() => tempShareConfig.value?.advancedOptions ?? {}, {
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
    get: () => tempShareConfig.value?.inheritPermissions ?? false,
    set: (v) => {
      if (tempShareConfig.value) {
        tempShareConfig.value.inheritPermissions = v;
      }
    },
  })
);

const refreshMountpointOptions = () => {
  if (!tempShareConfig.value) {
    return;
  }
  props.manager.getMountpointOptions(tempShareConfig.value).map(({ mountpointOptions }) => {
    if (props.newShare && isCephOptions(mountpointOptions)) {
      // For new shares with ceph fs type, default to remount=true since that's the recommended configuration for ceph shares.
      mountpointOptions.remount = true;
    }
    tempShareConfig.value!.mountpointOptions = mountpointOptions;
  });
};

watch(
  () => tempShareConfig.value?.path,
  (path, _, onCleanup) => {
    ++selinuxCheckId;
    selinuxCheck.value = undefined;
    selinuxCheckFailed.value = false;
    checkingSelinux.value = false;
    refreshMountpointOptions();
    if (path) {
      const timer = window.setTimeout(() => void checkSambaSelinuxLabel(), 350);
      onCleanup(() => window.clearTimeout(timer));
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="space-y-content" v-if="tempShareConfig">
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
        :newShare="newShare ?? false"
        :fsType="tempShareConfig.mountpointOptions.fsType"
        @createDirectory="() => { refreshMountpointOptions(); void checkSambaSelinuxLabel(); }"
      />
      <div
        v-if="!['printers', 'print$'].includes(tempShareConfig.name.toLowerCase()) && (selinuxCheckFailed || selinuxCheck?.status === 'incomplete' || selinuxCheck?.status === 'needs-label' || selinuxCheck?.status === 'review')"
        class="space-y-2"
      >
        <ValidationResultView
          v-if="selinuxCheckFailed"
          type="warning"
          :message="_('Unable to check the SELinux label for this path.')"
        />
        <ValidationResultView
          v-else-if="selinuxCheck?.status === 'incomplete'"
          type="warning"
          :message="_('Could not verify SELinux labels throughout this share.')"
        />
        <template v-else-if="selinuxCheck?.status === 'needs-label' || selinuxCheck?.status === 'review'">
          <ValidationResultView
            type="warning"
            :message="(selinuxCheck.location === 'descendant'
              ? _('SELinux may block Samba on a file or subdirectory. Current type: ')
              : _('SELinux may block Samba on this path. Current type: ')) + selinuxCheck.actualType"
          />
          <p v-if="selinuxCheck.status === 'review'" class="text-feedback text-warning">
            {{ _("Confirm this label is not intentional before changing it.") }}
          </p>
          <button
            class="btn btn-secondary"
            @click="applySambaSelinuxLabel"
            :disabled="labelingPathForSamba || checkingSelinux || globalProcessingState !== 0"
          >
            {{ labelingPathForSamba ? _("Applying label...") : _("Apply Samba SELinux label") }}
          </button>
          <p class="text-xs">{{ _("Parent access and Linux permissions are unchanged.") }}</p>
        </template>
      </div>
      <CephOptionsView
        v-if="isCephOptions(tempShareConfig.mountpointOptions)"
        :path="tempShareConfig.path"
        :newShare="newShare"
        v-model:remount="tempShareConfig.mountpointOptions.remount"
        v-model:quotaBytes="tempShareConfig.mountpointOptions.quotaBytes"
        v-model:layoutPool="tempShareConfig.mountpointOptions.layoutPool"
        :layoutPools="tempShareConfig.mountpointOptions.possibleLayoutPools"
        :remountManagedByFileSharing="
          tempShareConfig.mountpointOptions.remountManagedByFileSharing
        "
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
  </div>
</template>
