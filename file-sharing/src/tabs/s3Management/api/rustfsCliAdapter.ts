import type { BucketVersioningStatus, McAliasCandidate, RustfsBucket, RustfsBucketDashboardStats } from "../types/types";
import pLimit from "p-limit";
import { server, Command, unwrap } from "@45drives/houston-common-lib";

const bucketLimit = pLimit(6);

let RUSTFS_ALIAS = process.env.RUSTFS_RC_ALIAS || "local";

export function setRustfsAlias(alias: string): void {
  const trimmed = String(alias ?? "").trim();
  if (!trimmed) return;
  RUSTFS_ALIAS = trimmed;
}

export function getRustfsAlias(): string {
  return RUSTFS_ALIAS;
}

type RunRcResult = {
  stdout: string;
  stderr: string;
  exitStatus: number;
};

type RustfsAliasConfig = {
  url?: string;
  accessKey?: string;
  secretKey?: string;
};
type RustfsS3Creds = {
  accessKeyId: string;
  secretAccessKey: string;
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

async function runRc(args: string[], allowFailure = false): Promise<RunRcResult> {
  const cmd = new Command(["rc", ...args], { superuser: "require" });
  const proc = await unwrap(server.execute(cmd, false));
  const res: RunRcResult = {
    stdout: proc.getStdout(),
    stderr: proc.getStderr(),
    exitStatus: proc.exitStatus,
  };
  const { stdout, stderr, exitStatus } = res;

  if (exitStatus !== 0 && !allowFailure) {
    const msg = stderr.trim() || stdout.trim() || `rc exited with status ${exitStatus}`;
    const e = new Error(msg) as any;
    e.stdout = stdout;
    e.stderr = stderr;
    e.exitStatus = exitStatus;
    e.cause = res;
    throw e;
  }

  return { stdout, stderr, exitStatus };
}

async function runRcWithFallback(argVariants: string[][]): Promise<RunRcResult> {
  let lastErr: unknown;
  for (const args of argVariants) {
    try {
      return await runRc(args);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("RustFS command failed");
}



function shellQuote(v: string): string {
  return `'${String(v ?? "").replace(/'/g, `'\\''`)}'`;
}

function normalizeApiBase(v: string): string {
  return String(v ?? "").replace(/\/+$/, "");
}

function deriveRustfsAdminApiBaseFromAliasUrl(aliasUrl: string): string | undefined {
  const raw = String(aliasUrl ?? "").trim();
  if (!raw) return undefined;

  try {
    const u = new URL(raw);
    const host = u.hostname;
    if (!host) return undefined;
    return normalizeApiBase(`${u.protocol}//${host}:9201/rustfs/admin/v3`);
  } catch {
    return undefined;
  }
}

function deriveRustfsS3EndpointFromAdminApiBase(adminApiBase: string): string | undefined {
  const raw = String(adminApiBase ?? "").trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const host = u.hostname;
    if (!host) return undefined;
    return normalizeApiBase(`${u.protocol}//${host}:9200`);
  } catch {
    return undefined;
  }
}

async function getRustfsAliasConfig(alias: string): Promise<RustfsAliasConfig> {
  let firstAliasFromRc: RustfsAliasConfig | undefined;
  try {
    const { stdout } = await runRc(["--json", "alias", "list"]);
    const rows = parseJsonLines(stdout);

    const push = (entry: any): RustfsAliasConfig | undefined => {
      const a = String(entry?.alias ?? entry?.name ?? "").trim();
      if (!a) return undefined;

      const cfg: RustfsAliasConfig = {
        url: String(entry?.URL ?? entry?.url ?? "").trim() || undefined,
        accessKey: String(entry?.AccessKey ?? entry?.accessKey ?? "").trim() || undefined,
        secretKey: String(entry?.SecretKey ?? entry?.secretKey ?? "").trim() || undefined,
      };
      if (!firstAliasFromRc) firstAliasFromRc = cfg;
      if (a !== alias) return undefined;
      return cfg;
    };

    for (const row of rows) {
      if (Array.isArray((row as any)?.aliases)) {
        for (const nested of (row as any).aliases) {
          const cfg = push(nested);
          if (cfg) return cfg;
        }
      } else {
        const cfg = push(row);
        if (cfg) return cfg;
      }
    }
  } catch {
    // no-op: we have defaults/env fallback below
  }

  if (firstAliasFromRc) return firstAliasFromRc;

  // Fallback: parse rc config file directly (e.g. ~/.config/rc/config.toml)
  // Sample:
  // [[aliases]]
  // name = "rustfs"
  // url = "http://127.0.0.1:9200"
  // access_key = "rustfsadmin"
  // secret_key = "rustfsadmin"
  try {
    const cmd = new Command(
      ["bash", "-lc", "cat ~/.config/rc/config.toml 2>/dev/null || true"],
      { superuser: "require" },
    );
    const proc = await unwrap(server.execute(cmd, false));
    const text = String(proc.getStdout() ?? "");
    if (!text.trim()) return {};

    const lines = text.split("\n");
    let inAliasBlock = false;
    let current: Record<string, string> = {};
    const parsedAliases: Array<{ name?: string; url?: string; access_key?: string; secret_key?: string }> = [];

    const flush = () => {
      if (!Object.keys(current).length) return;
      parsedAliases.push({
        name: current.name,
        url: current.url,
        access_key: current.access_key,
        secret_key: current.secret_key,
      });
      current = {};
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      if (line.startsWith("[[")) {
        flush();
        inAliasBlock = line === "[[aliases]]" || line === "[[alias]]";
        continue;
      }
      if (line.startsWith("[")) {
        flush();
        inAliasBlock = false;
        continue;
      }
      if (!inAliasBlock) continue;

      const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*"(.*)"\s*$/);
      if (!m) continue;
      const key = m[1]!;
      const value = m[2]!;
      current[key] = value;
    }
    flush();

    const exact = parsedAliases.find((a) => String(a.name ?? "").trim() === alias);
    const chosen = exact ?? parsedAliases[0];
    if (!chosen) return {};

    return {
      url: chosen.url || undefined,
      accessKey: chosen.access_key || undefined,
      secretKey: chosen.secret_key || undefined,
    };
  } catch {
    return {};
  }
}

async function resolveRustfsAdminApiConfig(): Promise<{
  apiBase: string;
  region: string;
  accessKey: string;
  secretKey: string;
}> {
  const aliasCfg = await getRustfsAliasConfig(RUSTFS_ALIAS);

  const apiBase =
    normalizeApiBase(
      process.env.RUSTFS_ADMIN_API_BASE ||
      process.env.RUSTFS_API_BASE ||
      deriveRustfsAdminApiBaseFromAliasUrl(aliasCfg.url ?? "") ||
      "http://127.0.0.1:9201/rustfs/admin/v3"
    );

  const region = String(process.env.RUSTFS_ADMIN_REGION || process.env.AWS_REGION || "us-east-1");
  const accessKey = String(process.env.RUSTFS_ADMIN_ACCESS_KEY || aliasCfg.accessKey || "rustfsadmin");
  const secretKey = String(process.env.RUSTFS_ADMIN_SECRET_KEY || aliasCfg.secretKey || "rustfsadmin");

  return { apiBase, region, accessKey, secretKey };
}

async function resolveRustfsS3ApiConfig(): Promise<{
  endpointUrl: string;
  creds: RustfsS3Creds;
}> {
  const aliasCfg = await getRustfsAliasConfig(RUSTFS_ALIAS);
  const adminApiBase =
    process.env.RUSTFS_ADMIN_API_BASE ||
    process.env.RUSTFS_API_BASE ||
    deriveRustfsAdminApiBaseFromAliasUrl(aliasCfg.url ?? "");

  const endpointUrl =
    normalizeApiBase(
      process.env.RUSTFS_S3_ENDPOINT ||
      aliasCfg.url ||
      deriveRustfsS3EndpointFromAdminApiBase(adminApiBase ?? "") ||
      "http://127.0.0.1:9200"
    );

  const accessKeyId = String(
    process.env.RUSTFS_ACCESS_KEY_ID ||
    aliasCfg.accessKey ||
    process.env.RUSTFS_ADMIN_ACCESS_KEY ||
    "rustfsadmin"
  );
  const secretAccessKey = String(
    process.env.RUSTFS_SECRET_ACCESS_KEY ||
    aliasCfg.secretKey ||
    process.env.RUSTFS_ADMIN_SECRET_KEY ||
    "rustfsadmin"
  );

  return { endpointUrl, creds: { accessKeyId, secretAccessKey } };
}

async function execRustfsPython(
  pythonSource: string,
  env: Record<string, string>,
): Promise<string> {
  const exports = Object.entries(env)
    .map(([k, v]) => `export ${k}=${shellQuote(v)}`)
    .join("; ");

  const cmdLine = `${exports}; python3 - <<'PY'\n${pythonSource}\nPY`;
  const cmd = new Command(["bash", "-lc", cmdLine], { superuser: "require" });
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

  console.log(`[rustfs retention:set] endpoint=${endpointUrl} bucket=${bucketName} mode=${mode} days=${days}`);
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

async function createRustfsBucketWithObjectLockViaApi(bucketName: string): Promise<void> {
  const { endpointUrl, creds } = await resolveRustfsS3ApiConfig();
  const py =
    RUSTFS_PY_SETUP +
    `
try:
  client.create_bucket(
    Bucket=bucket,
    ObjectLockEnabledForBucket=True,
  )
except Exception as e:
  msg = str(e)
  # Accept idempotent create response if bucket already exists/owned.
  if "BucketAlreadyOwnedByYou" in msg or "BucketAlreadyExists" in msg:
    pass
  else:
    raise
print("ok")
`;

  console.log(`[rustfs bucket:create-lock-api] endpoint=${endpointUrl} bucket=${bucketName}`);
  await execRustfsPython(py, {
    RUSTFS_ENDPOINT: endpointUrl,
    RUSTFS_BUCKET: bucketName,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
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

  console.log(`[rustfs tags:get] endpoint=${endpointUrl} bucket=${bucketName}`);
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
        `Set valid S3 creds via RUSTFS_ACCESS_KEY_ID/RUSTFS_SECRET_ACCESS_KEY or fix rc alias "${RUSTFS_ALIAS}" credentials.`
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

  console.log(`[rustfs tags:set] endpoint=${endpointUrl} bucket=${bucketName} count=${tagset.length}`);
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

  console.log(`[rustfs tags:clear] endpoint=${endpointUrl} bucket=${bucketName}`);
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
  const redacted = commandString.replace(
    /AWS_SECRET_ACCESS_KEY='[^']*'/,
    "AWS_SECRET_ACCESS_KEY='***'"
  );
  console.log(`[rustfs quota:${kind}] ${redacted}`);

  const cmd = new Command(["bash", "-lc", commandString], { superuser: "require" });
  const proc = await unwrap(server.execute(cmd, false));
  const stdout = proc.getStdout();
  const stderr = proc.getStderr();
  const exitStatus = proc.exitStatus;

  if (exitStatus !== 0) {
    const msg = stderr.trim() || stdout.trim() || `awscurl exited with status ${exitStatus}`;
    throw new Error(msg);
  }

  const trimmed = stdout.trim();
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
  const redacted = commandString.replace(
    /AWS_SECRET_ACCESS_KEY='[^']*'/,
    "AWS_SECRET_ACCESS_KEY='***'"
  );
  console.log(`[rustfs admin:get] ${redacted}`);

  const cmd = new Command(["bash", "-lc", commandString], { superuser: "require" });
  const proc = await unwrap(server.execute(cmd, false));
  const stdout = proc.getStdout();
  const stderr = proc.getStderr();
  const exitStatus = proc.exitStatus;
  if (exitStatus !== 0) {
    const msg = stderr.trim() || stdout.trim() || `awscurl exited with status ${exitStatus}`;
    throw new Error(msg);
  }

  const trimmed = stdout.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

function parseJsonLines(text: string): any[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Prefer parsing as one full JSON payload first (rc often returns pretty JSON).
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Fallback: JSONL parsing for commands that emit one JSON object per line.
  }

  return trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

async function rcJsonLinesWithFallback(subArgsList: string[][]): Promise<any[]> {
  let lastErr: unknown;
  for (const subArgs of subArgsList) {
    try {
      const { stdout } = await runRc(["--json", ...subArgs]);
      return parseJsonLines(stdout);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("RustFS command failed");
}

async function rcJsonSingleWithFallback(subArgsList: string[][]): Promise<any> {
  const list = await rcJsonLinesWithFallback(subArgsList);
  return list[0] ?? {};
}



export async function listRustfsAliasCandidates(): Promise<McAliasCandidate[]> {
  const { stdout } = await runRc(["--json", "alias", "list"]);
  const rows = parseJsonLines(stdout);

  const candidates: McAliasCandidate[] = [];
  const pushAlias = (value: unknown) => {
    const alias = String(value ?? "").trim();
    if (!alias) return;
    if (candidates.some((c) => c.alias === alias)) return;
    candidates.push({ alias });
  };

  for (const r of rows) {
    // rc may return a single JSON object with { aliases: [...] }
    const nested = (r as any)?.aliases;
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        pushAlias((entry as any)?.alias ?? (entry as any)?.name);
      }
      continue;
    }

    pushAlias((r as any)?.alias ?? (r as any)?.name);
  }

  return candidates;
}

export async function isRustfsAvailable(): Promise<boolean> {
  try {
    await runRc(["--json", "alias", "list"]);
    return true;
  } catch (e: any) {
    console.warn("RustFS availability check failed (rc --json alias list):", {
      message: e?.message,
      stderr: e?.stderr,
      stdout: e?.stdout,
      exitStatus: e?.exitStatus,
    });
    return false;
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
  const bucketPath = `${RUSTFS_ALIAS}/${bucketName}`;
  try {
    const objects = await rcJsonLinesWithFallback([
      ["find", bucketPath],
    ]);

    const payload = objects[0] as any;
    const derivedCount = Number(payload?.total_count) || 0;
    const derivedSize = Number(payload?.total_size_bytes) || 0;

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
  const bucketPath = `${RUSTFS_ALIAS}/${bucketName}`;
  try {
    const entry = await rcJsonSingleWithFallback([
      ["version", "info", bucketPath],
      ["version", "get", bucketPath],
      ["version", "stat", bucketPath],
    ]);

    const status = String((entry as any)?.status ?? "").trim().toLowerCase();
    if (status === "enabled") return "Enabled";
    if (status === "suspended" || status === "disabled") return "Suspended";

    const enabled = (entry as any)?.enabled;
    if (typeof enabled === "boolean") {
      return enabled ? "Enabled" : "Suspended";
    }

    return undefined;
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
    getRustfsBucketObjectLockConfiguration(bucketName).catch(() => ({})),
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
  const entriesRaw = await rcJsonLinesWithFallback([
    ["ls", RUSTFS_ALIAS],
  ]);

  const entries =
    entriesRaw.length === 1 && Array.isArray((entriesRaw[0] as any)?.items)
      ? ((entriesRaw[0] as any).items as any[])
      : entriesRaw;

  const bucketEntries = entries.filter((e) => {
    if ((e as any).is_dir === true) return true;
    if (e.type === "folder" || e.type === "bucket") return true;
    return false;
  });

  const detailed = await Promise.all(
    bucketEntries.map((entry) =>
      bucketLimit(async () => {
        const rawName: string =
          entry.key || entry.name || entry.bucket || entry.target || "";
        const bucketName = String(rawName).replace(/\/$/, "");

        if (!bucketName) return undefined;

        const [stats, quotaBytes, listedTags, currentVersioning] = await Promise.all([
          getRustfsBucketStats(bucketName),
          getRustfsBucketQuotaBytes(bucketName),
          getRustfsBucketTags(bucketName),
          getRustfsBucketVersioningStatus(bucketName),
        ]);

        const { createdAt, region, objectCount, sizeBytes, versionsCount, versioningStatus, objectLockEnabled, tagsFromStat } = stats;
        const tags = tagsFromStat || listedTags;
        const owner: string | undefined =
          (tags && (tags.owner || tags.Owner || tags.bucketOwner)) || undefined;

        const inferredVersioning: BucketVersioningStatus | undefined =
          currentVersioning ??
          versioningStatus ??
          (versionsCount && versionsCount > 0 ? "Enabled" : "Suspended");

        const bucket: RustfsBucket = {
          backendKind: "rustfs",
          name: bucketName,
          createdAt,
          region: region || "rustfs-default-region",
          owner,
          policy: undefined,
          objectCount,
          sizeBytes,
          quotaBytes,
          versioning: inferredVersioning,
          tags: tags || undefined,
          objectLockEnabled,
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

  const bucketPath = `${RUSTFS_ALIAS}/${bucketName}`;
  if (options.withLock) {
    // Use the known-good path directly for lock-enabled buckets.
    await createRustfsBucketWithObjectLockViaApi(bucketName);
    const lockEnabled = await isRustfsBucketObjectLockEnabledViaApi(bucketName);
    if (!lockEnabled) {
      throw new Error(
        `Bucket "${bucketName}" was created but object lock is not enabled.`
      );
    }
  } else {
    console.log(`[rustfs bucket:create] rc mb ${bucketPath}`);
    await runRc(["mb", bucketPath]);
  }

  if (options.withVersioning) {
    await runRcWithFallback([
      ["version", "enable", bucketPath],
      ["version", "set", "enabled", bucketPath],
    ]);
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

  const bucketPath = `${RUSTFS_ALIAS}/${bucketName}`;

  await runRc(["rb", bucketPath]);
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

  const bucketPath = `${RUSTFS_ALIAS}/${bucketName}`;

  if (typeof options.versioning === "boolean") {
    if (options.versioning) {
      await runRcWithFallback([
        ["version", "enable", bucketPath],
        ["version", "set", "enabled", bucketPath],
      ]);
    } else {
      await runRcWithFallback([
        ["version", "suspend", bucketPath],
        ["version", "disable", bucketPath],
        ["version", "set", "disabled", bucketPath],
      ]);
    }
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
