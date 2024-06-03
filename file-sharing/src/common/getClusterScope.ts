import {
  getServer,
  File,
  RegexSnippets,
  type Server,
  ParsingError,
  ProcessError,
  ValueError,
} from "@45drives/houston-common-lib";
import { ResultAsync, okAsync, ok } from "neverthrow";

export function getClusterScope(
  scope: "local" | "ctdb" | "pcs",
  localServer?: Server
): ResultAsync<[Server, ...Server[]], ProcessError | ParsingError> {
  const localServerResult = localServer ? okAsync(localServer) : getServer();

  switch (scope) {
    case "local":
      return localServerResult.map((s) => [s]);
    case "ctdb":
      return localServerResult.andThen((server) => {
        const ctdbNodesFile = new File(server, "/etc/ctdb/nodes");
        return ctdbNodesFile.exists().andThen((ctdbNodesFileExists) => {
          if (ctdbNodesFileExists) {
            return ctdbNodesFile.read({ superuser: "try" }).andThen((nodesString) =>
              ResultAsync.combine(
                nodesString
                  .split(RegexSnippets.newlineSplitter)
                  .map((n) => n.trim())
                  .filter((n) => n)
                  .map((node) => getServer(node))
              ).map((servers) => {
                if (servers.length < 1) {
                  console.warn(
                    "getServerScope('ctdb'): Found /etc/ctdb/nodes file, but contained no hosts. Assuming single-server."
                  );
                  return [server] as [Server, ...Server[]];
                }
                return servers as [Server, ...Server[]];
              })
            );
          } else {
            console.warn(
              "getServerScope('ctdb'): File not found: /etc/ctdb/nodes. Assuming single-server."
            );
            return ok([server] as [Server, ...Server[]]);
          }
        });
      });
    case "pcs":
      return localServerResult.map((s) => [s]); // TODO
  }
}
