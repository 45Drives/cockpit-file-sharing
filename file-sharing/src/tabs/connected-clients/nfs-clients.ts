import {
  BashCommand,
  ProcessError,
  Server,
} from "@45drives/houston-common-lib";
import { ResultAsync } from "neverthrow";
import type { ConnectedClient } from "@/tabs/connected-clients/data-types";

const superuserOpts = { superuser: "try" as const };

/**
 * Bash payload that dumps every /proc/fs/nfsd/clients/<id>/{info,states} in a
 * single round-trip, framed by markers we parse below. We accept that this is
 * NFSv4-only: v3 clients have no kernel-side client identity.
 *
 * Requires the kernel's NFSv4 client tracking interface, available on Linux
 * 5.3+. On older kernels (or hosts not running the NFS server) the directory
 * is absent and this script exits cleanly with empty stdout — the UI then
 * shows no NFS rows, which is the correct outcome.
 *
 * NFSv4 lease semantics: the kernel only keeps a client entry while the
 * client has an active lease (~90s since the last operation by default).
 * An idle mount whose lease has lapsed will not appear here until the next
 * I/O re-confirms it — any touch of the mount (`ls`, `stat`, file open)
 * re-establishes the lease and the entry reappears. Operators should
 * expect NFS rows to rotate in and out over time; that's the kernel's
 * notion of "connected", not a bug in this view.
 */
const dumpScript = `
if [ ! -d /proc/fs/nfsd/clients ]; then exit 0; fi
for d in /proc/fs/nfsd/clients/*/; do
  # When the directory exists but is empty, bash's default glob behavior keeps
  # the literal pattern, so $d would be ".../clients/*/" and basename would
  # give "*". Skip non-directories defensively (no nullglob assumption).
  [ -d "$d" ] || continue
  id=$(basename "$d")
  echo "---CLIENT:$id---"
  # mtime of the client dentry = first-contact time. The kernel creates the
  # dentry when a client confirms and only recreates it on lease expiry +
  # reconnect, so this stays put across NFSv4 lease renewals.
  echo "---MTIME---"
  stat -c %Y "$d" 2>/dev/null
  if [ -r "$d/info" ]; then
    echo "---INFO---"
    cat "$d/info" 2>/dev/null
  fi
  if [ -r "$d/states" ]; then
    echo "---STATES---"
    cat "$d/states" 2>/dev/null
  fi
done
`.trim();

interface ParsedInfo {
  address: string;
  hostname: string | null;
  minorVersion: string | null;
  status: string | null;
}

function parseInfoBlock(block: string): ParsedInfo {
  const info: Record<string, string> = {};
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (!line || !line.includes(":")) continue;
    const idx = line.indexOf(":");
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    // Recent kernels wrap values in double quotes (e.g. `address: "10.0.0.1:919"`,
    // `name: "Linux NFSv4.2 host"`); older ones don't. Strip them defensively.
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
      v = v.slice(1, -1);
    }
    info[k] = v;
  }
  // address looks like "192.168.1.10:919" or "[fe80::1]:919"
  const rawAddr = info["address"] ?? "";
  let address = rawAddr;
  const ipv6 = rawAddr.match(/^\[([^\]]+)\]/);
  if (ipv6) {
    address = ipv6[1] ?? rawAddr;
  } else if (rawAddr.includes(":")) {
    address = rawAddr.split(":")[0] ?? rawAddr;
  }
  // name looks like "Linux NFSv4.2 hostname" — last whitespace-delimited token
  // is usually the client hostname. Treat absence gracefully.
  let hostname: string | null = null;
  const name = info["name"];
  if (name) {
    const parts = name.split(/\s+/);
    hostname = parts.length > 2 ? (parts[parts.length - 1] ?? null) : null;
  }
  return {
    address,
    hostname,
    minorVersion: info["minor version"] ?? null,
    status: info["status"] ?? null,
  };
}

function countStates(block: string): number {
  // The `states` file is one stateid per line (opens + locks + delegations).
  // A rough "active opens" count is fine here; this is just a UI hint.
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;
}

function parseDump(stdout: string): ConnectedClient[] {
  const out: ConnectedClient[] = [];
  if (!stdout.trim()) return out;

  const clientBlocks = stdout.split(/^---CLIENT:([^-]+)---$/m);
  // split() with a capturing group yields: [pre, id1, block1, id2, block2, ...]
  for (let i = 1; i < clientBlocks.length; i += 2) {
    const id = clientBlocks[i]?.trim();
    const body = clientBlocks[i + 1] ?? "";
    if (!id) continue;

    const mtimeMatch = body.match(/---MTIME---\n([^\n]*)/);
    const infoMatch = body.match(/---INFO---\n([\s\S]*?)(?=---STATES---|$)/);
    const statesMatch = body.match(/---STATES---\n([\s\S]*)$/);

    const parsed = parseInfoBlock(infoMatch?.[1] ?? "");
    const openFiles = statesMatch ? countStates(statesMatch[1] ?? "") : 0;
    const connectedSince = parseMtime(mtimeMatch?.[1] ?? "");

    // Defensive: skip blocks with no parseable address. The bash dump shouldn't
    // produce these (it filters non-directories), but a CLIENT marker with an
    // empty info block would otherwise render as a phantom row with id "nfs:*"
    // and empty IP/hostname. Easier to guarantee correctness here too.
    if (!parsed.address) continue;

    out.push({
      id: `nfs:${id}`,
      protocol: "nfs",
      user: null,
      ip: parsed.address,
      hostname: parsed.hostname,
      protocolVersion: parsed.minorVersion ? `NFSv4.${parsed.minorVersion}` : "NFSv4",
      share: null,
      connectedSince,
      openFiles,
      encrypted: false,
    });
  }
  return out;
}

function parseMtime(s: string): Date | null {
  const epoch = Number.parseInt(s.trim(), 10);
  if (!Number.isFinite(epoch) || epoch <= 0) return null;
  return new Date(epoch * 1000);
}

export function getNfsClients(server: Server): ResultAsync<ConnectedClient[], ProcessError> {
  // The dump script itself handles "directory not present" (NFSv4 server not
  // running) by exiting cleanly with empty stdout. Any other failure is real
  // and should propagate so the UI can surface it.
  return server
    .execute(new BashCommand(dumpScript, [], superuserOpts))
    .map((proc) => parseDump(proc.getStdout()));
}
