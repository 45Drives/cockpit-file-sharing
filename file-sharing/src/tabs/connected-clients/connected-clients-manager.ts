import { ParsingError, ProcessError, Server } from "@45drives/houston-common-lib";
import { ResultAsync } from "neverthrow";
import type { ConnectedClient } from "@/tabs/connected-clients/data-types";
import { getSambaClients, kickSambaClient } from "@/tabs/connected-clients/samba-clients";
import { getNfsClients } from "@/tabs/connected-clients/nfs-clients";
import { resolveHostnames } from "@/tabs/connected-clients/hostname-resolver";

export type GetClientsError = ProcessError | ParsingError;

/**
 * Collapses raw per-tcon rows (Samba) and per-client rows (NFS) into one row
 * per logical client, keyed by (protocol, user, ip). A user authenticated to
 * Samba from one IP typically has 2+ tcons (IPC$ plus each share); without
 * this aggregation they'd appear as separate rows and a single kick would
 * fan out into multiple connect/disconnect notifications.
 */
function aggregateByLogicalClient(rows: ConnectedClient[]): ConnectedClient[] {
  const groups = new Map<string, ConnectedClient[]>();
  for (const r of rows) {
    const key = `${r.protocol}:${r.user ?? ""}:${r.ip}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  const out: ConnectedClient[] = [];
  for (const [key, members] of groups) {
    const first = members[0]!;
    const shares = [...new Set(members.map((m) => m.share).filter((s): s is string => !!s))];
    const dates = members
      .map((m) => m.connectedSince)
      .filter((d): d is Date => d !== null);
    out.push({
      ...first,
      id: key,
      share: shares.length > 0 ? shares.join(", ") : null,
      connectedSince:
        dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
      openFiles: members.reduce((s, m) => s + m.openFiles, 0),
      // Conservative: only "Yes" if every tcon negotiated encryption. A
      // partial encryption state should NOT show "Yes" to the operator.
      encrypted: members.every((m) => m.encrypted),
    });
  }
  return out;
}

export class ConnectedClientsManager {
  constructor(public server: Server) {}

  getClients(): ResultAsync<ConnectedClient[], GetClientsError> {
    return ResultAsync.combine([getSambaClients(this.server), getNfsClients(this.server)])
      .map(([samba, nfs]) => aggregateByLogicalClient([...samba, ...nfs]))
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
