<script setup lang="ts">
import { useUserSettings, type TabVisibility } from "@/common/user-settings";
import {
  InputLabelWrapper,
  InputField,
  ToggleSwitch,
  useTempObjectStaging,
  CardContainer,
  SelectMenu,
  type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { StringToIntCaster } from "@45drives/houston-common-lib";
import { computed, defineEmits } from "vue";

const _ = cockpit.gettext;

const emit = defineEmits<{
  (e: "close"): void;
}>();

const userSettings = useUserSettings();
const { tempObject: tempUserSettings, modified, resetChanges } = useTempObjectStaging(userSettings);

const applyChanges = () => (userSettings.value = tempUserSettings.value);

const iscsiSubnetMaskInput = computed<string>({
  get: () => tempUserSettings.value.iscsi.subnetMask.toString(),
  set: (value: string) =>
    StringToIntCaster()(value).map((value) => (tempUserSettings.value.iscsi.subnetMask = value)),
});

const tabVisibilityOptions: SelectMenuOption<TabVisibility>[] = [
  {
    label: _("Auto"),
    value: "auto",
  },
  {
    label: _("Always Show"),
    value: "always",
  },
  {
    label: _("Always Hide"),
    value: "never",
  },
];
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
      <InputLabelWrapper>
        <template #label>
          {{ _("Samba Tab Visibility") }}
        </template>
        <SelectMenu
          v-model="tempUserSettings.samba.tabVisibility"
          :options="tabVisibilityOptions"
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
      <InputLabelWrapper>
        <template #label>
          {{ _("NFS Tab Visibility") }}
        </template>
        <SelectMenu
          v-model="tempUserSettings.nfs.tabVisibility"
          :options="tabVisibilityOptions"
        />
      </InputLabelWrapper>
      <div class="text-header">iSCSI</div>
      <InputLabelWrapper>
        <template #label>
          {{ _("Configuration Path") }}
        </template>
        <InputField disabled
          v-model="tempUserSettings.iscsi.confPath"
          class="w-full"
          placeholder="default: /etc/scst.conf"
        />
      </InputLabelWrapper>
      <InputLabelWrapper>
        <template #label>
          {{ _("iSCSI Subnet Mask") }}
        </template>
        <InputField v-model="iscsiSubnetMaskInput" type="number" class="w-full" />
      </InputLabelWrapper>
      <ToggleSwitch v-model="tempUserSettings.iscsi.clusteredServer">
        {{ _("Clustered Server") }}
      </ToggleSwitch>
      <InputLabelWrapper>
        <template #label>
          {{ _("iSCSI Tab Visibility") }}
        </template>
        <SelectMenu
          v-model="tempUserSettings.iscsi.tabVisibility"
          :options="tabVisibilityOptions"
        />
      </InputLabelWrapper>
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
