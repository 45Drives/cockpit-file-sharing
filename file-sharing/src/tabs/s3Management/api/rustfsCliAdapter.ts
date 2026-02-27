import type {
  BucketVersioningStatus,
  S3AliasCandidate,
  S3ServiceAccount,
  RustfsServiceAccountInfo,
  RustfsServiceAccountCreatePayload,
  RustfsServiceAccountUpdatePayload,
  S3AccessUserGroupMembership,
  S3AccessGroupInfo,
  S3AccessUser,
  S3AccessUserCreatePayload,
  S3AccessUserDetails,
  S3AccessUserUpdatePayload,
  RustfsBucket,
  RustfsBucketDashboardStats,
} from "../types/types";
import pLimit from "p-limit";
import { server, Command, unwrap } from "@45drives/houston-common-lib";

const bucketLimit = pLimit(6);

let RUSTFS_ALIAS = process.env.RUSTFS_RC_ALIAS || "local";
let RUSTFS_INSTANCE_SELECTOR = "";

export function setRustfsAlias(alias: string): void {
  const trimmed = String(alias ?? "").trim();
  if (!trimmed) return;
  RUSTFS_INSTANCE_SELECTOR = trimmed;
  rustfsConnectionCache = undefined;
}

export function getRustfsAlias(): string {
  return RUSTFS_INSTANCE_SELECTOR || RUSTFS_ALIAS;
}

export async function setRustfsManualConnection(input: RustfsManualConnectionInput): Promise<void> {
  const host = String(input.host ?? "").trim();
  const portRaw = String(input.port ?? "").trim();
  const endpointRaw = String(input.endpointUrl ?? "").trim();
  const apiBaseRaw = String(input.apiBase ?? "").trim();
  const accessKey = String(input.accessKey ?? "").trim();
  const secretKey = String(input.secretKey ?? "").trim();
  const region = String(input.region ?? "us-east-1").trim() || "us-east-1";

  if (!accessKey || !secretKey) {
    throw new Error("setRustfsManualConnection: accessKey and secretKey are required");
  }

  let endpointUrl = normalizeApiBase(endpointRaw);
  if (!endpointUrl && host && portRaw) {
    endpointUrl = normalizeApiBase(`http://${host}:${portRaw}`);
  }

  let apiBase = normalizeApiBase(apiBaseRaw);
  if (!apiBase && endpointUrl) {
    apiBase = normalizeApiBase(`${endpointUrl}/rustfs/admin/v3`);
  }
  if (!endpointUrl && apiBase) {
    endpointUrl = deriveRustfsS3EndpointFromAdminApiBase(apiBase) ?? "";
  }

  if (!endpointUrl || !apiBase) {
    throw new Error("setRustfsManualConnection: endpoint or host/port is required");
  }

  rustfsManualOverride = { apiBase, endpointUrl, accessKey, secretKey, region };
  const idx = rustfsManualConnections.findIndex(
    (c) => String(c.accessKey).trim() === accessKey
  );
  if (idx >= 0) {
    rustfsManualConnections.splice(idx, 1, rustfsManualOverride);
  } else {
    rustfsManualConnections.push(rustfsManualOverride);
  }
  rustfsConnectionCache = undefined;
  rustfsDiscoveryCache = undefined;
  rustfsManualLoaded = true;
  await persistRustfsManualConnectionToUserConfig();
}

type RustfsS3Creds = {
  accessKeyId: string;
  secretAccessKey: string;
};
type RustfsResolvedConnection = {
  apiBase: string;
  endpointUrl: string;
  region: string;
  accessKey: string;
  secretKey: string;
  source: "manual" | "env" | "systemd" | "container";
};
type RustfsManualConnectionInput = {
  host?: string;
  port?: string | number;
  endpointUrl?: string;
  apiBase?: string;
  accessKey: string;
  secretKey: string;
  region?: string;
};
export type RustfsManualSavedConnection = {
  accessKey: string;
  secretKey?: string;
  endpointUrl: string;
  apiBase: string;
  region: string;
  alias: string;
  source: "manual";
};

const BYTE_UNIT_FACTORS: Record<string, number> = {
  B: 1,
  K: 1024,
  KB: 1024,
  KIB: 1024,
  M: 1024 ** 2,
  MB: 1024 ** 2,
  MIB: 1024 ** 2,
  G: 1024 ** 3,
  GB: 1024 ** 3,
  GIB: 1024 ** 3,
  T: 1024 ** 4,
  TB: 1024 ** 4,
  TIB: 1024 ** 4,
  P: 1024 ** 5,
  PB: 1024 ** 5,
  PIB: 1024 ** 5,
};


function shellQuote(v: string): string {
  return `'${String(v ?? "").replace(/'/g, `'\\''`)}'`;
}

function normalizeApiBase(v: string): string {
  return String(v ?? "").replace(/\/+$/, "");
}

function deriveRustfsS3EndpointFromAdminApiBase(adminApiBase: string): string | undefined {
  const raw = String(adminApiBase ?? "").trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const authority = u.host;
    if (!authority) return undefined;
    return normalizeApiBase(`${u.protocol}//${authority}`);
  } catch {
    return undefined;
  }
}

let rustfsConnectionCache:
  | { value: RustfsResolvedConnection; expiresAtMs: number }
  | undefined;
let rustfsDiscoveryCache:
  | { values: RustfsResolvedConnection[]; expiresAtMs: number }
  | undefined;
let rustfsManualConnections: Array<{
  apiBase: string;
  endpointUrl: string;
  accessKey: string;
  secretKey: string;
  region: string;
}> = [];
let rustfsManualOverride:
  | { apiBase: string; endpointUrl: string; accessKey: string; secretKey: string; region: string }
  | undefined;
let rustfsSessionUidCache: number | undefined;
let rustfsManualLoaded = false;
const RUSTFS_MANUAL_CONFIG_PATH = "~/.config/cockpit-file-sharing/rustfs-manual.json";

async function runUserShell(script: string, allowFailure = false): Promise<string> {
  const cmd = new Command(["bash", "-lc", script], {});
  const proc = await unwrap(server.execute(cmd, false));
  const stdout = String(proc.getStdout() ?? "");
  const stderr = String(proc.getStderr() ?? "");
  const exitStatus = proc.exitStatus;
  if (exitStatus !== 0 && !allowFailure) {
    throw new Error(stderr.trim() || stdout.trim() || `shell exited with status ${exitStatus}`);
  }
  return stdout;
}

async function loadRustfsManualConnectionFromUserConfig(): Promise<void> {
  if (rustfsManualLoaded) return;
  rustfsManualLoaded = true;
  try {
    const text = await runUserShell(`cat ${RUSTFS_MANUAL_CONFIG_PATH} 2>/dev/null || true`, true);
    const raw = String(text ?? "").trim();
    if (!raw) return;
    const parsed = JSON.parse(raw) as
      | Partial<{
          apiBase: string;
          endpointUrl: string;
          accessKey: string;
          secretKey: string;
          region: string;
        }>
      | Array<
          Partial<{
            apiBase: string;
            endpointUrl: string;
            accessKey: string;
            secretKey: string;
            region: string;
          }>
        >;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const normalized: Array<{
      apiBase: string;
      endpointUrl: string;
      accessKey: string;
      secretKey: string;
      region: string;
    }> = [];
    for (const row of rows) {
      const apiBase = normalizeApiBase(String(row?.apiBase ?? "").trim());
      const endpointUrl = normalizeApiBase(String(row?.endpointUrl ?? "").trim());
      const accessKey = String(row?.accessKey ?? "").trim();
      const secretKey = String(row?.secretKey ?? "").trim();
      const region = String(row?.region ?? "us-east-1").trim() || "us-east-1";
      if (!apiBase || !endpointUrl || !accessKey || !secretKey) continue;
      normalized.push({ apiBase, endpointUrl, accessKey, secretKey, region });
    }
    if (!normalized.length) return;
    rustfsManualConnections = normalized;
    rustfsManualOverride = normalized[normalized.length - 1];
  } catch {
    // ignore malformed or unavailable config
  }
}

async function persistRustfsManualConnectionToUserConfig(): Promise<void> {
  const payload = JSON.stringify(rustfsManualConnections);
  await runUserShell(
    `umask 077; mkdir -p ~/.config/cockpit-file-sharing; printf %s ${shellQuote(payload)} > ${RUSTFS_MANUAL_CONFIG_PATH}`,
    true
  );
}

export async function listRustfsManualConnections(): Promise<RustfsManualSavedConnection[]> {
  await loadRustfsManualConnectionFromUserConfig();
  return rustfsManualConnections
    .map((c) => ({
      accessKey: c.accessKey,
      secretKey: c.secretKey,
      endpointUrl: c.endpointUrl,
      apiBase: c.apiBase,
      region: c.region,
      alias: `${c.accessKey}:${c.endpointUrl}`,
      source: "manual" as const,
    }))
    .sort((a, b) => a.accessKey.localeCompare(b.accessKey) || a.endpointUrl.localeCompare(b.endpointUrl));
}

export async function deleteRustfsManualConnection(accessKey: string): Promise<void> {
  await loadRustfsManualConnectionFromUserConfig();
  const key = String(accessKey ?? "").trim();
  if (!key) return;
  const before = rustfsManualConnections.length;
  rustfsManualConnections = rustfsManualConnections.filter(
    (c) => String(c.accessKey ?? "").trim() !== key
  );
  if (rustfsManualConnections.length === before) return;

  if (rustfsManualOverride && String(rustfsManualOverride.accessKey ?? "").trim() === key) {
    rustfsManualOverride = rustfsManualConnections[rustfsManualConnections.length - 1];
  }
  rustfsConnectionCache = undefined;
  rustfsDiscoveryCache = undefined;
  await persistRustfsManualConnectionToUserConfig();
}

async function isRootSessionUser(): Promise<boolean> {
  if (typeof rustfsSessionUidCache === "number") {
    return rustfsSessionUidCache === 0;
  }
  try {
    const cmd = new Command(["bash", "-lc", "id -u"], {});
    const proc = await unwrap(server.execute(cmd, false));
    const uid = Number(String(proc.getStdout() ?? "").trim());
    rustfsSessionUidCache = Number.isInteger(uid) ? uid : 1;
  } catch {
    rustfsSessionUidCache = 1;
  }
  return rustfsSessionUidCache === 0;
}

function parsePortFromAddress(value: string | undefined): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const m = raw.match(/:(\d{2,5})$/) || raw.match(/^(\d{2,5})$/);
  if (!m) return undefined;
  const port = Number(m[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return port;
}

function parseEnvFileContent(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function buildConnectionFromEnv(overrides?: Partial<RustfsResolvedConnection>): RustfsResolvedConnection | undefined {
  const apiBaseRaw =
    String(process.env.RUSTFS_ADMIN_API_BASE || process.env.RUSTFS_API_BASE || "").trim();
  const endpointRaw = String(process.env.RUSTFS_S3_ENDPOINT || "").trim();
  const apiBaseSeed = overrides?.apiBase || apiBaseRaw || "";
  const apiBase = normalizeApiBase(apiBaseSeed);
  const endpointSeed =
    overrides?.endpointUrl || endpointRaw || deriveRustfsS3EndpointFromAdminApiBase(apiBase) || "";
  const endpointUrl = normalizeApiBase(endpointSeed);
  if (!apiBase && !endpointUrl) return undefined;

  const region = String(process.env.RUSTFS_ADMIN_REGION || process.env.AWS_REGION || "us-east-1");
  const accessKey = String(
    overrides?.accessKey ||
      process.env.RUSTFS_ADMIN_ACCESS_KEY ||
      process.env.RUSTFS_ACCESS_KEY
  );
  const secretKey = String(
    overrides?.secretKey ||
      process.env.RUSTFS_ADMIN_SECRET_KEY ||
      process.env.RUSTFS_SECRET_KEY
  );

  const resolvedApiBase = apiBase || normalizeApiBase(`${endpointUrl}/rustfs/admin/v3`);
  const resolvedEndpoint = endpointUrl || deriveRustfsS3EndpointFromAdminApiBase(resolvedApiBase);
  if (!resolvedApiBase || !resolvedEndpoint) return undefined;

  return {
    apiBase: resolvedApiBase,
    endpointUrl: resolvedEndpoint,
    region,
    accessKey,
    secretKey,
    source: overrides?.source || "env",
  };
}

async function detectSystemdRustfsConnection(): Promise<RustfsResolvedConnection | undefined> {
  const serviceText = await runUserShell("systemctl cat rustfs 2>/dev/null || true", true);
  if (!serviceText.trim()) {
    return undefined;
  }

  const envFileMatch = serviceText.match(/^\s*EnvironmentFile=([^\n]+)$/m);
  const envFileRaw = String(envFileMatch?.[1] ?? "").trim();
  if (!envFileRaw) {
    return undefined;
  }
  const envFilePath = envFileRaw.replace(/^-/, "").trim();
  if (!envFilePath) {
    return undefined;
  }

  const envFileText = await runUserShell(`cat ${shellQuote(envFilePath)} 2>/dev/null || true`, true);
  if (!envFileText.trim()) {
    return undefined;
  }

  const env = parseEnvFileContent(envFileText);
  const canUseDiscoveredCreds = await isRootSessionUser();
  const host = String(process.env.RUSTFS_ADMIN_HOST || process.env.RUSTFS_HOST || "localhost").trim() || "localhost";
  const s3Port = parsePortFromAddress(env.RUSTFS_ADDRESS) ?? 9000;
  const endpointUrl = normalizeApiBase(`http://${host}:${s3Port}`);

  const resolved = buildConnectionFromEnv({
    endpointUrl,
    accessKey: canUseDiscoveredCreds ? env.RUSTFS_ACCESS_KEY : undefined,
    secretKey: canUseDiscoveredCreds ? env.RUSTFS_SECRET_KEY : undefined,
    source: "systemd",
  });
  if (resolved) {
    const masked =
      resolved.accessKey.length > 4
        ? `${resolved.accessKey.slice(0, 2)}***${resolved.accessKey.slice(-2)}`
        : "***";
  }
  return resolved;
}

async function detectContainerRustfsConnection(): Promise<RustfsResolvedConnection | undefined> {
  const detectRuntime = async (): Promise<"podman" | "docker" | undefined> => {
    for (const runtime of ["podman", "docker"] as const) {
      const exists = (await runUserShell(`command -v ${runtime} >/dev/null 2>&1; echo $?`, true)).trim();
      if (exists === "0") return runtime;
    }
    return undefined;
  };

  const runtime = await detectRuntime();
  if (!runtime) {
    return undefined;
  }

  const ps = await runUserShell(
    `${runtime} ps --format '{{.Names}}\\t{{.Image}}' 2>/dev/null || true`,
    true
  );
  const line = ps
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /rustfs/i.test(l));
  if (!line) {
    return undefined;
  }
  const containerName = line.split(/\s+/)[0];
  if (!containerName) {
    return undefined;
  }

  const inspectRaw = await runUserShell(`${runtime} inspect ${shellQuote(containerName)} 2>/dev/null || true`, true);
  if (!inspectRaw.trim()) {
    return undefined;
  }
  let inspect: any;
  try {
    inspect = JSON.parse(inspectRaw);
  } catch {
    return undefined;
  }
  const first = Array.isArray(inspect) ? inspect[0] : inspect;
  if (!first || typeof first !== "object") {
    return undefined;
  }

  const envList: string[] = Array.isArray(first?.Config?.Env) ? first.Config.Env : [];
  const envMap: Record<string, string> = {};
  for (const row of envList) {
    const idx = String(row).indexOf("=");
    if (idx <= 0) continue;
    envMap[String(row).slice(0, idx)] = String(row).slice(idx + 1);
  }

  let hostPort: string | undefined =
    first?.NetworkSettings?.Ports?.["9000/tcp"]?.[0]?.HostPort;
  if (!hostPort) {
    const portText = await runUserShell(`${runtime} port ${shellQuote(containerName)} 2>/dev/null || true`, true);
    const pm = portText.match(/9000\/tcp\s*->\s*[^:]+:(\d{2,5})/i);
    if (pm?.[1]) hostPort = pm[1];
  }
  const canUseDiscoveredCreds = await isRootSessionUser();
  const port = parsePortFromAddress(hostPort) ?? 9000;
  const host = String(process.env.RUSTFS_ADMIN_HOST || process.env.RUSTFS_HOST || "localhost").trim() || "localhost";
  const endpointUrl = normalizeApiBase(`http://${host}:${port}`);

  const resolved = buildConnectionFromEnv({
    endpointUrl,
    accessKey: canUseDiscoveredCreds ? envMap.RUSTFS_ACCESS_KEY : undefined,
    secretKey: canUseDiscoveredCreds ? envMap.RUSTFS_SECRET_KEY : undefined,
    source: "container",
  });
  if (resolved) {
    const masked =
      resolved.accessKey.length > 4
        ? `${resolved.accessKey.slice(0, 2)}***${resolved.accessKey.slice(-2)}`
        : "***";
  }
  return resolved;
}

async function resolveRustfsConnection(): Promise<RustfsResolvedConnection> {
  await loadRustfsManualConnectionFromUserConfig();
  const parseSelector = () => {
    const selected = String(RUSTFS_INSTANCE_SELECTOR ?? "").trim();
    const m = selected.match(/^([^:]+):(https?:\/\/.+)$/i);
    if (!m) return undefined;
    return {
      keyPrefix: String(m[1] ?? "").trim(),
      endpoint: normalizeApiBase(String(m[2] ?? "").trim()),
    };
  };
  const selectCandidate = (candidates: RustfsResolvedConnection[]): RustfsResolvedConnection | undefined => {
    const selected = String(RUSTFS_INSTANCE_SELECTOR ?? "").trim();
    if (!selected) return candidates[0];
    const selectorParts = parseSelector();

    const bySelected = candidates.find(
      (c) =>
        c.source === selected ||
        c.endpointUrl === selected ||
        `${c.source}:${c.endpointUrl}` === selected ||
        (selectorParts
          ? c.endpointUrl === selectorParts.endpoint &&
            String(c.accessKey ?? "").trim() === selectorParts.keyPrefix
          : false)
    );
    if (bySelected) return bySelected;
    if (selectorParts?.keyPrefix) {
      const byKey = candidates.find((c) => String(c.accessKey ?? "").trim() === selectorParts.keyPrefix);
      if (byKey) return byKey;
    }
    return bySelected ?? candidates[0];
  };

  const discoverCandidates = async (): Promise<RustfsResolvedConnection[]> => {
    const now = Date.now();
    if (rustfsDiscoveryCache && rustfsDiscoveryCache.expiresAtMs > now) {
      return rustfsDiscoveryCache.values;
    }

    const out: RustfsResolvedConnection[] = [];
    const push = (conn: RustfsResolvedConnection | undefined) => {
      if (!conn) return;
      if (
        out.some(
          (x) =>
            x.endpointUrl === conn.endpointUrl &&
            x.source === conn.source &&
            String(x.accessKey ?? "").trim() === String(conn.accessKey ?? "").trim()
        )
      ) {
        return;
      }
      out.push(conn);
    };

    for (const entry of rustfsManualConnections) {
      push(
        buildConnectionFromEnv({
          apiBase: entry.apiBase,
          endpointUrl: entry.endpointUrl,
          accessKey: entry.accessKey,
          secretKey: entry.secretKey,
          source: "manual",
        })
      );
    }
    push(buildConnectionFromEnv({ source: "env" }));
    push(await detectSystemdRustfsConnection());
    push(await detectContainerRustfsConnection());

    rustfsDiscoveryCache = { values: out, expiresAtMs: now + 60_000 };
    return out;
  };

  const now = Date.now();
  if (rustfsConnectionCache && rustfsConnectionCache.expiresAtMs > now) {
    const selectorParts = parseSelector();
    if (
      selectorParts &&
      !(
        normalizeApiBase(rustfsConnectionCache.value.endpointUrl) === selectorParts.endpoint &&
        String(rustfsConnectionCache.value.accessKey ?? "").trim() === selectorParts.keyPrefix
      )
    ) {
      rustfsConnectionCache = undefined;
    }
  }
  if (rustfsConnectionCache && rustfsConnectionCache.expiresAtMs > now) {
    return rustfsConnectionCache.value;
  }

  const candidates = await discoverCandidates();
  const selected = selectCandidate(candidates);
  if (!selected) {
    throw new Error("Unable to resolve RustFS connection parameters.");
  }
  rustfsConnectionCache = { value: selected, expiresAtMs: now + 60_000 };
  return selected;
}

async function resolveRustfsAdminApiConfig(): Promise<{
  apiBase: string;
  region: string;
  accessKey: string;
  secretKey: string;
}> {
  const resolved = await resolveRustfsConnection();
  return {
    apiBase: resolved.apiBase,
    region: resolved.region,
    accessKey: resolved.accessKey,
    secretKey: resolved.secretKey,
  };
}

async function resolveRustfsS3ApiConfig(): Promise<{
  endpointUrl: string;
  creds: RustfsS3Creds;
}> {
  const resolved = await resolveRustfsConnection();
  const accessKeyId = String(
    process.env.RUSTFS_ACCESS_KEY_ID ||
      process.env.RUSTFS_ACCESS_KEY ||
      resolved.accessKey ||
      "rustfsadmin"
  );
  const secretAccessKey = String(
    process.env.RUSTFS_SECRET_ACCESS_KEY ||
      process.env.RUSTFS_SECRET_KEY ||
      resolved.secretKey ||
      "rustfsadmin"
  );
  return { endpointUrl: resolved.endpointUrl, creds: { accessKeyId, secretAccessKey } };
}

async function execRustfsPython(
  pythonSource: string,
  env: Record<string, string>,
): Promise<string> {
  const exports = Object.entries(env)
    .map(([k, v]) => `export ${k}=${shellQuote(v)}`)
    .join("; ");

  const cmdLine = `${exports}; python3 - <<'PY'\n${pythonSource}\nPY`;
  const cmd = new Command(["bash", "-lc", cmdLine], {});
  const proc = await unwrap(server.execute(cmd, false));
  const stdout = proc.getStdout().toString().trim();
  const stderr = proc.getStderr().toString().trim();
  const exitStatus = proc.exitStatus;

  if (exitStatus !== 0) {
    throw new Error(stderr || stdout || `python exited with status ${exitStatus}`);
  }
  return stdout;
}

const RUSTFS_PY_SETUP = `
import os
import botocore.session
from botocore.config import Config

endpoint = os.environ["RUSTFS_ENDPOINT"]
bucket = os.environ["RUSTFS_BUCKET"]

sess = botocore.session.get_session()
client = sess.create_client(
  "s3",
  endpoint_url=endpoint,
  aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
  aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
  config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
)
`;

const RUSTFS_PY_SETUP_NO_BUCKET = `
import os
import botocore.session
from botocore.config import Config

endpoint = os.environ["RUSTFS_ENDPOINT"]

sess = botocore.session.get_session()
client = sess.create_client(
  "s3",
  endpoint_url=endpoint,
  aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
  aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
  config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
)
`;

async function putRustfsBucketObjectLockConfiguration(
  bucketName: string,
  mode: "GOVERNANCE" | "COMPLIANCE",
  days: number,
): Promise<void> {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("object lock retention days must be > 0");
  }

  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const py =
    RUSTFS_PY_SETUP +
    `
mode = os.environ["RUSTFS_OBJECT_LOCK_MODE"]
days = int(os.environ["RUSTFS_OBJECT_LOCK_DAYS"])

client.put_object_lock_configuration(
  Bucket=bucket,
  ObjectLockConfiguration={
    "ObjectLockEnabled": "Enabled",
    "Rule": {"DefaultRetention": {"Mode": mode, "Days": days}},
  },
)
print("ok")
`;

  try {
    await execRustfsPython(py, {
      RUSTFS_ENDPOINT: endpointUrl,
      RUSTFS_BUCKET: bucketName,
      RUSTFS_OBJECT_LOCK_MODE: mode,
      RUSTFS_OBJECT_LOCK_DAYS: String(Math.floor(days)),
      AWS_ACCESS_KEY_ID: creds.accessKeyId,
      AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("InvalidBucketState") && msg.includes("Object Lock configuration cannot be enabled on existing buckets")) {
      throw new Error(
        `Bucket "${bucketName}" was created without object lock. ` +
        `RustFS/S3 cannot enable object lock or default retention on an existing non-lock bucket. ` +
        `Create a new bucket with object lock enabled from the start.`
      );
    }
    throw e;
  }
}

async function isRustfsBucketObjectLockEnabledViaApi(bucketName: string): Promise<boolean> {
  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const py =
    RUSTFS_PY_SETUP +
    `
try:
  resp = client.get_object_lock_configuration(Bucket=bucket)
  cfg = resp.get("ObjectLockConfiguration") or {}
  enabled = str(cfg.get("ObjectLockEnabled", "")).lower() == "enabled"
  print("true" if enabled else "false")
except Exception as e:
  msg = str(e)
  if "ObjectLockConfigurationNotFoundError" in msg or "404" in msg or "InvalidRequest" in msg:
    print("false")
  else:
    raise
`;

  const out = await execRustfsPython(py, {
    RUSTFS_ENDPOINT: endpointUrl,
    RUSTFS_BUCKET: bucketName,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
  return String(out).trim().toLowerCase() === "true";
}

export async function getRustfsBucketObjectLockEnabled(
  bucketName: string,
): Promise<boolean | undefined> {
  try {
    return await isRustfsBucketObjectLockEnabledViaApi(bucketName);
  } catch {
    return undefined;
  }
}

export async function getRustfsBucketObjectLockConfiguration(
  bucketName: string,
): Promise<{
  objectLockEnabled?: boolean;
  objectLockMode?: "GOVERNANCE" | "COMPLIANCE";
  objectLockRetentionDays?: number;
}> {
  try {
    const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
    const py =
      RUSTFS_PY_SETUP +
      `
import json

try:
  resp = client.get_object_lock_configuration(Bucket=bucket)
  cfg = resp.get("ObjectLockConfiguration") or {}
  enabled = str(cfg.get("ObjectLockEnabled", "")).lower() == "enabled"
  rule = cfg.get("Rule") or {}
  default_ret = rule.get("DefaultRetention") or {}
  mode = default_ret.get("Mode")
  days = default_ret.get("Days")
  years = default_ret.get("Years")
  print(json.dumps({
    "enabled": enabled,
    "mode": mode,
    "days": days,
    "years": years,
  }))
except Exception as e:
  msg = str(e)
  if "ObjectLockConfigurationNotFoundError" in msg or "404" in msg or "InvalidRequest" in msg:
    print(json.dumps({"enabled": False}))
  else:
    raise
`;

    const out = await execRustfsPython(py, {
      RUSTFS_ENDPOINT: endpointUrl,
      RUSTFS_BUCKET: bucketName,
      AWS_ACCESS_KEY_ID: creds.accessKeyId,
      AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    });

    const parsed = JSON.parse(out || "{}") as {
      enabled?: boolean;
      mode?: string;
      days?: number | null;
      years?: number | null;
    };

    const modeRaw = String(parsed.mode ?? "").toUpperCase();
    const objectLockMode =
      modeRaw === "GOVERNANCE" || modeRaw === "COMPLIANCE"
        ? (modeRaw as "GOVERNANCE" | "COMPLIANCE")
        : undefined;

    const days =
      typeof parsed.days === "number" && Number.isFinite(parsed.days) && parsed.days > 0
        ? Math.floor(parsed.days)
        : typeof parsed.years === "number" && Number.isFinite(parsed.years) && parsed.years > 0
          ? Math.floor(parsed.years * 365)
          : undefined;

    return {
      objectLockEnabled: !!parsed.enabled,
      objectLockMode,
      objectLockRetentionDays: days,
    };
  } catch {
    return {};
  }
}


async function listRustfsBucketsViaS3Api(): Promise<Array<{ name: string; createdAt?: string }>> {
  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const py =
    RUSTFS_PY_SETUP_NO_BUCKET +
    `
import json

resp = client.list_buckets()
rows = []
for b in resp.get("Buckets", []):
  name = str(b.get("Name", "")).strip()
  if not name:
    continue
  c = b.get("CreationDate")
  created = c.isoformat() if c is not None else None
  rows.append({"name": name, "createdAt": created})
print(json.dumps(rows))
`;
  const out = await execRustfsPython(py, {
    RUSTFS_ENDPOINT: endpointUrl,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
  const rows = JSON.parse(out || "[]") as Array<{ name?: string; createdAt?: string }>;
  return rows
    .map((r) => ({
      name: String(r?.name ?? "").trim(),
      createdAt: String(r?.createdAt ?? "").trim() || undefined,
    }))
    .filter((r) => r.name);
}

async function getRustfsBucketVersioningViaS3Api(
  bucketName: string
): Promise<BucketVersioningStatus | undefined> {
  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const py =
    RUSTFS_PY_SETUP +
    `
resp = client.get_bucket_versioning(Bucket=bucket)
status = str(resp.get("Status", "")).strip().lower()
if status == "enabled":
  print("Enabled")
elif status in ("suspended", "disabled"):
  print("Suspended")
else:
  print("")
`;
  const out = await execRustfsPython(py, {
    RUSTFS_ENDPOINT: endpointUrl,
    RUSTFS_BUCKET: bucketName,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
  const value = String(out ?? "").trim();
  if (value === "Enabled") return "Enabled";
  if (value === "Suspended") return "Suspended";
  return undefined;
}

async function setRustfsBucketVersioningViaS3Api(bucketName: string, enabled: boolean): Promise<void> {
  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const py =
    RUSTFS_PY_SETUP +
    `
status = "Enabled" if os.environ["RUSTFS_VERSIONING_ENABLED"] == "true" else "Suspended"
client.put_bucket_versioning(
  Bucket=bucket,
  VersioningConfiguration={"Status": status},
)
print("ok")
`;
  await execRustfsPython(py, {
    RUSTFS_ENDPOINT: endpointUrl,
    RUSTFS_BUCKET: bucketName,
    RUSTFS_VERSIONING_ENABLED: enabled ? "true" : "false",
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

async function createRustfsBucketViaS3Api(
  bucketName: string,
  objectLockEnabled: boolean
): Promise<void> {
  const target = String(bucketName ?? "").trim();
  if (!target) {
    throw new Error("createRustfsBucketViaS3Api: bucketName is required");
  }

  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const region = String(process.env.RUSTFS_ADMIN_REGION || process.env.AWS_REGION || "us-east-1");
  const bucketUrl = `${endpointUrl}/${encodeURIComponent(target)}/`;

  const cmdParts = [
    `AWS_ACCESS_KEY_ID=${shellQuote(creds.accessKeyId)}`,
    `AWS_SECRET_ACCESS_KEY=${shellQuote(creds.secretAccessKey)}`,
    "python3 -m awscurl --service s3",
    `--region ${shellQuote(region)}`,
    "-X 'PUT'",
  ];
  if (objectLockEnabled) {
    cmdParts.push(`-H ${shellQuote("x-amz-bucket-object-lock-enabled: true")}`);
  }
  cmdParts.push(shellQuote(bucketUrl));

  const commandString = cmdParts.join(" ");
  const redacted = commandString.replace(
    /AWS_SECRET_ACCESS_KEY='[^']*'/,
    "AWS_SECRET_ACCESS_KEY='***'"
  );

  const cmd = new Command(["bash", "-lc", commandString], {});
  const proc = await unwrap(server.execute(cmd, false));
  const stdout = proc.getStdout();
  const stderr = proc.getStderr();
  const exitStatus = proc.exitStatus;
  if (exitStatus !== 0) {
    const msg = stderr.trim() || stdout.trim() || `awscurl exited with status ${exitStatus}`;
    throw new Error(msg);
  }

  const trimmed = stdout.trim();
  const apiError = extractRustfsApiErrorMessage(trimmed);
  if (apiError) {
    throw new Error(apiError);
  }
}

async function deleteRustfsBucketViaS3Api(bucketName: string): Promise<void> {
  const target = String(bucketName ?? "").trim();
  if (!target) {
    throw new Error("deleteRustfsBucketViaS3Api: bucketName is required");
  }

  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const region = String(process.env.RUSTFS_ADMIN_REGION || process.env.AWS_REGION || "us-east-1");
  const bucketUrl = `${endpointUrl}/${encodeURIComponent(target)}/`;

  const cmdParts = [
    `AWS_ACCESS_KEY_ID=${shellQuote(creds.accessKeyId)}`,
    `AWS_SECRET_ACCESS_KEY=${shellQuote(creds.secretAccessKey)}`,
    "python3 -m awscurl --service s3",
    `--region ${shellQuote(region)}`,
    "-X 'DELETE'",
    shellQuote(bucketUrl),
  ];

  const commandString = cmdParts.join(" ");

  const cmd = new Command(["bash", "-lc", commandString], {});
  const proc = await unwrap(server.execute(cmd, false));
  const stdout = proc.getStdout();
  const stderr = proc.getStderr();
  const exitStatus = proc.exitStatus;
  if (exitStatus !== 0) {
    const msg = stderr.trim() || stdout.trim() || `awscurl exited with status ${exitStatus}`;
    throw new Error(msg);
  }

  const trimmed = stdout.trim();
  const apiError = extractRustfsApiErrorMessage(trimmed);
  if (apiError) {
    throw new Error(apiError);
  }
}

async function getRustfsBucketTaggingViaApi(
  bucketName: string,
): Promise<Record<string, string> | undefined> {
  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const py =
    RUSTFS_PY_SETUP +
    `
import json

try:
  resp = client.get_bucket_tagging(Bucket=bucket)
  tagset = resp.get("TagSet", [])
  print(json.dumps(tagset))
except Exception as e:
  msg = str(e)
  if "NoSuchTagSet" in msg or "NoSuchBucketTagging" in msg or "404" in msg:
    print("[]")
  else:
    raise
`;

  let out: string;
  try {
    out = await execRustfsPython(py, {
      RUSTFS_ENDPOINT: endpointUrl,
      RUSTFS_BUCKET: bucketName,
      AWS_ACCESS_KEY_ID: creds.accessKeyId,
      AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("InvalidAccessKeyId")) {
      const maskedKey =
        creds.accessKeyId.length > 4
          ? `${creds.accessKeyId.slice(0, 2)}***${creds.accessKeyId.slice(-2)}`
          : "***";
      throw new Error(
        `RustFS tag API auth failed (InvalidAccessKeyId) for endpoint=${endpointUrl}, key=${maskedKey}. ` +
        `Set valid S3 creds via RUSTFS_ACCESS_KEY_ID/RUSTFS_SECRET_ACCESS_KEY.`
      );
    }
    throw e;
  }

  const parsed = JSON.parse(out || "[]") as Array<{ Key?: string; Value?: string }>;
  const tags: Record<string, string> = {};
  for (const item of parsed) {
    const k = String(item?.Key ?? "").trim();
    if (!k) continue;
    tags[k] = String(item?.Value ?? "");
  }
  return Object.keys(tags).length ? tags : undefined;
}

async function putRustfsBucketTaggingViaApi(
  bucketName: string,
  tags: Record<string, string>,
): Promise<void> {
  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const tagset = Object.entries(tags).map(([Key, Value]) => ({ Key, Value: String(Value) }));
  const py =
    RUSTFS_PY_SETUP +
    `
import json

tagset = json.loads(os.environ["RUSTFS_TAGSET_JSON"])
client.put_bucket_tagging(
  Bucket=bucket,
  Tagging={"TagSet": tagset},
)
print("ok")
`;

  await execRustfsPython(py, {
    RUSTFS_ENDPOINT: endpointUrl,
    RUSTFS_BUCKET: bucketName,
    RUSTFS_TAGSET_JSON: JSON.stringify(tagset),
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

async function deleteRustfsBucketTaggingViaApi(
  bucketName: string,
): Promise<void> {
  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const py =
    RUSTFS_PY_SETUP +
    `
try:
  client.delete_bucket_tagging(Bucket=bucket)
except Exception as e:
  msg = str(e)
  if "NoSuchTagSet" in msg or "NoSuchBucketTagging" in msg or "404" in msg:
    pass
  else:
    raise
print("ok")
`;

  await execRustfsPython(py, {
    RUSTFS_ENDPOINT: endpointUrl,
    RUSTFS_BUCKET: bucketName,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

async function runRustfsQuotaApiRequest(
  kind: "info" | "set" | "clear",
  method: "GET" | "PUT" | "DELETE",
  bucketName: string,
  body?: unknown,
): Promise<any> {
  const { apiBase, region, accessKey, secretKey } = await resolveRustfsAdminApiConfig();
  const url = `${apiBase}/quota/${encodeURIComponent(bucketName)}`;
  const bodyJson = body === undefined ? "" : JSON.stringify(body);

  const cmdParts = [
    `AWS_ACCESS_KEY_ID=${shellQuote(accessKey)}`,
    `AWS_SECRET_ACCESS_KEY=${shellQuote(secretKey)}`,
    "python3 -m awscurl --service s3",
    `--region ${shellQuote(region)}`,
    `-X ${shellQuote(method)}`,
  ];

  if (body !== undefined) {
    cmdParts.push(`-H ${shellQuote("Content-Type: application/json")}`);
    cmdParts.push(`-d ${shellQuote(bodyJson)}`);
  }
  cmdParts.push(shellQuote(url));

  const commandString = cmdParts.join(" ");

  const cmd = new Command(["bash", "-lc", commandString], {});
  const proc = await unwrap(server.execute(cmd, false));
  const stdout = proc.getStdout();
  const stderr = proc.getStderr();
  const exitStatus = proc.exitStatus;

  if (exitStatus !== 0) {
    const msg = stderr.trim() || stdout.trim() || `awscurl exited with status ${exitStatus}`;
    throw new Error(msg);
  }

  const trimmed = stdout.trim();
  const apiError = extractRustfsApiErrorMessage(trimmed);
  if (apiError) {
    throw new Error(apiError);
  }
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

async function runRustfsAdminApiGet(path: string): Promise<any> {
  const { apiBase, region, accessKey, secretKey } = await resolveRustfsAdminApiConfig();
  const url = `${apiBase}/${String(path).replace(/^\/+/, "")}`;

  const cmdParts = [
    `AWS_ACCESS_KEY_ID=${shellQuote(accessKey)}`,
    `AWS_SECRET_ACCESS_KEY=${shellQuote(secretKey)}`,
    "python3 -m awscurl --service s3",
    `--region ${shellQuote(region)}`,
    "-X 'GET'",
    shellQuote(url),
  ];

  const commandString = cmdParts.join(" ");


  const cmd = new Command(["bash", "-lc", commandString], {});
  const proc = await unwrap(server.execute(cmd, false));
  const stdout = proc.getStdout();
  const stderr = proc.getStderr();
  const exitStatus = proc.exitStatus;
  if (exitStatus !== 0) {
    const msg = stderr.trim() || stdout.trim() || `awscurl exited with status ${exitStatus}`;
    throw new Error(msg);
  }

  const trimmed = stdout.trim();
  const apiError = extractRustfsApiErrorMessage(trimmed);
  if (apiError) {
    throw new Error(apiError);
  }
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

async function runRustfsAdminApiRequest(
  kind: string,
  method: "GET" | "PUT" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<any> {
  const { apiBase, region, accessKey, secretKey } = await resolveRustfsAdminApiConfig();
  const url = `${apiBase}/${String(path).replace(/^\/+/, "")}`;
  const bodyJson = body === undefined ? "" : JSON.stringify(body);

  const cmdParts = [
    `AWS_ACCESS_KEY_ID=${shellQuote(accessKey)}`,
    `AWS_SECRET_ACCESS_KEY=${shellQuote(secretKey)}`,
    "python3 -m awscurl --service s3",
    `--region ${shellQuote(region)}`,
    `-X ${shellQuote(method)}`,
  ];

  if (body !== undefined) {
    cmdParts.push(`-H ${shellQuote("Content-Type: application/json")}`);
    cmdParts.push(`-d ${shellQuote(bodyJson)}`);
  }
  cmdParts.push(shellQuote(url));

  const commandString = cmdParts.join(" ");


  const cmd = new Command(["bash", "-lc", commandString], {});
  const proc = await unwrap(server.execute(cmd, false));
  const stdout = proc.getStdout();
  const stderr = proc.getStderr();
  const exitStatus = proc.exitStatus;
  if (exitStatus !== 0) {
    const msg = stderr.trim() || stdout.trim() || `awscurl exited with status ${exitStatus}`;
    throw new Error(msg);
  }

  const trimmed = stdout.trim();
  const apiError = extractRustfsApiErrorMessage(trimmed);
  if (apiError) {
    throw new Error(apiError);
  }
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: trimmed };
  }
}

function normalizeRustfsPolicyJsonString(input: unknown): string {
  const parsed =
    typeof input === "string"
      ? JSON.parse(input)
      : input;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Policy must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;
  const stmtsRaw = Array.isArray(obj.Statement) ? obj.Statement : [];

  // Preserve explicit "main-account policy" style payload.
  if (stmtsRaw.length === 0) {
    return JSON.stringify({
      ID: typeof obj.ID === "string" ? obj.ID : "",
      Version: typeof obj.Version === "string" ? obj.Version : "",
      Statement: [],
    });
  }

  const toStringArray = (v: unknown): string[] => {
    if (Array.isArray(v)) {
      return v.map((x) => String(x ?? "").trim()).filter(Boolean);
    }
    if (typeof v === "string") {
      const s = v.trim();
      return s ? [s] : [];
    }
    return [];
  };

  const statements = stmtsRaw.map((s) => {
    const row = (s && typeof s === "object" && !Array.isArray(s)) ? (s as Record<string, unknown>) : {};
    const effect = String(row.Effect ?? "Allow").trim() || "Allow";
    const action = toStringArray(row.Action);
    const resource = toStringArray(row.Resource);

    const out: Record<string, unknown> = {
      Effect: effect,
      Action: action.length ? action : ["s3:*"],
      Resource: resource.length ? resource : ["arn:aws:s3:::*"],
    };

    const sid = String(row.Sid ?? "").trim();
    if (sid) out.Sid = sid;
    return out;
  });

  return JSON.stringify({
    Version: typeof obj.Version === "string" && obj.Version.trim() ? obj.Version : "2012-10-17",
    Statement: statements,
  });
}


function extractRustfsApiErrorMessage(body: string): string | undefined {
  const trimmed = String(body ?? "").trim();
  if (!trimmed) return undefined;

  const code = trimmed.match(/<Code>([^<]+)<\/Code>/i)?.[1]?.trim();
  const message = trimmed.match(/<Message>([^<]+)<\/Message>/i)?.[1]?.trim();
  if (code || message) {
    return message ? `${code ?? "Error"}: ${message}` : code;
  }

  try {
    const parsed = JSON.parse(trimmed) as any;
    const jsonCode = parsed?.error?.Code ?? parsed?.error?.code ?? parsed?.Code ?? parsed?.code;
    const jsonMessage = parsed?.error?.Message ?? parsed?.error?.message ?? parsed?.Message ?? parsed?.message;
    if (jsonCode || jsonMessage) {
      return jsonMessage ? `${jsonCode ?? "Error"}: ${jsonMessage}` : String(jsonCode);
    }
  } catch {
    // no-op
  }

  return undefined;
}

function parseQuotaToBytes(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw);
  }

  const text = String(raw ?? "").trim();
  if (!text) return undefined;

  const plain = Number(text);
  if (Number.isFinite(plain) && plain > 0) {
    return Math.round(plain);
  }

  const m = text.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/);
  if (!m) return undefined;

  const value = Number(m[1]);
  const unit = String(m[2]).toUpperCase();
  if (!Number.isFinite(value) || value <= 0) return undefined;

  const factor = BYTE_UNIT_FACTORS[unit];
  if (!factor) return undefined;

  return Math.round(value * factor);
}

function parseQuotaSizeStringToBytes(raw: string): number | undefined {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return undefined;
  return parseQuotaToBytes(trimmed);
}

function extractQuotaBytesFromRows(rows: any[]): number | undefined {
  for (const row of rows) {
    const direct = parseQuotaToBytes((row as any)?.quota);
    if (direct !== undefined) return direct;

    const byLimit = parseQuotaToBytes((row as any)?.quota_limit);
    if (byLimit !== undefined) return byLimit;

    const byMax = parseQuotaToBytes((row as any)?.max_size);
    if (byMax !== undefined) return byMax;

    const byNested = parseQuotaToBytes((row as any)?.data?.quota);
    if (byNested !== undefined) return byNested;
  }
  return undefined;
}

async function getRustfsBucketQuotaBytesViaApi(bucketName: string): Promise<number | undefined> {
  const payload = await runRustfsQuotaApiRequest("info", "GET", bucketName);
  return extractQuotaBytesFromRows([payload]);
}

async function setRustfsBucketQuotaViaApi(bucketName: string, quotaBytes: number): Promise<void> {
  if (!Number.isFinite(quotaBytes) || quotaBytes <= 0) {
    throw new Error("setRustfsBucketQuotaViaApi: quotaBytes must be > 0");
  }

  const bytes = String(Math.round(quotaBytes));
  await runRustfsQuotaApiRequest("set", "PUT", bucketName, {
    quota: Number(bytes),
    quota_type: "HARD",
  });
}

async function clearRustfsBucketQuotaViaApi(bucketName: string): Promise<void> {
  await runRustfsQuotaApiRequest("clear", "DELETE", bucketName);
}


export async function listRustfsAliasCandidates(): Promise<S3AliasCandidate[]> {
  await loadRustfsManualConnectionFromUserConfig();
  const candidates: RustfsResolvedConnection[] = [];
  for (const entry of rustfsManualConnections) {
    const manual = buildConnectionFromEnv({
      apiBase: entry.apiBase,
      endpointUrl: entry.endpointUrl,
      accessKey: entry.accessKey,
      secretKey: entry.secretKey,
      source: "manual",
    });
    if (manual) candidates.push(manual);
  }
  const explicit = buildConnectionFromEnv({ source: "env" });
  if (explicit) candidates.push(explicit);
  const systemd = await detectSystemdRustfsConnection();
  if (systemd && !candidates.some((c) => c.endpointUrl === systemd.endpointUrl && c.source === systemd.source)) {
    candidates.push(systemd);
  }
  const container = await detectContainerRustfsConnection();
  if (container && !candidates.some((c) => c.endpointUrl === container.endpointUrl && c.source === container.source)) {
    candidates.push(container);
  }
  return candidates.map((c) => {
    const keyPrefix = String(c.accessKey ?? "").trim() || c.source;
    return {
      alias: `${keyPrefix}:${c.endpointUrl}`,
      url: c.endpointUrl,
      source: c.source,
      manual: c.source === "manual",
      accessKey: String(c.accessKey ?? "").trim() || undefined,
    };
  });
}

export async function isRustfsAvailable(): Promise<boolean> {
  try {
    await runRustfsAdminApiGet("list-users");
    return true;
  } catch (e: any) {
    console.warn("RustFS availability check failed (admin API probe); checking install/runtime presence:", {
      message: e?.message,
      stderr: e?.stderr,
      stdout: e?.stdout,
      exitStatus: e?.exitStatus,
    });
    try {
      const unit = await runUserShell("systemctl cat rustfs 2>/dev/null || true", true);
      if (unit.trim()) return true;
    } catch {
      // ignore
    }
    try {
      const runtime = await runUserShell(
        "(podman ps --format '{{.Image}}' 2>/dev/null || docker ps --format '{{.Image}}' 2>/dev/null || true)",
        true
      );
      if (runtime.split("\n").some((line) => /rustfs/i.test(line))) return true;
    } catch {
      // ignore
    }
    return false;
  }
}

export async function listRustfsUsers(): Promise<S3AccessUser[]> {
  const payload = await runRustfsAdminApiGet("list-users");
  const objs: any[] = [];

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const [username, details] of Object.entries(payload as Record<string, unknown>)) {
      if (!details || typeof details !== "object" || Array.isArray(details)) continue;
      objs.push({ username, ...(details as Record<string, unknown>) });
    }
  }

  const users: S3AccessUser[] = [];

  for (const obj of objs) {
    const username: string =
      obj.accessKey || obj.user || obj.userName || obj.username;
    if (!username) continue;
    const rawStatus: string =
      obj.userStatus || obj.status || obj.statusValue || "enabled";

    const status: "enabled" | "disabled" =
      String(rawStatus).toLowerCase() === "disabled" ? "disabled" : "enabled";

    let policies: string[] | undefined;
    if (Array.isArray(obj.policy)) {
      policies = obj.policy;
    } else if (Array.isArray(obj.policies)) {
      policies = obj.policies;
    } else if (typeof obj.policy === "string") {
      policies = [obj.policy];
    }

    if (!policies && typeof obj.policyName === "string") {
      policies = obj.policyName
        .split(",")
        .map((p: string) => p.trim())
        .filter(Boolean);
    }

    const policyCount = policies?.length ?? 0;
    users.push({ username, status, policies, policyCount });
  }

  return users;
}

export async function listRustfsServiceAccounts(): Promise<S3ServiceAccount[]> {
  const payload = await runRustfsAdminApiGet("list-service-accounts");

  const normalizeStatus = (value: unknown): "enabled" | "disabled" | undefined => {
    const s = String(value ?? "").trim().toLowerCase();
    if (!s) return undefined;
    if (s === "enabled" || s === "on" || s === "active") return "enabled";
    if (s === "disabled" || s === "off" || s === "inactive") return "disabled";
    return undefined;
  };

  const normalizeExpiry = (value: unknown): string | null | undefined => {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw || raw.toLowerCase() === "never") return null;
    return raw;
  };

  const rows: any[] = [];

  if (Array.isArray(payload)) {
    rows.push(...payload);
  } else if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const fromList =
      (Array.isArray(obj.serviceAccounts) && obj.serviceAccounts) ||
      (Array.isArray((obj as any).svcaccs) && (obj as any).svcaccs) ||
      (Array.isArray(obj.accounts) && obj.accounts);

    if (Array.isArray(fromList)) {
      rows.push(...fromList);
    } else {
      for (const [accessKey, value] of Object.entries(obj)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        rows.push({ accessKey, ...(value as Record<string, unknown>) });
      }
    }
  }

  const out: S3ServiceAccount[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const accessKey = String(
      (row as any).accessKey ?? (row as any).access_key ?? (row as any).id ?? ""
    ).trim();
    if (!accessKey) continue;

    out.push({
      accessKey,
      name: String((row as any).name ?? "").trim() || undefined,
      description: String((row as any).description ?? "").trim() || undefined,
      expiresAt: normalizeExpiry(
        (row as any).expiresAt ?? (row as any).expiration ?? (row as any).expiry
      ),
      status: normalizeStatus((row as any).status ?? (row as any).accountStatus),
    });
  }

  return out.sort((a, b) => a.accessKey.localeCompare(b.accessKey));
}

export async function createRustfsServiceAccount(
  payload: RustfsServiceAccountCreatePayload
): Promise<void> {
  const accessKey = String(payload?.accessKey ?? "").trim();
  const secretKey = String(payload?.secretKey ?? "").trim();
  const name = String(payload?.name ?? "").trim();
  const description = String(payload?.description ?? "").trim();
  const expirationRaw = String(payload?.expiration ?? "").trim();

  if (!accessKey) throw new Error("createRustfsServiceAccount: accessKey is required");
  if (!secretKey) throw new Error("createRustfsServiceAccount: secretKey is required");

  const expiration = expirationRaw || "9999-01-01T00:00:00.000Z";
  const normalizedPolicy =
    payload?.policy == null ? null : normalizeRustfsPolicyJsonString(payload.policy);

  await runRustfsAdminApiRequest(
    "add-service-accounts",
    "PUT",
    "add-service-accounts",
    {
      accessKey,
      secretKey,
      name: name || undefined,
      description: description || undefined,
      expiration,
      policy: normalizedPolicy,
    }
  );
}

export async function getRustfsServiceAccountInfo(accessKey: string): Promise<RustfsServiceAccountInfo> {
  const key = String(accessKey ?? "").trim();
  if (!key) throw new Error("getRustfsServiceAccountInfo: accessKey is required");

  const info = await runRustfsAdminApiGet(`info-service-account?accessKey=${encodeURIComponent(key)}`);
  return {
    accessKey: key,
    parentUser: String(info?.parentUser ?? "").trim() || undefined,
    accountStatus:
      String(info?.accountStatus ?? "").toLowerCase() === "off" ? "off" : "on",
    impliedPolicy: Boolean(info?.impliedPolicy),
    policy: typeof info?.policy === "string" ? info.policy : undefined,
    name: String(info?.name ?? "").trim() || undefined,
    description: typeof info?.description === "string" ? info.description : undefined,
    expiration: String(info?.expiration ?? "").trim() || undefined,
  };
}

export async function updateRustfsServiceAccount(
  payload: RustfsServiceAccountUpdatePayload
): Promise<void> {
  const key = String(payload?.accessKey ?? "").trim();
  if (!key) throw new Error("updateRustfsServiceAccount: accessKey is required");

  const normalizeExpiration = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    const raw = String(value).trim();
    if (!raw) return raw;
    return raw.replace(".000Z", "Z");
  };

  const body: Record<string, unknown> = {};
  if (payload.newName !== undefined) body.newName = payload.newName;
  if (payload.newDescription !== undefined) body.newDescription = payload.newDescription;
  if (payload.newExpiration !== undefined) body.newExpiration = normalizeExpiration(payload.newExpiration);
  if (payload.newPolicy !== undefined) {
    body.newPolicy = normalizeRustfsPolicyJsonString(payload.newPolicy);
  }
  if (payload.newStatus !== undefined) body.newStatus = payload.newStatus;

  await runRustfsAdminApiRequest(
    "update-service-account",
    "POST",
    `update-service-account?accessKey=${encodeURIComponent(key)}`,
    body
  );
}

export async function deleteRustfsServiceAccount(accessKey: string): Promise<void> {
  const key = String(accessKey ?? "").trim();
  if (!key) throw new Error("deleteRustfsServiceAccount: accessKey is required");

  const encoded = encodeURIComponent(key);
  const attempts: Array<() => Promise<any>> = [
    () =>
      runRustfsAdminApiRequest(
        "delete-service-accounts",
        "DELETE",
        `delete-service-accounts?accessKey=${encoded}`
      ),
    () =>
      runRustfsAdminApiRequest(
        "delete-service-account",
        "DELETE",
        `delete-service-account?accessKey=${encoded}`
      ),
  ];

  let lastErr: unknown;
  for (const fn of attempts) {
    try {
      await fn();
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to delete RustFS service account");
}

export async function getRustfsUserInfo(username: string): Promise<S3AccessUserDetails> {
  const target = String(username ?? "").trim();
  if (!target) {
    throw new Error("getRustfsUserInfo: username is required");
  }

  const info = await runRustfsAdminApiGet(
    `user-info?accessKey=${encodeURIComponent(target)}`
  );

  const rawStatus: string =
    info?.userStatus || info?.status || info?.statusValue || "enabled";
  const status: "enabled" | "disabled" =
    String(rawStatus).toLowerCase() === "disabled" ? "disabled" : "enabled";

  let policies: string[] | undefined;
  if (Array.isArray(info?.policies)) {
    policies = (info.policies as unknown[])
      .map((p) => String(p ?? "").trim())
      .filter(Boolean);
  } else if (typeof info?.policyName === "string") {
    policies = info.policyName
      .split(",")
      .map((p: string) => p.trim())
      .filter(Boolean);
  } else if (typeof info?.policy === "string") {
    policies = [String(info.policy).trim()].filter(Boolean);
  }

  const memberOfRaw = info?.memberOf || info?.member_of || [];
  const memberOf: S3AccessUserGroupMembership[] = Array.isArray(memberOfRaw)
    ? memberOfRaw
      .map((g: unknown) => String(g ?? "").trim())
      .filter(Boolean)
      .map((name) => ({ name }))
    : [];

  return {
    username: target,
    accessKey: target,
    status,
    policies,
    policyCount: policies?.length ?? 0,
    memberOf,
    raw: info,
  };
}

export async function deleteRustfsUser(username: string): Promise<void> {
  const target = String(username ?? "").trim();
  if (!target) {
    throw new Error("deleteRustfsUser: username is required");
  }

  const q = `remove-user?accessKey=${encodeURIComponent(target)}`;
  const variants: Array<() => Promise<any>> = [
    () => runRustfsAdminApiRequest("remove-user", "DELETE", q),
  ];

  let lastErr: unknown;
  for (const attempt of variants) {
    try {
      await attempt();
      return;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Failed to delete RustFS user");
}


export async function listRustfsPolicies(): Promise<string[]> {
  const payload = await runRustfsAdminApiGet("list-canned-policies");

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];

  const isPolicyDoc = (value: unknown): boolean => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const doc = value as Record<string, unknown>;
    // RustFS canned policy docs are expected to include Statement (array),
    // and often Version/ID fields.
    return Array.isArray(doc.Statement);
  };

  const names: string[] = [];
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const name = String(key ?? "").trim();
    if (!name) continue;
    if (!/^[A-Za-z0-9._-]+$/.test(name)) continue;
    if (!isPolicyDoc(value)) continue;
    names.push(name);
  }

  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

export async function getRustfsPolicy(name: string): Promise<string> {
  const policyName = String(name ?? "").trim();
  if (!policyName) {
    throw new Error("getRustfsPolicy: policy name is required");
  }

  // Fast path: fetch only the requested policy.
  try {
    const single = await runRustfsAdminApiGet(
      `info-canned-policy?name=${encodeURIComponent(policyName)}`
    );
    const policyRaw = (single as any)?.policy;
    if (typeof policyRaw === "string" && policyRaw.trim()) {
      try {
        return `${JSON.stringify(JSON.parse(policyRaw), null, 2)}\n`;
      } catch {
        return `${policyRaw.trim()}\n`;
      }
    }
    if (policyRaw && typeof policyRaw === "object" && !Array.isArray(policyRaw)) {
      return `${JSON.stringify(policyRaw, null, 2)}\n`;
    }
  } catch {
    // Fallback below
  }

  // Fallback: list all and select one by key.
  const payload = await runRustfsAdminApiGet("list-canned-policies");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("getRustfsPolicy: invalid RustFS policy response");
  }

  const doc = (payload as Record<string, unknown>)[policyName];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`Policy "${policyName}" not found`);
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export async function createOrUpdateRustfsPolicy(
  name: string,
  json: string
): Promise<void> {
  const policyName = String(name ?? "").trim();
  if (!policyName) {
    throw new Error("createOrUpdateRustfsPolicy: policy name is required");
  }

  const raw = String(json ?? "").trim();
  if (!raw) {
    throw new Error("createOrUpdateRustfsPolicy: policy json is required");
  }

  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error("createOrUpdateRustfsPolicy: invalid JSON");
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("createOrUpdateRustfsPolicy: policy must be a JSON object");
  }

  await runRustfsAdminApiRequest(
    "add-canned-policy",
    "PUT",
    `add-canned-policy?name=${encodeURIComponent(policyName)}`,
    doc
  );
}

export async function deleteRustfsPolicy(name: string): Promise<void> {
  const policyName = String(name ?? "").trim();
  if (!policyName) {
    throw new Error("deleteRustfsPolicy: policy name is required");
  }

  await runRustfsAdminApiRequest(
    "remove-canned-policy",
    "DELETE",
    `remove-canned-policy?name=${encodeURIComponent(policyName)}`
  );
}

export async function listRustfsGroups(): Promise<string[]> {
  const parseGroupNames = (payload: unknown): string[] => {
    const names = new Set<string>();
    const pushName = (value: unknown) => {
      const name = String(value ?? "").trim();
      if (!name) return;
      names.add(name);
    };

    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (typeof item === "string") pushName(item);
        else pushName((item as any)?.name ?? (item as any)?.group);
      }
      return Array.from(names).sort((a, b) => a.localeCompare(b));
    }

    if (payload && typeof payload === "object") {
      const obj = payload as Record<string, unknown>;
      if (Array.isArray((obj as any).groups)) {
        for (const g of (obj as any).groups) {
          if (typeof g === "string") pushName(g);
          else pushName((g as any)?.name ?? (g as any)?.group);
        }
      } else {
        for (const [key, val] of Object.entries(obj)) {
          if (val && typeof val === "object" && !Array.isArray(val)) pushName(key);
          else pushName(val);
        }
      }
      return Array.from(names).sort((a, b) => a.localeCompare(b));
    }

    return [];
  };

  const payload = await runRustfsAdminApiGet("groups");
  return parseGroupNames(payload);
}

export async function getRustfsGroupInfo(name: string): Promise<S3AccessGroupInfo> {
  const groupName = String(name ?? "").trim();
  if (!groupName) {
    throw new Error("getRustfsGroupInfo: group name is required");
  }

  const payload = await runRustfsAdminApiGet(`group?group=${encodeURIComponent(groupName)}`);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`getRustfsGroupInfo: invalid response for group "${groupName}"`);
  }

  const obj = payload as Record<string, unknown>;
  const apiName = String(obj.name ?? "").trim();
  const resolvedName = apiName || groupName;

  const members = Array.isArray(obj.members)
    ? (obj.members as unknown[])
      .map((m) => String(m ?? "").trim())
      .filter(Boolean)
    : [];

  const policy = String(obj.policy ?? "").trim();
  const policies = policy
    ? policy.split(",").map((p) => p.trim()).filter(Boolean)
    : [];

  return {
    name: resolvedName,
    members,
    policies,
    raw: payload,
  };
}

export async function deleteRustfsGroup(
  name: string,
  opts?: { removeMembersFirst?: boolean }
): Promise<void> {
  const groupName = String(name ?? "").trim();
  if (!groupName) {
    throw new Error("deleteRustfsGroup: group name is required");
  }

  const info = await getRustfsGroupInfo(groupName);
  const hasMembers = (info.members?.length ?? 0) > 0;
  const removeMembersFirst = !!opts?.removeMembersFirst;

  if (hasMembers && !removeMembersFirst) {
    throw new Error(
      `RustFS group "${groupName}" has ${info.members.length} member(s). Confirmation required to remove members and continue.`
    );
  }

  if (hasMembers && removeMembersFirst) {
    try {
      await runRustfsAdminApiRequest(
        "update-group-members",
        "PUT",
        "update-group-members",
        {
          group: groupName,
          groupStatus: "enabled",
          isRemove: true,
          members: info.members,
        }
      );
    } catch {
      // Compatibility fallback for builds that expect "clear members" payload.
      await runRustfsAdminApiRequest(
        "update-group-members",
        "PUT",
        "update-group-members",
        {
          group: groupName,
          groupStatus: "enabled",
          isRemove: false,
          members: [],
        }
      );
    }
  }

  await runRustfsAdminApiRequest(
    "group-delete",
    "DELETE",
    `group/${encodeURIComponent(groupName)}`
  );
}

export async function updateRustfsGroup(
  name: string,
  members: string[],
  policies: string[]
): Promise<void> {
  const groupName = String(name ?? "").trim();
  if (!groupName) {
    throw new Error("updateRustfsGroup: group name is required");
  }

  const current = await getRustfsGroupInfo(groupName);
  const currentMembers = Array.from(
    new Set((current.members ?? []).map((m) => String(m ?? "").trim()).filter(Boolean))
  ).sort();
  const desiredMembers = Array.from(
    new Set((members ?? []).map((m) => String(m ?? "").trim()).filter(Boolean))
  ).sort();

  const toAdd = desiredMembers.filter((m) => !currentMembers.includes(m));
  const toRemove = currentMembers.filter((m) => !desiredMembers.includes(m));

  if (toAdd.length > 0) {
    await runRustfsAdminApiRequest(
      "update-group-members",
      "PUT",
      "update-group-members",
      {
        group: groupName,
        groupStatus: "enabled",
        isRemove: false,
        members: toAdd,
      }
    );
  }

  if (toRemove.length > 0) {
    await runRustfsAdminApiRequest(
      "update-group-members",
      "PUT",
      "update-group-members",
      {
        group: groupName,
        groupStatus: "enabled",
        isRemove: true,
        members: toRemove,
      }
    );
  }

  const desiredPolicies = Array.from(
    new Set((policies ?? []).map((p) => String(p ?? "").trim()).filter(Boolean))
  );
  if (desiredPolicies.length > 0) {
    const policyName = desiredPolicies.join(",");
    await runRustfsAdminApiRequest(
      "set-user-or-group-policy",
      "PUT",
      `set-user-or-group-policy?policyName=${policyName}&userOrGroup=${encodeURIComponent(groupName)}&isGroup=true`,
      {}
    );
  }
}

export async function createRustfsGroup(
  name: string,
  members: string[]
): Promise<void> {
  const groupName = String(name ?? "").trim();
  if (!groupName) {
    throw new Error("createRustfsGroup: group name is required");
  }

  const normalizedMembers = Array.from(
    new Set((members ?? []).map((m) => String(m ?? "").trim()).filter(Boolean))
  );

  await runRustfsAdminApiRequest(
    "update-group-members",
    "PUT",
    "update-group-members",
    {
      group: groupName,
      groupStatus: "enabled",
      isRemove: false,
      members: normalizedMembers,
    }
  );
}

export async function createRustfsUser(
  payload: S3AccessUserCreatePayload
): Promise<void> {
  const username = String(payload?.username ?? "").trim();
  const secretKey = String(payload?.secretKey ?? "").trim();
  const status = payload?.status ?? "enabled";
  const policies = Array.isArray(payload?.policies) ? payload.policies : [];
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];

  if (!username) {
    throw new Error("createRustfsUser: username is required");
  }
  if (!secretKey) {
    throw new Error("createRustfsUser: secretKey is required");
  }

  await runRustfsAdminApiRequest(
    "add-user",
    "PUT",
    `add-user?accessKey=${encodeURIComponent(username)}`,
    {
      secretKey,
      status,
    }
  );

  const selectedPolicies = policies
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);
  if (selectedPolicies.length > 0) {
    const policyName = selectedPolicies.join(",");
    const userOrGroup = encodeURIComponent(username);
    await runRustfsAdminApiRequest(
      "set-user-or-group-policy",
      "PUT",
      `set-user-or-group-policy?policyName=${policyName}&userOrGroup=${userOrGroup}&isGroup=false`,
      {}
    );

    // Some RustFS builds return success but do not persist user policies.
    // Verify via RustFS admin API (avoid rc dependency for user info readback).
    const info = await runRustfsAdminApiGet(
      `user-info?accessKey=${encodeURIComponent(username)}`
    );
    const attachedFromList = Array.isArray((info as any)?.policies)
      ? ((info as any).policies as unknown[])
      : [];
    const attachedFromName = String((info as any)?.policyName ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const attached = new Set<string>(
      attachedFromList
        .map((p) => String(p ?? "").trim())
        .concat(attachedFromName)
        .filter(Boolean)
    );
    const missingPolicies = selectedPolicies.filter((p) => !attached.has(p));
    if (missingPolicies.length > 0) {
      throw new Error(
        `RustFS did not persist requested policies for user "${username}": ${missingPolicies.join(", ")}`
      );
    }
  }

  for (const group of groups) {
    const g = String(group ?? "").trim();
    if (!g) continue;
    await runRustfsAdminApiRequest(
      "update-group-members",
      "PUT",
      "update-group-members",
      {
        group: g,
        groupStatus: "enabled",
        isRemove: false,
        members: [username],
      }
    );
  }
}

export async function updateRustfsUser(payload: S3AccessUserUpdatePayload): Promise<void> {
  const username = String(payload?.username ?? "").trim();
  if (!username) {
    throw new Error("updateRustfsUser: username is required");
  }

  const current = await getRustfsUserInfo(username);
  const currentPolicies = Array.from(
    new Set((current.policies ?? []).map((p) => String(p ?? "").trim()).filter(Boolean))
  ).sort();
  const currentGroups = Array.from(
    new Set((current.memberOf ?? []).map((g) => String(g?.name ?? "").trim()).filter(Boolean))
  ).sort();

  const desiredPolicies = Array.from(
    new Set((payload.policies ?? []).map((p) => String(p ?? "").trim()).filter(Boolean))
  ).sort();
  const desiredGroups = Array.from(
    new Set((payload.groups ?? []).map((g) => String(g ?? "").trim()).filter(Boolean))
  ).sort();

  if (payload.status === "enabled" || payload.status === "disabled") {
    await runRustfsAdminApiRequest(
      "set-user-status",
      "PUT",
      `set-user-status?accessKey=${encodeURIComponent(username)}&status=${encodeURIComponent(payload.status)}`,
      {}
    );
  }

  if (desiredPolicies.join(",") !== currentPolicies.join(",")) {
    const policyName = desiredPolicies.join(",");
    const userOrGroup = encodeURIComponent(username);
    await runRustfsAdminApiRequest(
      "set-user-or-group-policy",
      "PUT",
      `set-user-or-group-policy?policyName=${policyName}&userOrGroup=${userOrGroup}&isGroup=false`,
      {}
    );
  }

  const groupsToAdd = desiredGroups.filter((g) => !currentGroups.includes(g));
  const groupsToRemove = currentGroups.filter((g) => !desiredGroups.includes(g));

  for (const g of groupsToAdd) {
    await runRustfsAdminApiRequest(
      "update-group-members",
      "PUT",
      "update-group-members",
      {
        group: g,
        groupStatus: "enabled",
        isRemove: false,
        members: [username],
      }
    );
  }

  for (const g of groupsToRemove) {
    await runRustfsAdminApiRequest(
      "update-group-members",
      "PUT",
      "update-group-members",
      {
        group: g,
        groupStatus: "enabled",
        isRemove: true,
        members: [username],
      }
    );
  }

  if (payload.resetSecret) {
    const newSecret = String(payload.newSecretKey ?? "").trim();
    if (!newSecret) {
      throw new Error("updateRustfsUser: explicit secret is required when resetSecret is enabled");
    }
    const statusForSecretReset = payload.status ?? current.status ?? "enabled";
    await runRustfsAdminApiRequest(
      "add-user",
      "PUT",
      `add-user?accessKey=${encodeURIComponent(username)}`,
      {
        secretKey: newSecret,
        status: statusForSecretReset,
      }
    );
  }
}

export async function getRustfsBucketStats(bucketName: string): Promise<{
  createdAt?: string;
  region?: string;
  objectCount: number;
  sizeBytes: number;
  versionsCount?: number;
  versioningStatus?: BucketVersioningStatus;
  objectLockEnabled?: boolean;
  tagsFromStat?: Record<string, string>;
}> {
  try {
    const usage = await runRustfsAdminApiGet("datausageinfo");
    const bucketUsage = (usage?.buckets_usage && usage.buckets_usage[bucketName]) || {};
    const derivedCount = Number(bucketUsage?.objects_count) || 0;
    const derivedSize = Number(bucketUsage?.size) || 0;

    return {
      createdAt: undefined,
      region: undefined,
      objectCount: derivedCount,
      sizeBytes: derivedSize,
      versionsCount: undefined,
      versioningStatus: undefined,
      objectLockEnabled: undefined,
      tagsFromStat: undefined,
    };
  } catch {
    // Keep zero values if find is unavailable or returns unexpected format.
    return {
      createdAt: undefined,
      region: undefined,
      objectCount: 0,
      sizeBytes: 0,
      versionsCount: undefined,
      versioningStatus: undefined,
      objectLockEnabled: undefined,
      tagsFromStat: undefined,
    };
  }
}

export async function getRustfsBucketVersioningStatus(
  bucketName: string
): Promise<BucketVersioningStatus | undefined> {
  try {
    return await getRustfsBucketVersioningViaS3Api(bucketName);
  } catch {
    return undefined;
  }
}

export async function getRustfsBucketQuotaBytes(bucketName: string): Promise<number | undefined> {
  return getRustfsBucketQuotaBytesViaApi(bucketName);
}

export async function getRustfsBucketTags(
  bucketName: string
): Promise<Record<string, string> | undefined> {
  return getRustfsBucketTaggingViaApi(bucketName);
}

export async function getRustfsBucketDashboardStats(
  bucketName: string
): Promise<RustfsBucketDashboardStats> {
  if (!bucketName) {
    throw new Error("getRustfsBucketDashboardStats: bucketName is required");
  }

  const dataUsage = await runRustfsAdminApiGet("datausageinfo");
  const bucketUsage = (dataUsage?.buckets_usage && dataUsage.buckets_usage[bucketName]) || {};

  const totalSizeBytes = Number(bucketUsage?.size ?? 0) || 0;
  const objectCount = Number(bucketUsage?.objects_count ?? 0) || 0;
  const versionCountRaw = Number(bucketUsage?.versions_count ?? NaN);
  const deleteMarkersRaw = Number(bucketUsage?.delete_markers_count ?? NaN);

  const [quotaBytes, versioningStatus, lockCfg] = await Promise.all([
    getRustfsBucketQuotaBytes(bucketName).catch(() => undefined),
    getRustfsBucketVersioningStatus(bucketName).catch(() => undefined),
    getRustfsBucketObjectLockConfiguration(bucketName),
  ]);

  const lastUpdateSecs = Number(dataUsage?.last_update?.secs_since_epoch ?? NaN);
  const lastUpdate =
    Number.isFinite(lastUpdateSecs) && lastUpdateSecs > 0
      ? new Date(lastUpdateSecs * 1000).toISOString()
      : undefined;

  return {
    bucket: bucketName,
    totalSizeBytes,
    objectCount,
    versionCount: Number.isFinite(versionCountRaw) ? versionCountRaw : undefined,
    deleteMarkersCount: Number.isFinite(deleteMarkersRaw) ? deleteMarkersRaw : undefined,
    quotaBytes,
    versioningStatus,
    objectLockEnabled: lockCfg.objectLockEnabled,
    objectLockMode: lockCfg.objectLockMode,
    objectLockRetentionDays: lockCfg.objectLockRetentionDays,
    lastUpdate,
    raw: {
      bucket: bucketName,
      total_capacity: dataUsage?.total_capacity,
      total_used_capacity: dataUsage?.total_used_capacity,
      total_free_capacity: dataUsage?.total_free_capacity,
      objects_total_count: dataUsage?.objects_total_count,
      versions_total_count: dataUsage?.versions_total_count,
      delete_markers_total_count: dataUsage?.delete_markers_total_count,
      last_update: dataUsage?.last_update,
      bucketUsage,
    },
  };
}

export async function listBucketsFromRustfs(): Promise<RustfsBucket[]> {
  const bucketEntries = await listRustfsBucketsViaS3Api();
  const usagePayload = await runRustfsAdminApiGet("datausageinfo").catch(() => undefined);
  const usageByBucket = (usagePayload?.buckets_usage ?? {}) as Record<string, any>;

  const detailed = await Promise.all(
    bucketEntries.map((entry) =>
      bucketLimit(async () => {
        const bucketName = String(entry?.name ?? "").trim().replace(/\/$/, "");

        if (!bucketName) return undefined;

        const [quotaBytes, listedTags, currentVersioning] = await Promise.all([
          getRustfsBucketQuotaBytes(bucketName),
          getRustfsBucketTags(bucketName),
          getRustfsBucketVersioningStatus(bucketName),
        ]);

        const usage = usageByBucket[bucketName] || {};
        const objectCount = Number(usage?.objects_count) || 0;
        const sizeBytes = Number(usage?.size) || 0;
        const versionsCountRaw = Number(usage?.versions_count ?? NaN);
        const versionsCount = Number.isFinite(versionsCountRaw) ? versionsCountRaw : undefined;
        const tags = listedTags;
        const owner: string | undefined =
          (tags && (tags.owner || tags.Owner || tags.bucketOwner)) || undefined;

        const inferredVersioning: BucketVersioningStatus | undefined =
          currentVersioning ??
          (versionsCount && versionsCount > 0 ? "Enabled" : "Suspended");

        const bucket: RustfsBucket = {
          backendKind: "rustfs",
          name: bucketName,
          createdAt: entry.createdAt,
          region: "rustfs-default-region",
          owner,
          policy: undefined,
          objectCount,
          sizeBytes,
          quotaBytes,
          versioning: inferredVersioning,
          tags: tags || undefined,
          objectLockEnabled: undefined,
        };

        return bucket;
      })
    )
  );

  return detailed.filter((b): b is RustfsBucket => Boolean(b));
}

export interface CreateBucketInRustfsOptions {
  region?: string;
  withLock?: boolean;
  withVersioning?: boolean;
  quotaSize?: string;
  objectLockMode?: "GOVERNANCE" | "COMPLIANCE";
  objectLockRetentionDays?: number;
}

export async function createBucketFromRustfs(
  bucketName: string,
  options: CreateBucketInRustfsOptions = {}
): Promise<void> {
  if (!bucketName) {
    throw new Error("createBucketFromRustfs: bucketName is required");
  }

  if (options.withLock) {
    await createRustfsBucketViaS3Api(bucketName, true);
    const lockEnabled = await isRustfsBucketObjectLockEnabledViaApi(bucketName);
    if (!lockEnabled) {
      throw new Error(
        `Bucket "${bucketName}" was created but object lock is not enabled.`
      );
    }
  } else {
    await createRustfsBucketViaS3Api(bucketName, false);
  }

  if (options.withVersioning) {
    await setRustfsBucketVersioningViaS3Api(bucketName, true);
  }

  if (options.quotaSize && options.quotaSize.trim()) {
    const quotaBytes = parseQuotaSizeStringToBytes(options.quotaSize.trim());
    if (quotaBytes !== undefined) {
      await setRustfsBucketQuotaViaApi(bucketName, quotaBytes);
    } else {
      throw new Error(`Invalid quota size: ${options.quotaSize}`);
    }
  }

  if (options.objectLockMode && typeof options.objectLockRetentionDays === "number") {
    if (!options.withLock) {
      throw new Error(
        "Default retention requires object lock at bucket creation. Enable object lock when creating the bucket."
      );
    }
    await putRustfsBucketObjectLockConfiguration(
      bucketName,
      options.objectLockMode,
      options.objectLockRetentionDays,
    );
  }
}

export async function deleteBucketFromRustfs(
  bucketName: string,
): Promise<void> {
  if (!bucketName) {
    throw new Error("deleteBucketFromRustfs: bucketName is required");
  }

  await deleteRustfsBucketViaS3Api(bucketName);
}

export interface UpdateRustfsBucketOptions {
  versioning?: boolean;
  quotaSize?: string | null;
  tags?: Record<string, string> | null;
  objectLockMode?: "GOVERNANCE" | "COMPLIANCE";
  objectLockRetentionDays?: number;
}

export async function updateRustfsBucket(
  bucketName: string,
  options: UpdateRustfsBucketOptions,
): Promise<void> {
  if (!bucketName) {
    throw new Error("updateRustfsBucket: bucketName is required");
  }

  if (typeof options.versioning === "boolean") {
    await setRustfsBucketVersioningViaS3Api(bucketName, options.versioning);
  }

  if (options.quotaSize !== undefined) {
    if (options.quotaSize === null || options.quotaSize.trim() === "") {
      await clearRustfsBucketQuotaViaApi(bucketName);
    } else {
      const parsedBytes = parseQuotaSizeStringToBytes(options.quotaSize);
      if (parsedBytes !== undefined) {
        await setRustfsBucketQuotaViaApi(bucketName, parsedBytes);
      } else {
        throw new Error(`Invalid quota size: ${options.quotaSize}`);
      }
    }
  }

  if (options.objectLockMode && typeof options.objectLockRetentionDays === "number") {
    await putRustfsBucketObjectLockConfiguration(
      bucketName,
      options.objectLockMode,
      options.objectLockRetentionDays,
    );
  }

  if ("tags" in options) {
    const { tags } = options;

    if (tags === null || !tags || Object.keys(tags).length === 0) {
      await deleteRustfsBucketTaggingViaApi(bucketName);
    } else {
      await putRustfsBucketTaggingViaApi(bucketName, tags);
    }
  }
}
