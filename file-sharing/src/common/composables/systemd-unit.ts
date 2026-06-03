import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  getSystemdManager,
  type ISystemdManager,
  type SystemdUnitName,
  type SystemdUnit,
} from "@/common/systemd-manager";
import { Server } from "@45drives/houston-common-lib";
import { reportSuccess, wrapAction, assertConfirm } from "@45drives/houston-common-ui";
import { ResultAsync } from "neverthrow";

const _ = cockpit.gettext;

export const useSystemdUnit = (
  serviceName: SystemdUnitName,
  serviceManager: "user" | "system",
  server: Server | [Server, ...Server[]],
  quirks: { mustStopBeforeEnable?: boolean } = {}
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

  const ready = ref(false);

  let servicePollHandle: number | undefined = undefined;
  onMounted(() => {
    ResultAsync.combine([fetchRunning(), fetchEnabled(), fetchDescription()]).map(
      () => (ready.value = true)
    );
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
        .map(() => reportSuccess(`${value ? _("Started") : _("Stopped")} ${unit.name}.`))
        .andThen(() => fetchRunning())
    ),
  });

  const enabled = computed<boolean>({
    get: () => _enabled.value,
    set: wrapAction((value) => {
      let result;
      if (quirks.mustStopBeforeEnable && running.value && value && !enabled.value) {
        result = assertConfirm({
          header: _("Stop service before enabling?"),
          body: _(
            "Enabling the service while it is running can cause the service status to display incorrectly. Do you want to stop the service, enable it, and then start it again?"
          ),
          dangerous: true,
        })
          .andThen(() => manager.stop(unit))
          .andThen(() => fetchRunning())
          .andThen(() => manager.enable(unit))
          .andThen(() => manager.start(unit))
          .andThen(() => fetchRunning());
      } else {
        result = value ? manager.enable(unit) : manager.disable(unit);
      }
      return result
        .map(() => reportSuccess(`${value ? _("Enabled") : _("Disabled")} ${unit.name}.`))
        .andThen(() => fetchEnabled());
    }),
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
    ready,
  };
};
