<script setup lang="ts">
import { ref, computed } from "vue";
import {
  InputLabelWrapper,
  wrapActions,
  InputField,
  reportSuccess,
  Modal,
  CardContainer,
  ModeAndPermissionsEditor,
  ValidationResultView,
  ValidationScope,
  validationSuccess,
  validationWarning,
  validationError,
  type ValidationResultAction,
  computedResult,
} from "@45drives/houston-common-ui";
import {
  server as defaultServer,
  Directory,
  Server,
  FileSystemNode,
  type CommandOptions,
  Command,
} from "@45drives/houston-common-lib";
import { ResultAsync, ok, errAsync, err, okAsync } from "neverthrow";
import { useUserSettings } from "@/common/user-settings";

const _ = cockpit.gettext;

const userSettings = useUserSettings();

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    allowNonExisting?: boolean;
    validationScope: ValidationScope;
    newShare: boolean;
    server?: Server;
    fsType: string;
  }>(),
  { server: () => defaultServer }
);

const serverResult = computed(() => okAsync(props.server));

const emit = defineEmits<{
  (e: "input", path: string): void;
  (e: "change", path: string): void;
  (e: "createDirectory", path: string): void;
}>();

// const modified = defineModel<boolean>("modified", { default: false });

// const usePathInfo = (
//   path: Ref<string>,
//   serverResult?: ResultAsync<Server, ProcessError>,
//   commandOptions: CommandOptions = { superuser: "try" }
// ) => {
//   serverResult = serverResult ? serverResult : getServer();

//   const fsNode = (path: string) => serverResult.map((server) => new FileSystemNode(server, path));

//   const exists = ref<boolean>(false);
//   const updateExists = () => {
//     fsNode(path.value)
//       .andThen((node) => node.exists(commandOptions))
//       .map((existsValue) => (exists.value = existsValue));
//   };
//   watchEffect(updateExists);

//   const isDirectory = ref<boolean>(false);
//   const updateIsDirectory = () => {
//     if (!exists.value) {
//       isDirectory.value = false;
//     }
//     fsNode(path.value)
//       .andThen((node) => node.isDirectory(commandOptions))
//       .map((isDirectoryValue) => (isDirectory.value = isDirectoryValue));
//   };
//   watchEffect(updateIsDirectory);

//   const isFile = ref<boolean>(false);
//   const updateIsFile = () => {
//     if (!exists.value) {
//       isFile.value = false;
//     }
//     fsNode(path.value)
//       .andThen((node) => node.isFile(commandOptions))
//       .map((isFileValue) => (isFile.value = isFileValue));
//   };
//   watchEffect(updateIsFile);

//   const isAbsolute = computed<boolean>(() => new Path(path.value).isAbsolute());
//   const isRelative = computed<boolean>(() => !isAbsolute.value);

//   const { mountpointInfo, updateMountpointInfo } = useMountpointInfo(
//     path,
//     serverResult,
//     commandOptions
//   );

//   const subdirSuggestions = ref<string[]>([]);
//   const updateSubdirSuggestions = () => {
//     const pathFilter = `${path.value}*`;
//     fsNode(path.value)
//       .andThen((node) => node.findLongestExistingStem(commandOptions))
//       .map((node) => (node.path === path.value ? node.parent() : node))
//       .andThen((node) => new Directory(node).getChildren({ pathFilter, limit: 50 }))
//       .map((children) => (subdirSuggestions.value = children.map((node) => node.path)))
//       .mapErr(() => (subdirSuggestions.value = []));
//   };
//   watchEffect(updateSubdirSuggestions);

//   const forceUpdatePathInfo = () => {
//     updateExists();
//     updateIsDirectory();
//     updateIsFile();
//     updateMountpointInfo();
//     updateSubdirSuggestions();
//   };

//   return {
//     exists,
//     isDirectory,
//     isFile,
//     isAbsolute,
//     isRelative,
//     mountpointInfo,
//     forceUpdatePathInfo,
//     subdirSuggestions,
//   };
// };

const path = defineModel<string>("path", { required: true });

const [subdirSuggestions] = computedResult<string[]>(() => {
  const pathFilter = `${path.value}*`;
  const fsNode = new FileSystemNode(props.server, path.value);
  if (!fsNode.isAbsolute()) {
    return okAsync([]);
  }
  return fsNode
    .findLongestExistingStem({ superuser: "try" })
    .map((node) => (node.path === path.value ? node.parent() : node))
    .andThen((node) => new Directory(node).getChildren({ pathFilter, limit: 50 }))
    .map((children) => children.map((node) => node.path));
}, []);

// const { exists, isDirectory, isAbsolute, mountpointInfo, subdirSuggestions, forceUpdatePathInfo } =
//   usePathInfo(path, server);

const { validationResult: pathValidationResult } = props.validationScope.useValidator(() => {
  if (!path.value) {
    return validationError(_("Share path is required."));
  }

  const fsNode = new FileSystemNode(props.server, path.value);

  const commandOptions: CommandOptions = { superuser: "try" };

  const filesystem = props.fsType;

  if (!fsNode.isAbsolute()) {
    return validationError(_("Path not absolute") + `: ${path.value}`);
  }
  const exists = fsNode.exists();
  const isDirectory = fsNode.isDirectory(commandOptions);

  return ResultAsync.combine([exists, isDirectory])
    .map(([exists, isDirectory]) => {
      if (!exists) {
        const buttonActions: ValidationResultAction[] =
          filesystem === "zfs"
            ? [
                {
                  label: _("Create directory"),
                  callback: async () => {
                    await actions.createDirectory();
                  },
                },
                {
                  label: _("Create ZFS dataset"),
                  callback: async () => {
                    await actions.createZfsDataset();
                  },
                },
              ]
            : [
                {
                  label: _("Create now"),
                  callback: async () => {
                    await actions.createDirectory();
                  },
                },
              ];
        return (props.allowNonExisting ? validationWarning : validationError)(
          _("Path does not exist."),
          buttonActions
        );
      }
      if (!isDirectory) {
        return validationError(_("Path exists but is not a directory."));
      }
      return validationSuccess();
    })
    .orElse((e) => ok(validationError(_("Failed to validate path") + `: ${e.message}`)))
    .unwrapOr(validationError(_("Unknown error while validating path")));
});

const showPermissionsEditor = ref(false);

const modeAndPermissionsEditorRef = ref<InstanceType<typeof ModeAndPermissionsEditor> | null>(null);

const createDirectory = () =>
  new Directory(props.server, path.value)
    .create(true, { superuser: "try" })
    .map(() => reportSuccess(`Created directory '${path.value}'.`))
    .map(() => emit("createDirectory", path.value));

const createZfsDataset = () =>
  props.fsType !== "zfs"
    ? errAsync(new Error(`Not a ZFS filesystem: ${path.value}`))
    : new FileSystemNode(props.server, path.value)
        .resolve(false)
        .andThen((path) => {
          if (!path.isAbsolute()) {
            return err(new Error(`Path not absolute: ${path.path}`));
          }
          return path.getFilesystemMount({ superuser: "try" }).andThen((mountpointInfo) => {
            if (mountpointInfo.filesystem.type !== "zfs") {
              return err(
                new Error(
                  `Filesystem for path ${path.path} is not ZFS (found ${mountpointInfo.filesystem.type})`
                )
              );
            }
            const zfsFilesystem = mountpointInfo.filesystem.source;
            const mountPoint = mountpointInfo.mountpoint;
            if (!path.path.startsWith(mountPoint)) {
              return err(new Error(`Path (${path.path}) not within mountpoint (${mountPoint})`));
            }
            return ok(path.path.replace(mountPoint, zfsFilesystem));
          });
        })
        .andThen((dataset) =>
          props.server.execute(new Command(["zfs", "create", "-p", dataset], { superuser: "try" }))
        )
        .map(() => reportSuccess(`Created ZFS dataset '${path.value}'.`))
        .map(() => emit("createDirectory", path.value));

const actions = wrapActions({
  createDirectory,
  createZfsDataset,
});
</script>

<template>
  <InputLabelWrapper>
    <template #label>
      {{ _("Path") }}
    </template>
    <InputField
      v-model="path"
      :placeholder="_('Share path/directory')"
      :disabled="disabled"
      :suggestions="subdirSuggestions"
      @input="emit('input', path)"
      @change="emit('change', path)"
    />
    <ValidationResultView v-bind="pathValidationResult" />
    <button
      v-if="pathValidationResult.type === 'success'"
      @click="showPermissionsEditor = true"
      class="text-feedback text-primary"
    >
      {{ _("Edit permissions") }}
    </button>
  </InputLabelWrapper>
  <Modal :show="showPermissionsEditor">
    <CardContainer>
      <template #header> {{ _("Share Directory Permissions") }} </template>
      <ModeAndPermissionsEditor
        :path="path"
        :server="serverResult"
        :includeSystemUsers="userSettings.includeSystemAccounts"
        :includeSystemGroups="userSettings.includeSystemAccounts"
        :includeDomain="userSettings.includeDomainAccounts"
        @apply="showPermissionsEditor = false"
        @cancel="showPermissionsEditor = false"
        ref="modeAndPermissionsEditorRef"
      />
      <template #footer>
        <div class="button-group-row justify-end grow">
          <button class="btn btn-secondary" @click="() => modeAndPermissionsEditorRef?.cancel()">
            {{ _("Cancel") }}
          </button>
          <button class="btn btn-primary" @click="() => modeAndPermissionsEditorRef?.apply()">
            {{ _("Apply") }}
          </button>
        </div>
      </template>
    </CardContainer>
  </Modal>
  <template v-if="fsType === 'cifs'">
    <InputFeedback type="warning">
      {{ path + _(" is already shared through Samba/CIFS") }}
    </InputFeedback>
  </template>
</template>
