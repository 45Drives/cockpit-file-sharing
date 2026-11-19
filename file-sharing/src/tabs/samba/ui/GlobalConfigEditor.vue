<script setup lang="ts">
import { ref, watchEffect, computed, watch } from "vue";
import {
  InputField,
  InputLabelWrapper,
  ToggleSwitch,
  ToggleSwitchGroup,
  CardContainer,
  ParsedTextArea,
  Disclosure,
  SelectMenu,
  ValidationResultView,
  useTempObjectStaging,
  type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { KeyValueSyntax, SambaGlobalConfig } from "@45drives/houston-common-lib";
import { BooleanKeyValueSuite } from "@/tabs/samba/ui/BooleanKeyValueSuite"; // TODO: move to common-ui
import ManageSambaPasswordsButton from '@/tabs/samba/ui/ManageSambaPasswordsButton.vue';
import type { ActiveDirectoryConfigurationCheck } from "../samba-manager";

const _ = cockpit.gettext;

const props = defineProps<{
  globalConf: SambaGlobalConfig;
  activeDirectoryCheck?: ActiveDirectoryConfigurationCheck;
}>();

const emit = defineEmits<{
  (e: "apply", newGlobalConf: SambaGlobalConfig, callback?: () => void): void;
}>();

const {
  tempObject: tempGlobalConfig,
  modified,
  resetChanges,
} = useTempObjectStaging(computed(() => props.globalConf));

const advancedParser = KeyValueSyntax({ trailingNewline: false });
const pendingAdvancedEdit = ref(false);
const advancedInputValid = ref(true);

function onAdvancedInput(event: Event) {
  advancedParser.apply((event.target as HTMLTextAreaElement).value).match(
    (advancedOptions) => {
      advancedInputValid.value = true;
      const stagedOptions = tempGlobalConfig.value?.advancedOptions ?? {};
      pendingAdvancedEdit.value = Object.keys(advancedOptions).length !== Object.keys(stagedOptions).length ||
        Object.entries(advancedOptions).some(([key, value]) => stagedOptions[key] !== value);
    },
    () => {
      advancedInputValid.value = false;
      pendingAdvancedEdit.value = true;
    }
  );
}

function cancelChanges() {
  pendingAdvancedEdit.value = false;
  advancedInputValid.value = true;
  resetChanges();
}

watch(() => props.globalConf, () => {
  pendingAdvancedEdit.value = false;
  advancedInputValid.value = true;
});

const revealAdvancedTextarea = ref(false);
watchEffect(() => {
  if (Object.entries(tempGlobalConfig.value?.advancedOptions ?? {}).length) {
    revealAdvancedTextarea.value = true;
  }
});

const macOSSharesOptions = BooleanKeyValueSuite(
  () => tempGlobalConfig.value?.advancedOptions ?? {},
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

const logLevelOptions: SelectMenuOption<number>[] = [5, 4, 3, 2, 1, 0].map((n) => ({
  label: n.toString(),
  value: n,
}));
</script>

<template>
  <CardContainer>
    <template v-slot:header>
      {{ _("Global Configuration") }}
      <span v-if="modified" class="ml-1"> *</span>
      <span v-if="activeDirectoryCheck?.enabled" class="ml-2 text-sm font-normal">
        {{ activeDirectoryCheck.sambaConfigured && activeDirectoryCheck.joinHealthy && activeDirectoryCheck.trustHealthy
          ? _("AD join and trust OK") : _("AD needs attention") }}
      </span>
    </template>

    <div v-if="tempGlobalConfig" class="space-y-content">
      <ValidationResultView
        v-if="activeDirectoryCheck?.enabled && !activeDirectoryCheck.sambaConfigured"
        type="warning"
        :message="_('AD membership needs a workgroup and realm. Review Workgroup and Advanced options.')"
      />
      <ValidationResultView
        v-else-if="activeDirectoryCheck?.enabled && !activeDirectoryCheck.toolsAvailable"
        type="warning"
        :message="_('Cannot verify the domain join; Samba and Winbind tools are required.')"
      />
      <ValidationResultView
        v-else-if="activeDirectoryCheck?.enabled && (!activeDirectoryCheck.joinHealthy || !activeDirectoryCheck.trustHealthy)"
        type="warning"
        :message="_('The domain join or machine trust failed. Check domain DNS, system time, and the machine account with your AD administrator.')"
      />
      <InputLabelWrapper>
        <template #label>
          {{ _("Server Description") }}
        </template>
        <InputField
          :placeholder="_('Description of server')"
          v-model="tempGlobalConfig.serverString"
        />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Workgroup") }}
        </template>
        <InputField
          label="Workgroup"
          placeholder="WORKGROUP"
          v-model="tempGlobalConfig.workgroup"
        />
      </InputLabelWrapper>

      <InputLabelWrapper>
        <template #label>
          {{ _("Log Level") }}
        </template>
        <SelectMenu v-model="tempGlobalConfig.logLevel" :options="logLevelOptions" />
      </InputLabelWrapper>

      <ToggleSwitchGroup>
        <ToggleSwitch v-model="macOSSharesOptions">
          {{ _("Global MacOS Shares") }}
          <template v-slot:description>
            {{ _("Optimize all shares for MacOS") }}
          </template>
        </ToggleSwitch>
      </ToggleSwitchGroup>
      <Disclosure v-model:show="revealAdvancedTextarea">
        <template v-slot:label>
          {{ _("Advanced") }}
        </template>
        <ParsedTextArea
          :parser="advancedParser"
          v-model="tempGlobalConfig.advancedOptions"
          @input="onAdvancedInput"
        />
      </Disclosure>
    </div>

    <template v-slot:footer>
      <div class="button-group-row justify-between grow flex-wrap">
        <ManageSambaPasswordsButton />
        <div class="button-group-row">
          <button class="btn btn-secondary" @click="cancelChanges" v-if="modified || pendingAdvancedEdit">
            {{ _("Cancel") }}
          </button>
          <button
            class="btn btn-primary"
            @click="() => tempGlobalConfig && emit('apply', tempGlobalConfig)"
            :disabled="!advancedInputValid || (!modified && !pendingAdvancedEdit)"
          >
            {{ _("Apply") }}
          </button>
        </div>
      </div>
    </template>
  </CardContainer>
</template>
