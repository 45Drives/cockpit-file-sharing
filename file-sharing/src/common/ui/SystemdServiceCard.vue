<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { type SystemdUnitName } from "@/common/systemd-manager";
import { server as defaultServer, Server } from "@45drives/houston-common-lib";

import { useSystemdUnit } from "@/common/composables/systemd-unit";
import { ExclamationTriangleIcon } from "@heroicons/vue/24/solid";
import type { ResultAsync } from "neverthrow";
import {
  CardContainer,
  ToggleSwitchGroup,
  ToggleSwitch,
  pushNotification,
  Notification,
  Disclosure,
  reportError,
} from "@45drives/houston-common-ui";

const _ = cockpit.gettext;

const props = withDefaults(
  defineProps<{
    serviceName: SystemdUnitName;
    serviceManager?: "user" | "system";
    server?: Server | [Server, ...Server[]];
    name?: string;
    warnIfStopped?: boolean | string;
  }>(),
  {
    serviceManager: "system",
    server: () => defaultServer,
    warnIfStopped: false,
  }
);

const { running, enabled, refresh, description, getStatus, ready } = useSystemdUnit(
  props.serviceName,
  props.serviceManager,
  props.server
);

const name = computed(() => props.name ?? description.value ?? props.serviceName);

const startSwitchRef = ref<InstanceType<typeof ToggleSwitch> | null>(null);
const enableSwitchRef = ref<InstanceType<typeof ToggleSwitch> | null>(null);

if (props.warnIfStopped) {
  let stoppedWarning: Notification | undefined = undefined;
  let disabledWarning: Notification | undefined = undefined;
  watch(
    [name, running, enabled, ready],
    ([newName, newRunning, newEnabled, ready], [oldName]) => {
      stoppedWarning?.remove();
      disabledWarning?.remove();
      if (newName !== oldName || !stoppedWarning || !disabledWarning) {
        stoppedWarning = new Notification(
          newName + _(" is not running."),
          typeof props.warnIfStopped === "string"
            ? props.warnIfStopped
            : _("Consider starting it to ensure your server behaves as expected."),
          "warning",
          "never"
        ).addAction(_("Start now"), async () => {
          await startSwitchRef.value?.$el.scrollIntoView({ behavior: "smooth" });
          running.value = true;
        });
        disabledWarning = new Notification(
          newName + _(" is not enabled."),
          typeof props.warnIfStopped === "string"
            ? props.warnIfStopped
            : _("Consider enabling it to ensure your server behaves as expected."),
          "warning",
          "never"
        ).addAction(_("Enable now"), async () => {
          await enableSwitchRef.value?.$el.scrollIntoView({ behavior: "smooth" });
          await new Promise((resolve) => setTimeout(resolve, 500)); // pause for a moment
          enabled.value = true;
        });
      }
      if (!ready) {
        return;
      }
      if (!newRunning) {
        pushNotification(stoppedWarning);
      }
      if (!newEnabled) {
        pushNotification(disabledWarning);
      }
    },
    { immediate: true }
  );
}

const status = ref<ReturnType<typeof getStatus> extends ResultAsync<infer T, any> ? T : never>("");
const fetchStatus = () =>
  getStatus()
    .map((s) => (status.value = s))
    .mapErr(reportError);
const showStatus = ref(false);
let pollStatusInterval: number | undefined = undefined;
watch([showStatus, running, enabled], () => {
  if (showStatus.value) {
    fetchStatus();
    if (pollStatusInterval === undefined) {
      pollStatusInterval = window.setInterval(() => fetchStatus(), 5000);
    }
  } else if (pollStatusInterval !== undefined) {
    window.clearInterval(pollStatusInterval);
    pollStatusInterval = undefined;
  }
});

defineExpose({
  refresh,
});
</script>

<template>
  <CardContainer>
    <template #header>
      {{ _(name) }}
    </template>
    <div class="space-y-content">
      <ToggleSwitchGroup>
        <ToggleSwitch v-model="running" ref="startSwitchRef">
          <div class="inline-flex flex-row gap-1">
            {{ _(name) }}
            {{ running ? _(" is running.") : _("is stopped.") }}
            <ExclamationTriangleIcon v-if="!running" class="size-icon icon-warning" />
          </div>
          <template #description>
            {{ running ? _("Click toggle to stop.") : _("Click toggle to start.") }}
          </template>
        </ToggleSwitch>
        <ToggleSwitch v-model="enabled" ref="enableSwitchRef">
          {{ _(name) }}
          {{ enabled ? _("is enabled.") : _("is disabled.") }}
          <template #description>
            {{ enabled ? _("Click toggle to disable.") : _("Click toggle to enable.") }}
            <br />
            {{ _("When enabled, the service will automatically start when the system boots.") }}
          </template>
        </ToggleSwitch>
      </ToggleSwitchGroup>
      <div class="button-group-row flex-wrap">
        <Disclosure v-model:show="showStatus">
          <template v-slot:label>
            {{ _("Full Status") }}
          </template>
          <div class="space-y-content sm:pl-4">
            <template v-if="Array.isArray(status)">
              <template v-for="s in status">
                <div>
                  <div class="text-label">{{ s.host }}</div>
                  <div class="sm:pl-4">
                    <div
                      class="whitespace-pre text-sm bg-well rounded-lg px-4 py-2 overflow-x-auto"
                    >
                      <code>{{ s.status }}</code>
                    </div>
                  </div>
                </div>
              </template>
            </template>
            <div v-else-if="status">
              <div class="whitespace-pre text-sm bg-well rounded-lg px-4 py-2 overflow-x-auto">
                <code>{{ status }}</code>
              </div>
            </div>
            <div v-else>
              {{ _("Loading...") }}
            </div>
          </div>
        </Disclosure>
      </div>
    </div>
  </CardContainer>
</template>
