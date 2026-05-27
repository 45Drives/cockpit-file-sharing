import { computed, isRef, onMounted, onUnmounted, ref, type Ref, shallowRef } from "vue";
import {
  getSystemdManager,
  type ISystemdManager,
  type SystemdUnitName,
  type SystemdUnit,
} from "@/common/systemd-manager";
import { Server, unwrap } from "@45drives/houston-common-lib";
import { computedResult, reportSuccess, wrapAction } from "@45drives/houston-common-ui";

export const useSystemdUnit = (
  serviceName: SystemdUnitName,
  serviceManager: "user" | "system",
  server: Server | [Server, ...Server[]]
) => {
  const manager: ISystemdManager = Array.isArray(server)
    ? getSystemdManager(server, serviceManager)
    : getSystemdManager(server, serviceManager);

  const unit: SystemdUnit = { name: serviceName };

  const _running = ref(false);
  const fetchRunning = () => manager.checkActive(unit).map((result) => (_running.value = result));
  const _enabled = ref(false);
  const fetchEnabled = () => manager.checkEnabled(unit).map((result) => (_enabled.value = result));
  const description = ref("");
  const fetchDescription = () =>
    manager.getUnitDescription(unit).map((result) => (description.value = result));

  let servicePollHandle: number | undefined = undefined;
  onMounted(() => {
    fetchRunning();
    fetchEnabled();
    fetchDescription();
    if (servicePollHandle !== undefined) {
      window.clearInterval(servicePollHandle);
    }
    servicePollHandle = window.setInterval(() => {
      fetchRunning();
      fetchEnabled();
    }, 5000);
  });

  onUnmounted(() => {
    if (servicePollHandle !== undefined) {
      window.clearInterval(servicePollHandle);
      servicePollHandle = undefined;
    }
  });

  const running = computed<boolean>({
    get: () => _running.value,
    set: wrapAction((value) =>
      (value ? manager.start(unit) : manager.stop(unit))
        .map(() => reportSuccess(`${value ? "Started" : "Stopped"} ${unit.name}.`))
        .andThen(() => fetchRunning())
    ),
  });

  const enabled = computed<boolean>({
    get: () => _enabled.value,
    set: wrapAction((value) =>
      (value ? manager.enable(unit) : manager.disable(unit))
        .map(() => reportSuccess(`${value ? "Enabled" : "Disabled"} ${unit.name}.`))
        .andThen(() => fetchEnabled())
    ),
  });

  const getStatus = () => manager.getStatus(unit);

  return {
    running,
    enabled,
    refresh: () => {
      fetchRunning();
      fetchEnabled();
    },
    description,
    getStatus,
  };
};
