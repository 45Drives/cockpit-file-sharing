import { ParsingError, ProcessError, Server } from "@45drives/houston-common-lib";
import { ResultAsync } from "neverthrow";
import type { ConnectedClient } from "@/tabs/connected-clients/data-types";
import { getSambaClients, kickSambaClient } from "@/tabs/connected-clients/samba-clients";
import { getNfsClients } from "@/tabs/connected-clients/nfs-clients";
import { resolveHostnames } from "@/tabs/connected-clients/hostname-resolver";

export type GetClientsError = ProcessError | ParsingError;

export class ConnectedClientsManager {
  constructor(public server: Server) {}

  getClients(): ResultAsync<ConnectedClient[], GetClientsError> {
    return ResultAsync.combine([getSambaClients(this.server), getNfsClients(this.server)])
      .map(([samba, nfs]) => [...samba, ...nfs])
      .andThen((clients) =>
        resolveHostnames(this.server, clients.map((c) => c.ip)).map((map) =>
          clients.map((c) => ({
            // NFS already extracts the hostname from the client `name`
            // field — only fall back to reverse DNS when we have nothing.
            ...c,
            hostname: c.hostname ?? map.get(c.ip) ?? null,
          }))
        )
      );
  }

  kickSamba(ip: string): ResultAsync<void, ProcessError> {
    return kickSambaClient(this.server, ip);
  }
}
