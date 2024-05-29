<script setup lang="ts">
import { ref, defineModel, watchEffect, type Ref, computed, defineExpose } from "vue";
import {
  InputFeedback,
  InputLabelWrapper,
  wrapActions,
  InputField,
  reportSuccess,
  Modal,
  CardContainer,
  ModeAndPermissionsEditor,
} from "@45drives/houston-common-ui";
import {
  getServer,
  Directory,
  ProcessError,
  Server,
  FileSystemNode,
  type CommandOptions,
  Path,
  type FilesystemMount,
  Command,
} from "@45drives/houston-common-lib";
import { ResultAsync, ok, errAsync, err } from "neverthrow";
import CephOptions from "@/common/ui/CephOptions.vue";

const _ = cockpit.gettext;

const props = withDefaults(
  defineProps<{
    server?: ResultAsync<Server, ProcessError>;
    disabled?: boolean;
  }>(),
  { server: () => getServer() }
);

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

  const mountInfo = ref<FilesystemMount>();
  const updateMountInfo = () => {
    fsNode(path.value)
      .andThen((node) => node.findLongestExistingStem(commandOptions))
      .andThen((node) => node.getFilesystemMount(commandOptions))
      .map((mi) => (mountInfo.value = mi));
  };
  watchEffect(updateMountInfo);

  const remountedForCephQuotas = ref<boolean>(false);
  const updateRemountedForCephQuotas = () => {
    if (mountInfo.value?.filesystem.type === "ceph") {
      fsNode(path.value)
        .andThen((node) => node.resolve(true))
        .map((node) => {
          remountedForCephQuotas.value = node.path === mountInfo.value?.mountpoint;
        });
    } else {
      remountedForCephQuotas.value = false;
    }
  };
  watchEffect(updateRemountedForCephQuotas);

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
    updateMountInfo();
    updateRemountedForCephQuotas();
    updateSubdirSuggestions();
  };

  return {
    exists,
    isDirectory,
    isFile,
    isAbsolute,
    isRelative,
    mountInfo,
    forceUpdatePathInfo,
    remountedForCephQuotas,
    subdirSuggestions,
  };
};

const path = defineModel<string>("path", { required: true });

const { exists, isDirectory, isAbsolute, mountInfo, subdirSuggestions, forceUpdatePathInfo } =
  usePathInfo(path, props.server);

const isValid = computed<boolean>(() => isAbsolute.value && (isDirectory.value || !exists.value));

const showPermissionsEditor = ref(false);

const modeAndPermissionsEditorRef = ref<InstanceType<typeof ModeAndPermissionsEditor> | null>(null);

defineExpose({
  isValid,
});

const server = getServer();

const createDirectory = () =>
  server
    .andThen((server) => new Directory(server, path.value).create(true, { superuser: "try" }))
    .map(() => reportSuccess(`Created directory '${path.value}'.`))
    .map(forceUpdatePathInfo);

const createZfsDataset = () =>
  mountInfo.value?.filesystem.type !== "zfs"
    ? errAsync(new Error(`Not a ZFS filesystem: ${path.value}`))
    : server
        .andThen((server) => {
          return new Path(path.value)
            .resolveOn(server, false)
            .andThen((path) => {
              if (!path.isAbsolute()) {
                return err(new Error(`Path not absolute: ${path.path}`));
              }
              if (mountInfo.value === undefined) {
                return err(new Error(`mountInfo undefined`));
              }
              const zfsFilesystem = mountInfo.value.filesystem.source;
              const mountPoint = mountInfo.value.mountpoint;
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
    />
  </InputLabelWrapper>

  <InputFeedback v-if="!path" type="error">
    {{ _("Share path is required.") }}
  </InputFeedback>
  <InputFeedback v-else-if="!isAbsolute" type="error">
    {{ _("Share path must be absolute.") }}
  </InputFeedback>
  <InputFeedback v-else-if="!exists" type="warning">
    <span class="space-x-1">
      <span>{{ _("Path does not exist.") }}</span>
      <template v-if="mountInfo?.filesystem.type === 'zfs'">
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
  <button v-else @click="showPermissionsEditor = true" class="text-feedback text-primary">
    {{ _("Edit permissions") }}
  </button>
  <Modal :show="showPermissionsEditor">
    <CardContainer>
      <template #header> {{ _("Share Directory Permissions") }} </template>
      <ModeAndPermissionsEditor
        :path="path"
        :server="server"
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
  <CephOptions v-if="mountInfo?.filesystem.type === 'ceph'" />
  <template v-else-if="mountInfo?.filesystem.type === 'cifs'">
    <InputFeedback type="warning">
      {{ path + _(" is already shared through Samba/CIFS") }}
    </InputFeedback>
  </template>
</template>
