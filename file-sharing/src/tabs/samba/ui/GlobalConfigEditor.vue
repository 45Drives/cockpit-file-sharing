<script setup lang="ts">
import { ref, onMounted, watch, watchEffect, inject } from "vue";
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
  wrapActions,
  reportSuccess,
  type SelectMenuOption,
} from "@45drives/houston-common-ui";
import { KeyValueSyntax } from "@45drives/houston-common-lib";
import { BooleanKeyValueSuite } from "@/tabs/samba/ui/BooleanKeyValueSuite"; // TODO: move to common-ui
import { getSambaManager } from "@/tabs/samba/samba-manager";
import { clusterScopeInjectionKey } from "@/common/injectionKeys";

const _ = cockpit.gettext;

const globalConf = ref<SambaGlobalConfig>();

const { tempObject: tempGlobalConfig, modified, resetChanges } = useTempObjectStaging(globalConf);

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
      "vfs objects": "catia fruit streams_xattr",
    },
    exclude: {},
  }
);

const logLevelOptions: SelectMenuOption<number>[] = [5, 4, 3, 2, 1, 0].map((n) => ({
  label: n.toString(),
  value: n,
}));

const clusterScope = inject(clusterScopeInjectionKey);

if (clusterScope === undefined) {
  throw new Error("clusterScope not provided!");
}

const sambaManager = clusterScope.map((scope) => getSambaManager(scope));

const loadGlobalSettings = () =>
  sambaManager.andThen((sm) => sm.getGlobalConfig()).map((config) => (globalConf.value = config));

const applyGlobalSettings = (newSettings: SambaGlobalConfig) =>
  sambaManager
    .andThen((sm) => sm.editGlobal(newSettings))
    .andThen(() => loadGlobalSettings())
    .map(() => reportSuccess(_("Updated global Samba configuration.")));

const actions = wrapActions({
  loadGlobalSettings,
  applyGlobalSettings,
});

onMounted(actions.loadGlobalSettings);
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
          @click="() => tempGlobalConfig && actions.applyGlobalSettings(tempGlobalConfig)"
          :disabled="!modified"
        >
          {{ _("Apply") }}
        </button>
      </div>
    </template>
  </CardContainer>
</template>
