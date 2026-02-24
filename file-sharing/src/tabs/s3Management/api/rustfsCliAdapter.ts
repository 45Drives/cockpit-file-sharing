import type {
  BucketVersioningStatus,
  McAliasCandidate,
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
    const authority = u.host;
    if (!authority) return undefined;
    return normalizeApiBase(`${u.protocol}//${authority}/rustfs/admin/v3`);
  } catch {
    return undefined;
  }
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

async function getRustfsAliasConfig(alias: string): Promise<RustfsAliasConfig> {
  let firstAliasFromRc: RustfsAliasConfig | undefined;
  const normalizeUrl = (value: unknown): string | undefined => {
    const raw = String(value ?? "").trim();
    if (!raw) return undefined;
    try {
      const u = new URL(raw);
      return normalizeApiBase(u.toString());
    } catch {
      return undefined;
    }
  };

  try {
    const { stdout } = await runRc(["--json", "alias", "list"]);
    const rows = parseJsonLines(stdout);

    const push = (entry: any): RustfsAliasConfig | undefined => {
      const a = String(entry?.alias ?? entry?.name ?? "").trim();
      if (!a) return undefined;

      const cfg: RustfsAliasConfig = {
        url: normalizeUrl(
          entry?.endpoint ??
          entry?.Endpoint ??
          entry?.url ??
          entry?.URL
        ),
        accessKey: String(
          entry?.AccessKey ??
          entry?.accessKey ??
          entry?.access_key ??
          ""
        ).trim() || undefined,
        secretKey: String(
          entry?.SecretKey ??
          entry?.secretKey ??
          entry?.secret_key ??
          ""
        ).trim() || undefined,
      };
      if (!firstAliasFromRc || (!firstAliasFromRc.url && cfg.url)) {
        firstAliasFromRc = cfg;
      }
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

  // Fallback: parse plain `rc alias list` output:
  // rustfs   http://localhost:9200
  try {
    const { stdout } = await runRc(["alias", "list"], true);
    const lines = String(stdout ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: RustfsAliasConfig[] = [];
    for (const line of lines) {
      const m = line.match(/^([^\s]+)\s+(\S+)$/);
      if (!m) continue;
      const name = m[1]!;
      const url = normalizeUrl(m[2]);
      if (!url) continue;
      const cfg: RustfsAliasConfig = { url };
      if (!firstAliasFromRc || (!firstAliasFromRc.url && cfg.url)) {
        firstAliasFromRc = cfg;
      }
      if (name === alias) return cfg;
      parsed.push(cfg);
    }
    if (parsed.length > 0 && firstAliasFromRc?.url) return firstAliasFromRc;
  } catch {
    // no-op: continue with rc config fallback
  }

  if (firstAliasFromRc?.url) return firstAliasFromRc;

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
    const url = normalizeUrl(chosen.url);
    if (!url) return {};

    return {
      url,
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
      deriveRustfsAdminApiBaseFromAliasUrl(aliasCfg.url ?? "")
    );
  if (!apiBase) {
    throw new Error(
      `Unable to resolve RustFS admin API base from rc alias "${RUSTFS_ALIAS}".`
    );
  }

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
      deriveRustfsS3EndpointFromAdminApiBase(adminApiBase ?? "")
    );
  if (!endpointUrl) {
    throw new Error(
      `Unable to resolve RustFS S3 endpoint from rc alias "${RUSTFS_ALIAS}".`
    );
  }

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
  const redacted = commandString.replace(
    /AWS_SECRET_ACCESS_KEY='[^']*'/,
    "AWS_SECRET_ACCESS_KEY='***'"
  );
  console.log(`[rustfs admin:${kind}] ${redacted}`);

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
    () => runRustfsAdminApiRequest("remove-user", "PUT", q, {}),
    () => runRustfsAdminApiRequest("remove-user", "POST", q, {}),
    () => runRc(["admin", "user", "remove", RUSTFS_ALIAS, target]),
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

function parseNameListFromOutput(
  stdout: string,
  expectedTopLevelKey: string,
  candidateKeys: string[]
): string[] {
  const rows = parseJsonLines(stdout);
  const names = new Set<string>();

  const collectString = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (!text) return;
    names.add(text);
  };

  for (const row of rows) {
    const nested = (row as any)?.[expectedTopLevelKey];
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        if (typeof entry === "string") {
          collectString(entry);
          continue;
        }
        for (const key of candidateKeys) {
          collectString((entry as any)?.[key]);
        }
      }
      continue;
    }

    if (typeof row === "string") {
      collectString(row);
      continue;
    }

    for (const key of candidateKeys) {
      const value = (row as any)?.[key];
      if (Array.isArray(value)) {
        for (const v of value) collectString(v);
      } else {
        collectString(value);
      }
    }
  }

  if (names.size > 0) {
    return Array.from(names).sort();
  }

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
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

  if (payload.status === "enabled") {
    await runRc(["admin", "user", "enable", RUSTFS_ALIAS, username]);
  } else if (payload.status === "disabled") {
    await runRc(["admin", "user", "disable", RUSTFS_ALIAS, username]);
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
    await runRc(["admin", "user", "add", RUSTFS_ALIAS, username, newSecret]);
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
