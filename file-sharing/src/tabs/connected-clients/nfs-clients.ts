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
# Global context for share derivation (see deriveShares). Emitted once at the
# top of the dump so it lives outside any CLIENT block. The MOUNTINFO maps a
# superblock id (from the states file) back to a mount point; EXPORTS lists
# the server's exported paths. Per-client states entries reference files by
# (superblock, relative path) — joining these three lets us name the export(s)
# a client is actively using.
echo "---MOUNTINFO---"
cat /proc/self/mountinfo 2>/dev/null
echo "---EXPORTS---"
cat /etc/exports /etc/exports.d/*.exports 2>/dev/null
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

/**
 * Parse /proc/self/mountinfo into a map from "major:minor" (decimal, as
 * mountinfo writes it) to the mount point path. We use the kernel's own
 * device numbering as the join key for matching states-file entries below.
 */
function parseMountInfo(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of content.split("\n")) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const majorMinor = parts[2];
    const mountPath = parts[4];
    if (majorMinor && mountPath && /^\d+:\d+$/.test(majorMinor)) {
      map.set(majorMinor, mountPath);
    }
  }
  return map;
}

/**
 * Parse one-or-more /etc/exports-style files into a set of exported paths.
 * Skips comment and blank lines; first whitespace-delimited token on each
 * remaining line is the export path. Wildcard / netgroup paths aren't
 * supported by NFSv4 anyway, so a strict starts-with-"/" filter is enough.
 */
function parseExports(content: string): Set<string> {
  const set = new Set<string>();
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const path = line.split(/\s+/)[0];
    if (path && path.startsWith("/")) set.add(path);
  }
  return set;
}

interface ParsedStateEntry {
  filename: string;
  /** "major:minor" in decimal, normalized to match parseMountInfo output. */
  superblock: string;
}

/**
 * Extract (filename, superblock) tuples from a client's states file. Each
 * entry looks like:
 *   - 0x<hex>: { type: open, ..., superblock: "00:4a:1260", filename: "foo/bar" }
 * The superblock value is hex `major:minor:inode`; we drop the inode and
 * convert major:minor to decimal so it joins against mountinfo's format.
 */
function parseStates(content: string): ParsedStateEntry[] {
  const entries: ParsedStateEntry[] = [];
  for (const line of content.split("\n")) {
    const superMatch = line.match(/superblock:\s*"([0-9a-fA-F]+):([0-9a-fA-F]+):[0-9a-fA-F]+"/);
    const fileMatch = line.match(/filename:\s*"([^"]*)"/);
    if (!superMatch || !fileMatch) continue;
    const majHex = superMatch[1];
    const minHex = superMatch[2];
    const filename = fileMatch[1];
    if (!majHex || !minHex || filename === undefined) continue;
    const decimal = `${parseInt(majHex, 16)}:${parseInt(minHex, 16)}`;
    entries.push({ filename, superblock: decimal });
  }
  return entries;
}

/**
 * Derive a comma-joined list of exports a client is *actively using*, by
 * mapping each open file's superblock back to a mount path and then to a
 * matching export. The Samba `Share` column reflects "mounted shares"
 * because tcons are stateful per-share; NFSv4 has no such concept, so this
 * column only populates while files are actively open. An idle-but-mounted
 * client will show null here. The UI surfaces a tooltip to make this
 * limitation discoverable.
 */
function deriveShares(
  statesEntries: ParsedStateEntry[],
  mountInfo: Map<string, string>,
  exports: Set<string>
): string | null {
  if (statesEntries.length === 0 || exports.size === 0) return null;
  const shares = new Set<string>();
  for (const e of statesEntries) {
    const mountPath = mountInfo.get(e.superblock);
    if (mountPath && exports.has(mountPath)) shares.add(mountPath);
  }
  if (shares.size === 0) return null;
  return [...shares].sort().join(", ");
}

function parseDump(stdout: string): ConnectedClient[] {
  const out: ConnectedClient[] = [];
  if (!stdout.trim()) return out;

  const clientBlocks = stdout.split(/^---CLIENT:([^-]+)---$/m);
  // split() with a capturing group yields: [pre, id1, block1, id2, block2, ...].
  // The "pre" slot (clientBlocks[0]) holds the global context (MOUNTINFO +
  // EXPORTS) emitted before any client block.
  const globalContext = clientBlocks[0] ?? "";
  const mountInfoMatch = globalContext.match(/---MOUNTINFO---\n([\s\S]*?)(?=---EXPORTS---|$)/);
  const exportsMatch = globalContext.match(/---EXPORTS---\n([\s\S]*?)$/);
  const mountInfo = parseMountInfo(mountInfoMatch?.[1] ?? "");
  const exports = parseExports(exportsMatch?.[1] ?? "");

  for (let i = 1; i < clientBlocks.length; i += 2) {
    const id = clientBlocks[i]?.trim();
    const body = clientBlocks[i + 1] ?? "";
    if (!id) continue;

    const mtimeMatch = body.match(/---MTIME---\n([^\n]*)/);
    const infoMatch = body.match(/---INFO---\n([\s\S]*?)(?=---STATES---|$)/);
    const statesMatch = body.match(/---STATES---\n([\s\S]*)$/);

    const parsed = parseInfoBlock(infoMatch?.[1] ?? "");
    const statesContent = statesMatch?.[1] ?? "";
    const openFiles = statesMatch ? countStates(statesContent) : 0;
    const connectedSince = parseMtime(mtimeMatch?.[1] ?? "");
    const share = deriveShares(parseStates(statesContent), mountInfo, exports);

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
      share,
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
