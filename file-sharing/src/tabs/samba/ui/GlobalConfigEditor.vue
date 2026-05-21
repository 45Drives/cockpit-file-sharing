<script setup lang="ts">
import { inject, ref, watchEffect, computed } from "vue";
import {
  InputField,
  InputLabelWrapper,
  ToggleSwitch,
  ToggleSwitchGroup,
  CardContainer,
  ParsedTextArea,
  Disclosure,
  SelectMenu,
  useTempObjectStaging,
  type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { KeyValueSyntax, SambaGlobalConfig } from "@45drives/houston-common-lib";
import { BooleanKeyValueSuite } from "@/tabs/samba/ui/BooleanKeyValueSuite"; // TODO: move to common-ui
import ManageSambaPasswordsButton from '@/tabs/samba/ui/ManageSambaPasswordsButton.vue';
import { readOnlyInjectionKey } from "@/common/injectionKeys";

const readOnly = inject(readOnlyInjectionKey, computed(() => false));

const _ = cockpit.gettext;

const props = defineProps<{
  globalConf: SambaGlobalConfig;
}>();

const emit = defineEmits<{
  (e: "apply", newGlobalConf: SambaGlobalConfig, callback?: () => void): void;
}>();

const {
  tempObject: tempGlobalConfig,
  modified,
  resetChanges,
} = useTempObjectStaging(computed(() => props.globalConf));

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
    </template>

    <div v-if="tempGlobalConfig" class="space-y-content">
    <fieldset :disabled="readOnly" class="space-y-content !m-0 !p-0 border-0">
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
    </fieldset>
      <!-- Disclosure lives outside the fieldset so its toggle button stays
           interactive in read-only mode (read-only operators still want to
           inspect what's in Advanced). The inner ParsedTextArea sits in its
           own fieldset so editing is still blocked. -->
      <Disclosure v-model:show="revealAdvancedTextarea">
        <template v-slot:label>
          {{ _("Advanced") }}
        </template>
        <fieldset :disabled="readOnly" class="!m-0 !p-0 border-0">
          <ParsedTextArea
            :parser="KeyValueSyntax({ trailingNewline: false })"
            v-model="tempGlobalConfig.advancedOptions"
          />
        </fieldset>
      </Disclosure>
    </div>

    <template v-slot:footer>
      <div class="button-group-row justify-between grow flex-wrap">
        <ManageSambaPasswordsButton v-if="!readOnly" />
        <div v-if="!readOnly" class="button-group-row">
          <button class="btn btn-secondary" @click="resetChanges" v-if="modified">
            {{ _("Cancel") }}
          </button>
          <button
            class="btn btn-primary"
            @click="() => tempGlobalConfig && emit('apply', tempGlobalConfig)"
            :disabled="!modified"
          >
            {{ _("Apply") }}
          </button>
        </div>
      </div>
    </template>
  </CardContainer>
</template>
