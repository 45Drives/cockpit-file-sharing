<script setup lang="ts">
import { useUserSettings } from "@/common/user-settings";
import {
  InputLabelWrapper,
  InputField,
  ToggleSwitch,
  useTempObjectStaging,
  CardContainer,
} from "@45drives/houston-common-ui";
import { defineEmits } from "vue";

const _ = cockpit.gettext;

const emit = defineEmits<{
  (e: "close"): void;
}>();

const userSettings = useUserSettings();
const { tempObject: tempUserSettings, modified, resetChanges } = useTempObjectStaging(userSettings);

const applyChanges = () => (userSettings.value = tempUserSettings.value);
</script>

<template>
  <CardContainer>
    <template #header>
      <div class="space-x-1">
        <span>
          {{ _("File Sharing Settings") }}
        </span>
        <span v-if="modified">*</span>
      </div>
    </template>
    <div class="space-y-content">
      <ToggleSwitch v-model="tempUserSettings.includeSystemAccounts">
        {{ _("Include System Accounts") }}
        <template #description>
          {{ _("Include local users/groups with uids/gids between 0 and 1000 in dropdown lists.") }}
        </template>
      </ToggleSwitch>
      <div class="text-header">Samba</div>
      <InputLabelWrapper>
        <template #label>
          {{ _("Configuration Path") }}
        </template>
        <InputField
          v-model="tempUserSettings.samba.confPath"
          class="w-full"
          placeholder="default: /etc/samba/smb.conf"
        />
      </InputLabelWrapper>
      <div class="text-header">NFS</div>
      <InputLabelWrapper>
        <template #label>
          {{ _("Configuration Path") }}
        </template>
        <InputField
          v-model="tempUserSettings.nfs.confPath"
          class="w-full"
          placeholder="default: /etc/exports.d/cockpit-file-sharing.exports"
        />
      </InputLabelWrapper>
      <div class="text-header">iSCSI</div>
      <InputLabelWrapper>
        <template #label>
          {{ _("Configuration Path") }}
        </template>
        <InputField
          v-model="tempUserSettings.iscsi.confPath"
          class="w-full"
          placeholder="default: /tmp/iSCSI.conf"
        />
      </InputLabelWrapper>
      <InputLabelWrapper>
        <template #label>
          {{ _("iSCSI Subnet Mask") }}
        </template>
        <InputField
          v-model="tempUserSettings.iscsi.subnetMask"
          type: number
          class="w-full"
        />
      </InputLabelWrapper>
      <ToggleSwitch v-model="tempUserSettings.iscsi.clusteredServer">
        {{ _("Clustered Server") }}
      </ToggleSwitch>
    </div>
    <template #footer>
      <div class="button-group-row justify-end">
        <button
          @click="
            () => {
              resetChanges();
              emit('close');
            }
          "
          class="btn btn-secondary"
        >
          {{ _("Cancel") }}
        </button>
        <button
          :disabled="!modified"
          @click="
            () => {
              applyChanges();
              emit('close');
            }
          "
          class="btn btn-primary"
        >
          {{ _("Apply") }}
        </button>
      </div>
    </template>
  </CardContainer>
</template>
