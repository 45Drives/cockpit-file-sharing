<script setup lang="ts">
import { ref, defineModel, watchEffect, type Ref, computed, defineEmits } from "vue";
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
} from "@45drives/houston-common-ui";
import {
  getServer,
  Directory,
  ProcessError,
  Server,
  FileSystemNode,
  type CommandOptions,
  Path,
  Command,
} from "@45drives/houston-common-lib";
import { ResultAsync, ok, errAsync, err } from "neverthrow";
import CephOptions from "@/common/ui/CephOptions.vue";
import { useMountpointInfo } from "@/common/useMountpointInfo";
import { useUserSettings } from "@/common/user-settings";

const _ = cockpit.gettext;

const userSettings = useUserSettings();

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    allowNonExisting?: boolean;
    validationScope: ValidationScope;
  }>(),
  {}
);

const emit = defineEmits<{
  (e: "input", path: string): void;
  (e: "change", path: string): void;
}>();

const usePathInfo = (
  path: Ref<string>,
  serverResult?: ResultAsync<Server, ProcessError>,
  commandOptions: CommandOptions = { superuser: "try" }
) => {
  serverResult = serverResult ? serverResult : getServer();

  const fsNode = (path: string) => serverResult.map((server) => new FileSystemNode(server, path));

  const exists = ref<boolean>(false);
  const updateExists = () => {
    fsNode(path.value)
      .andThen((node) => node.exists(commandOptions))
      .map((existsValue) => (exists.value = existsValue));
  };
  watchEffect(updateExists);

  const isDirectory = ref<boolean>(false);
  const updateIsDirectory = () => {
    if (!exists.value) {
      isDirectory.value = false;
    }
    fsNode(path.value)
      .andThen((node) => node.isDirectory(commandOptions))
      .map((isDirectoryValue) => (isDirectory.value = isDirectoryValue));
  };
  watchEffect(updateIsDirectory);

  const isFile = ref<boolean>(false);
  const updateIsFile = () => {
    if (!exists.value) {
      isFile.value = false;
    }
    fsNode(path.value)
      .andThen((node) => node.isFile(commandOptions))
      .map((isFileValue) => (isFile.value = isFileValue));
  };
  watchEffect(updateIsFile);

  const isAbsolute = computed<boolean>(() => new Path(path.value).isAbsolute());
  const isRelative = computed<boolean>(() => !isAbsolute.value);

  const { mountpointInfo, updateMountpointInfo } = useMountpointInfo(
    path,
    serverResult,
    commandOptions
  );

  const subdirSuggestions = ref<string[]>([]);
  const updateSubdirSuggestions = () => {
    const pathFilter = `${path.value}*`;
    fsNode(path.value)
      .andThen((node) => node.findLongestExistingStem(commandOptions))
      .map((node) => (node.path === path.value ? node.parent() : node))
      .andThen((node) => new Directory(node).getChildren({ pathFilter, limit: 50 }))
      .map((children) => (subdirSuggestions.value = children.map((node) => node.path)))
      .mapErr(() => (subdirSuggestions.value = []));
  };
  watchEffect(updateSubdirSuggestions);

  const forceUpdatePathInfo = () => {
    updateExists();
    updateIsDirectory();
    updateIsFile();
    updateMountpointInfo();
    updateSubdirSuggestions();
  };

  return {
    exists,
    isDirectory,
    isFile,
    isAbsolute,
    isRelative,
    mountpointInfo,
    forceUpdatePathInfo,
    subdirSuggestions,
  };
};

const server = getServer();

const path = defineModel<string>("path", { required: true });

const { exists, isDirectory, isAbsolute, mountpointInfo, subdirSuggestions, forceUpdatePathInfo } =
  usePathInfo(path, server);

const { validationResult: pathValidationResult } = props.validationScope.useValidator(() => {
  if (!path.value) {
    return validationError(_("Share path is required."));
  }

  const fsNode = ((path: string) => server.map((server) => new FileSystemNode(server, path)))(
    path.value
  );

  const commandOptions: CommandOptions = { superuser: "try" };

  const filesystem = mountpointInfo.value?.filesystem.type;

  const isAbsolute = fsNode.map((node) => node.isAbsolute());
  const exists = fsNode.andThen((node) => node.exists());
  const isDirectory = fsNode.andThen((node) => node.isDirectory(commandOptions));

  return ResultAsync.combine([isAbsolute, exists, isDirectory])
    .map(([isAbsolute, exists, isDirectory]) => {
      if (!isAbsolute) {
        return validationError(_("Path not absolute") + `: ${path.value}`);
      }
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
  server
    .andThen((server) => new Directory(server, path.value).create(true, { superuser: "try" }))
    .map(() => reportSuccess(`Created directory '${path.value}'.`))
    .map(forceUpdatePathInfo);

const createZfsDataset = () =>
  mountpointInfo.value?.filesystem.type !== "zfs"
    ? errAsync(new Error(`Not a ZFS filesystem: ${path.value}`))
    : server
        .andThen((server) => {
          return new Path(path.value)
            .resolveOn(server, false)
            .andThen((path) => {
              if (!path.isAbsolute()) {
                return err(new Error(`Path not absolute: ${path.path}`));
              }
              if (mountpointInfo.value === undefined) {
                return err(new Error(`mountpointInfo undefined`));
              }
              const zfsFilesystem = mountpointInfo.value.filesystem.source;
              const mountPoint = mountpointInfo.value.mountpoint;
              if (!path.path.startsWith(mountPoint)) {
                return err(new Error(`Path (${path.path}) not within mountpoint (${mountPoint})`));
              }
              return ok(path.path.replace(mountPoint, zfsFilesystem));
            })
            .andThen((dataset) =>
              server.execute(new Command(["zfs", "create", "-p", dataset], { superuser: "try" }))
            );
        })
        .map(() => reportSuccess(`Created ZFS dataset '${path.value}'.`))
        .map(forceUpdatePathInfo);

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

  <!-- <InputFeedback v-if="!path" type="error">
    {{ _("Share path is required.") }}
  </InputFeedback>
  <InputFeedback v-else-if="!isAbsolute" type="error">
    {{ _("Share path must be absolute.") }}
  </InputFeedback>
  <InputFeedback v-else-if="!exists" type="warning">
    <span class="space-x-1">
      <span>{{ _("Path does not exist.") }}</span>
      <template v-if="mountpointInfo?.filesystem.type === 'zfs'">
        <button @click="actions.createDirectory" class="underline">
          {{ _("Create directory") }}
        </button>
        <span> or </span>
        <button @click="actions.createZfsDataset" class="underline">
          {{ _("Create ZFS dataset") }}
        </button>
      </template>
      <button v-else @click="actions.createDirectory" class="underline">
        {{ _("Create now") }}
      </button>
    </span>
  </InputFeedback>
  <InputFeedback v-else-if="!isDirectory" type="error">
    {{ _("Path exists but is not a directory.") }}
  </InputFeedback>
   -->
  <Modal :show="showPermissionsEditor">
    <CardContainer>
      <template #header> {{ _("Share Directory Permissions") }} </template>
      <ModeAndPermissionsEditor
        :path="path"
        :server="server"
        :includeSystemUsers="userSettings.includeSystemAccounts"
        :includeSystemGroups="userSettings.includeSystemAccounts"
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
  <!-- Filesystem-specific checks/fixes -->
  <CephOptions
    v-if="mountpointInfo?.filesystem.type === 'ceph' && pathValidationResult.type === 'success'"
    :path="path"
  />
  <template v-else-if="mountpointInfo?.filesystem.type === 'cifs'">
    <InputFeedback type="warning">
      {{ path + _(" is already shared through Samba/CIFS") }}
    </InputFeedback>
  </template>
</template>
