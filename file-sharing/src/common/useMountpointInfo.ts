import { ref, watchEffect, type Ref } from "vue";

import {
  Server,
  type CommandOptions,
  FileSystemNode,
  type FilesystemMount,
} from "@45drives/houston-common-lib";
import { ResultAsync, okAsync } from "neverthrow";

export const useMountpointInfo = (
  path: Ref<string>,
  server: Server | ResultAsync<Server, unknown>,
  commandOptions: CommandOptions = { superuser: "try" }
) => {
  if (server instanceof Server) {
    server = okAsync(server);
  }

  const fsNode = (path: string) => server.map((server) => new FileSystemNode(server, path));

  const mountpointInfo = ref<FilesystemMount>();
  const updateMountpointInfo = () => {
    fsNode(path.value)
      .andThen((node) => node.findLongestExistingStem(commandOptions))
      .andThen((node) => node.getFilesystemMount(commandOptions))
      .map((mi) => (mountpointInfo.value = mi));
  };
  watchEffect(updateMountpointInfo);

  return {
    mountpointInfo,
    updateMountpointInfo,
  };
};
