<script setup lang="ts">
import { ref, watchEffect, defineProps, computed, defineEmits } from "vue";
import type { SambaGlobalConfig } from "@/tabs/samba/data-types";
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
import { KeyValueSyntax } from "@45drives/houston-common-lib";
import { KeyValueOptionGroup } from "@/tabs/samba/ui/KeyValueOptionGroup"; // TODO: move to common-ui

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

const macOSSharesOptions = computed(
  new KeyValueOptionGroup(() => tempGlobalConfig.value?.advancedOptions ?? {})
    .requireValuesIf(true, "vfs objects", "catia fruit streams_xattr")
    .setOptionalValuesIf(true, "fruit:encoding", "native")
    .setOptionalValuesIf(true, "fruit:metadata", "stream")
    .setOptionalValuesIf(true, "fruit:zero_file_id", "yes")
    .setOptionalValuesIf(true, "fruit:nfs_aces", "no")
    .excludeKeysIf(false, /^fruit:/)
    .toGetterSetter()
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
          :parser="KeyValueSyntax({ trailingNewline: false })"
          v-model="tempGlobalConfig.advancedOptions"
        />
      </Disclosure>
    </div>

    <template v-slot:footer>
      <div class="button-group-row justify-end grow">
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
    </template>
  </CardContainer>
</template>
