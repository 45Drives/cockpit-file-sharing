import { ProcessError, Server } from "@45drives/houston-common-lib";
import { ResultAsync } from "neverthrow";
import type { ConnectedClient } from "@/tabs/connected-clients/data-types";
import { getSambaClients, kickSambaClient } from "@/tabs/connected-clients/samba-clients";
import { getNfsClients } from "@/tabs/connected-clients/nfs-clients";

export class ConnectedClientsManager {
  constructor(public server: Server) {}

  getClients(): ResultAsync<ConnectedClient[], ProcessError> {
    return ResultAsync.combine([getSambaClients(this.server), getNfsClients(this.server)]).map(
      ([samba, nfs]) => [...samba, ...nfs]
    );
  }

  kickSamba(ip: string): ResultAsync<void, ProcessError> {
    return kickSambaClient(this.server, ip);
  }
}
