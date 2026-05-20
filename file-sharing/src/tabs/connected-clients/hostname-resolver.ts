import { BashCommand, ProcessError, Server } from "@45drives/houston-common-lib";
import { ResultAsync, okAsync } from "neverthrow";

const superuserOpts = { superuser: "try" as const };

/**
 * Reverse-resolves IPs to hostnames. Tries DNS first via NSS (`getent
 * hosts`), then falls back to NetBIOS Node Status (`nmblookup -A`) for IPs
 * DNS can't answer. NetBIOS catches Windows clients that have no PTR record
 * but always respond to NBT name queries; Linux CIFS clients usually fail
 * both and are left as null (UI shows "—").
 *
 * Returns whatever the resolver says verbatim — if DNS returns a short name
 * (`quim`) that's what you'll get; if it returns an FQDN that's what you'll
 * get; NetBIOS names are always returned in their registered short form.
 */
export function resolveHostnames(
  server: Server,
  ips: string[]
): ResultAsync<Map<string, string | null>, ProcessError> {
  const unique = [...new Set(ips.filter((ip) => ip.length > 0))];
  if (unique.length === 0) return okAsync(new Map());

  return resolveViaDns(server, unique).andThen((dnsMap) => {
    const unresolved = unique.filter((ip) => !dnsMap.get(ip));
    if (unresolved.length === 0) return okAsync(dnsMap);
    return resolveViaNetBIOS(server, unresolved).map((nbMap) => {
      for (const [ip, name] of nbMap) if (name) dnsMap.set(ip, name);
      return dnsMap;
    });
  });
}

function resolveViaDns(
  server: Server,
  ips: string[]
): ResultAsync<Map<string, string | null>, ProcessError> {
  // getent hosts accepts multiple IPs in one call. `|| true` keeps the
  // command zero-exit even when one or more IPs don't resolve.
  const args = ips.map((_, i) => `"$${i + 1}"`).join(" ");
  const script = `getent hosts ${args} 2>/dev/null || true`;

  return server
    .execute(new BashCommand(script, ips, superuserOpts))
    .map((proc) => {
      const out = new Map<string, string | null>();
      for (const ip of ips) out.set(ip, null);
      for (const line of proc.getStdout().split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const ip = parts[0];
        const name = parts[1];
        if (!ip || !name) continue;
        out.set(ip, name);
      }
      return out;
    })
    .orElse(() => okAsync(new Map()));
}

/**
 * NetBIOS Node Status query — asks each host directly for its registered
 * names. The `<00>` record (without the `<GROUP>` tag) is the host's
 * computer name. Silently skipped if nmblookup isn't installed.
 */
function resolveViaNetBIOS(
  server: Server,
  ips: string[]
): ResultAsync<Map<string, string | null>, ProcessError> {
  const empty = () => {
    const m = new Map<string, string | null>();
    for (const ip of ips) m.set(ip, null);
    return m;
  };

  // Loop in the shell so a non-responding host (nmblookup exit != 0) doesn't
  // abort the batch. Frame each block so we can attribute output to its IP.
  const script = `
if ! command -v nmblookup >/dev/null 2>&1; then exit 0; fi
for ip in "$@"; do
  echo "---IP:$ip---"
  nmblookup -A "$ip" 2>/dev/null || true
done
`.trim();

  return server
    .execute(new BashCommand(script, ips, superuserOpts))
    .map((proc) => parseNmblookup(proc.getStdout(), ips))
    .orElse(() => okAsync(empty()));
}

function parseNmblookup(stdout: string, ips: string[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const ip of ips) out.set(ip, null);
  if (!stdout.trim()) return out;

  const blocks = stdout.split(/^---IP:([^-]+)---$/m);
  // [pre, ip1, block1, ip2, block2, ...]
  for (let i = 1; i < blocks.length; i += 2) {
    const ip = blocks[i]?.trim();
    const body = blocks[i + 1] ?? "";
    if (!ip) continue;
    // Look for a line like `\tQUIM            <00> -         B <ACTIVE>`.
    // Skip <GROUP> entries (workgroup names) and the "Looking up status" header.
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      const m = line.match(/^(\S+)\s+<00>\s+-\s+(?!<GROUP>)/);
      if (m && m[1]) {
        out.set(ip, m[1]);
        break;
      }
    }
  }
  return out;
}
