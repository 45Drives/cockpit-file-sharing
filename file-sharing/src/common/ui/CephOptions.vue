<script setup lang="ts">
import { getSystemdManager, type SystemdUnit } from "@/common/systemd-manager";
import { inject, defineProps, computed, ref, watchEffect, type Ref, type ComputedRef } from "vue";
import { clusterScopeInjectionKey } from "@/common/injectionKeys";
import { useMountpointInfo } from "@/common/useMountpointInfo";
import { ResultAsync, okAsync, safeTry, ok } from "neverthrow";
import { FileSystemNode, Server } from "@45drives/houston-common-lib";
import { wrapActions, ToggleSwitch, reportError } from "@45drives/houston-common-ui";

const _ = cockpit.gettext;

const SYSTEMD_MOUNT_DESCRIPTION = "share remount created by cockpit-file-sharing";

const props = defineProps<{
  path: string;
}>();

const clusterScope = inject(clusterScopeInjectionKey);

if (clusterScope === undefined) {
  throw new Error("clusterScope not provided!");
}

const path = computed(() => props.path);

function resultAsyncComputed<T>(
  getter: () => ResultAsync<T, any>
): [reference: Readonly<Ref<T | undefined>>, updateReference: () => void];
function resultAsyncComputed<T>(
  getter: () => ResultAsync<T, any>,
  defaultValue: T
): [reference: Readonly<Ref<T>>, updateReference: () => void];
function resultAsyncComputed<T>(
  getter: () => ResultAsync<T, any>,
  defaultValue?: T
): [reference: Readonly<Ref<T | undefined>>, updateReference: () => void] {
  const reference = ref<T>();
  reference.value = defaultValue;
  const updateReference = () => getter().map((v) => (reference.value = v));
  watchEffect(updateReference);
  return [reference, updateReference];
}

const pathMountInfoFactory = (server: Server) => {
  const getResolvedNode = (path: string) => new FileSystemNode(server, path).resolve(true);

  const pathIsMountpoint = (path: string) =>
    getResolvedNode(path)
      .andThen((node) => node.getFilesystemMount().map((mount) => ({ node, mount })))
      .map(({ node, mount }) => node.path === mount.mountpoint);

  const systemdManager = getSystemdManager([server], "system");

  const getSystemdMountSettings = (path: string) =>
    getResolvedNode(path)
      .andThen((node) => systemdManager.pathToMountUnitName(node.path))
      .andThen((mountUnitName) => systemdManager.getSettings({ name: mountUnitName }));

  const pathRemountedByFileSharing = (path: string) =>
    getSystemdMountSettings(path).map(
      (mountSettings) => mountSettings.Unit?.Description === SYSTEMD_MOUNT_DESCRIPTION
    );

  return {
    pathIsMountpoint,
    pathRemountedByFileSharing,
  };
};

const [mountInfoPerServer, updateMountInfoPerServer] = resultAsyncComputed(
  () =>
    clusterScope.map((servers) =>
      servers.map((server) => {
        const f = pathMountInfoFactory(server);
        const [pathIsMountpoint, updatePathIsMountpoint] = resultAsyncComputed(
          () => f.pathIsMountpoint(path.value),
          false
        );
        const [pathRemountedByFileSharing, updatePathRemoupathRemountedByFileSharing] =
          resultAsyncComputed(() => f.pathRemountedByFileSharing(path.value), false);

        return {
          pathIsMountpoint,
          pathRemountedByFileSharing,
          updatePathIsMountpoint,
          updatePathRemoupathRemountedByFileSharing,
        };
      })
    ),
  []
);

const pathIsMountpoint = computed(() =>
  mountInfoPerServer.value.every(({ pathIsMountpoint }) => pathIsMountpoint)
);
const pathRemountedByFileSharing = computed(() =>
  mountInfoPerServer.value.every(({ pathRemountedByFileSharing }) => pathRemountedByFileSharing)
);

// const [remountedForCephQuotas, updateRemountedForCephQuotas] = resultAsyncComputed(
//   () => {
//     const currentPath = path.value;
//     const currentPathNode = (server: Server) => new FileSystemNode(server, currentPath);
//     return clusterScope.andThen((servers) =>
//       ResultAsync.combine(
//         // for each server
//         servers.map((server) => {
//           return new ResultAsync(
//             safeTry(async function* () {
//               const mountpoint = yield* currentPathNode(server)
//                 .findLongestExistingStem()
//                 .andThen((node) => node.getFilesystemMount())
//                 .safeUnwrap();
//               const resolvedCurrentPath = yield* currentPathNode(server).resolve(true).safeUnwrap();
//               const pathIsMountpoint = resolvedCurrentPath.path === mountpoint.mountpoint;
//               const remountedByFileSharing =
//                 pathIsMountpoint &&
//                 (yield* systemdManager
//                   .andThen((sdm) =>
//                     sdm
//                       .escape(mountpoint.mountpoint, { path: true, suffix: "mount" })
//                       .andThen((mountUnitName) =>
//                         sdm.getSettings({ name: mountUnitName } as SystemdUnit<"mount">)
//                       )
//                       .map((mountSettings) => {
//                         console.log("mount settings for", currentPath);
//                         console.log(mountSettings);
//                         return mountSettings.Unit?.Description === SYSTEMD_MOUNT_DESCRIPTION;
//                       })
//                   )
//                   .safeUnwrap());
//               return ok({
//                 pathIsMountpoint,
//                 remountedByFileSharing,
//               });
//             })
//           );
//         })
//       ).map((results) =>
//         // combine results of all cluster servers
//         ({
//           pathIsMountpoint: results.every(({ pathIsMountpoint }) => pathIsMountpoint),
//           remountedByFileSharing: results.every(
//             ({ remountedByFileSharing }) => remountedByFileSharing
//           ),
//         })
//       )
//     );
//   },
//   { pathIsMountpoint: false, remountedByFileSharing: false }
// );

// const systemdManager = clusterScope.map((scope) => getSystemdManager(scope));

const createRemounts = () => okAsync(null);

const removeRemounts = () => okAsync(null);

const actions = wrapActions({
  createRemounts,
  removeRemounts,
});

const remountedForCephQuotasInput = computed<boolean>({
  get: () =>
    pathIsMountpoint.value,
  set: (value) => (value ? actions.createRemounts() : actions.removeRemounts()),
});
</script>

<template>
  <div class="space-y-content">
    <ToggleSwitch
      v-if="
        !pathIsMountpoint || pathRemountedByFileSharing
      "
      v-model="remountedForCephQuotasInput"
    >
      {{ _("Enable Ceph Remount") }}
      <template #tooltip>
        When creating a Ceph share, a new filesystem mount point is created on top of the share
        directory. This is needed for Windows to properly report quotas through Samba.
      </template>
    </ToggleSwitch>
  </div>
</template>
