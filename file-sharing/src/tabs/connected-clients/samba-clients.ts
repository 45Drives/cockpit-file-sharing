import {
  BashCommand,
  ParsingError,
  ProcessError,
  Server,
} from "@45drives/houston-common-lib";
import { ResultAsync, err, ok, okAsync } from "neverthrow";
import type { ConnectedClient } from "@/tabs/connected-clients/data-types";

const superuserOpts = { superuser: "try" as const };

interface SmbStatusEncryption {
  cipher?: string;
  degree?: string;
}

interface SmbSession {
  session_id?: string;
  username?: string;
  remote_machine?: string;
  hostname?: string;
  session_dialect?: string;
  auth_time?: string;
  encryption?: SmbStatusEncryption;
}

interface SmbTcon {
  tcon_id?: string;
  session_id?: string;
  service?: string;
  machine?: string;
  connected_at?: string;
  encryption?: SmbStatusEncryption;
}

interface SmbOpenFile {
  opens?: Record<string, unknown>;
}

interface SmbStatusJson {
  sessions?: Record<string, SmbSession>;
  tcons?: Record<string, SmbTcon>;
  open_files?: Record<string, SmbOpenFile>;
}

// smbstatus -j's `hostname` field is just the connection endpoint string
// (e.g. "ipv4:1.2.3.4:54321") — not a real DNS name. Samba doesn't surface a
// resolved hostname here, so leave it null and let the UI show "—".

function isEncrypted(enc: SmbStatusEncryption | undefined): boolean {
  if (!enc) return false;
  const cipher = (enc.cipher ?? "").trim();
  const degree = (enc.degree ?? "").trim().toLowerCase();
  return cipher !== "" && cipher !== "-" && degree !== "none" && degree !== "";
}

function parseDate(s: string | undefined): Date | null {
  // Samba emits ISO 8601 with explicit TZ offset (e.g. "2025-04-15T15:32:46.123+00:00").
  // new Date() parses that unambiguously; naive strings (no offset) would be interpreted
  // as browser-local, silently producing wrong timestamps off by the browser-vs-server skew.
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildClients(status: SmbStatusJson): ConnectedClient[] {
  const sessions = status.sessions ?? {};
  const tcons = status.tcons ?? {};
  const openFiles = status.open_files ?? {};

  // Pre-compute per-(session,tcon) open-file counts.
  const openCounts = new Map<string, number>();
  for (const file of Object.values(openFiles)) {
    for (const key of Object.keys(file.opens ?? {})) {
      openCounts.set(key, (openCounts.get(key) ?? 0) + 1);
    }
  }

  const rows: ConnectedClient[] = [];
  for (const tcon of Object.values(tcons)) {
    const sessionId = tcon.session_id ?? "";
    const session = sessions[sessionId] ?? {};
    const tconId = tcon.tcon_id ?? "";
    const key = `${sessionId}/${tconId}`;

    rows.push({
      id: `samba:${key}`,
      protocol: "samba",
      user: session.username ?? null,
      ip: session.remote_machine ?? tcon.machine ?? "",
      hostname: null,
      protocolVersion: session.session_dialect ?? "SMB",
      share: tcon.service ?? null,
      connectedSince: parseDate(tcon.connected_at) ?? parseDate(session.auth_time),
      openFiles: openCounts.get(key) ?? 0,
      encrypted: isEncrypted(tcon.encryption) || isEncrypted(session.encryption),
    });
  }

  // Sessions without a tcon (rare but possible during connect) — surface them too.
  const tconnedSessions = new Set(
    Object.values(tcons).map((t) => t.session_id ?? "")
  );
  for (const [sid, session] of Object.entries(sessions)) {
    if (tconnedSessions.has(sid)) continue;
    rows.push({
      id: `samba:${sid}/-`,
      protocol: "samba",
      user: session.username ?? null,
      ip: session.remote_machine ?? "",
      hostname: null,
      protocolVersion: session.session_dialect ?? "SMB",
      share: null,
      connectedSince: parseDate(session.auth_time),
      openFiles: 0,
      encrypted: isEncrypted(session.encryption),
    });
  }

  return rows;
}

export function getSambaClients(
  server: Server
): ResultAsync<ConnectedClient[], ProcessError | ParsingError> {
  // Empty list if smbstatus is unavailable — keeps the tab functional on NFS-only boxes.
  return server
    .execute(new BashCommand("command -v smbstatus >/dev/null 2>&1"), false)
    .andThen((proc) => {
      if (!proc.succeeded()) return okAsync([] as ConnectedClient[]);
      return server
        .execute(new BashCommand("smbstatus -j 2>/dev/null", [], superuserOpts))
        .andThen((p) => {
          const out = p.getStdout().trim();
          if (!out) return ok([] as ConnectedClient[]);
          try {
            const parsed = JSON.parse(out) as SmbStatusJson;
            return ok(buildClients(parsed));
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return err(new ParsingError(`smbstatus -j returned invalid JSON: ${msg}`));
          }
        });
    });
}

export function kickSambaClient(server: Server, ip: string): ResultAsync<void, ProcessError> {
  // smbcontrol takes an IP and disconnects every session from that client.
  // Pass the IP via argv so shell metacharacters in user input can't be abused.
  const safeIp = ip.replace(/[^0-9a-fA-F:.]/g, "");
  return server
    .execute(
      new BashCommand(`smbcontrol smbd kill-client-ip "$1"`, [safeIp], superuserOpts)
    )
    .map(() => undefined);
}
