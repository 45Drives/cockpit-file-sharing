// cephRgwCliAdapter.ts
import type {CephAclRule,RgwGateway,RgwUser,RgwDashboardS3Creds,CreatedRgwUserKeys,CreateRgwUserOptions,RgwUserDetails,RgwUserKey,RgwUserCap,CephBucketUpdatePayload,
  BucketDashboardStats,BucketUserUsage,BucketDashboardOptions,BucketVersioningStatus,CephBucket,
  CephAclPermission,
} from "../types/types";
import { legacy, server, Command, unwrap } from "@45drives/houston-common-lib";
import pLimit from "p-limit";


const rgwLimit = pLimit(6);
const { errorString } = legacy;
type CephS3Connection = {
  endpointUrl: string;
};

let cachedCephS3Conn: CephS3Connection | null = null;
type RgwS3Creds = { accessKey: string; secretKey: string };
const cachedRgwCredsByUid = new Map<string, RgwS3Creds>();

export async function rgwJson(subArgs: string[]): Promise<any> {
  return rgwLimit(async () => {
    const cmd = new Command(["radosgw-admin", ...subArgs, "--format", "json"], {
      superuser: "try",
    });

    try {
      const proc = await unwrap(server.execute(cmd));
      const stdout =
        typeof (proc as any).getStdout === "function"
          ? (proc as any).getStdout()
          : ((proc as any).stdout ?? "").toString();

      const text = (stdout ?? "").toString().trim();

      if (!text) return {};
      return JSON.parse(text);
    } catch (state: any) {
      throw new Error(errorString(state));
    }
  });
}

export async function listBucketsFromCeph(): Promise<CephBucket[]> {
  const statsList: any[] = await rgwJson(["bucket", "stats"]);

  return statsList.map((stats) => buildS3BucketFromRgwStats(stats));
}

export async function getBucketObjectStats(
  bucketName: string
): Promise<{ objectCount: number; sizeBytes: number }> {
  const stats = await rgwJson(["bucket", "stats", "--bucket", bucketName]);

  const usage = stats.usage || {};
  const usageKey = "rgw.main" in usage ? "rgw.main" : Object.keys(usage)[0];
  const usageMain = usageKey ? usage[usageKey] || {} : {};

  const sizeBytes: number = usageMain.size ?? 0;
  const objectCount: number = usageMain.num_objects ?? 0;

  return { objectCount, sizeBytes };
}

export async function isCephRgwHealthy(): Promise<boolean> {
  try {
    // Any lightweight admin call that fails fast if RGW is unreachable/unauthorized
    await rgwJson(["zonegroup", "get"]);
    await ensureRgwUserExists({uid: "houstonUi",displayName: "Houston UI",systemUser: false,
    });
    return true;
  } catch (e) {
    return false;
  }
}

export async function deleteBucketFromCeph(
  bucketName: string,
  options?: { purgeObjects?: boolean; ownerUid?: string }
): Promise<void> {
  const args: string[] = ["bucket", "rm", "--bucket", bucketName];

  if (options?.purgeObjects) {
    args.push("--purge-objects");
  }

  await rgwJson(args);
}

async function execText(
  args: string[],
): Promise<string> {
  const cmd = new Command(args, { superuser: "try" });

  try {
    const proc = await unwrap(server.execute(cmd));
    const stdout =
      typeof (proc as any).getStdout === "function"
        ? (proc as any).getStdout()
        : ((proc as any).stdout ?? "").toString();

    return (stdout ?? "").toString().trim();
  } catch (state: any) {
    throw new Error(errorString(state));
  }
}

function parseRgwFrontend(frontendConfig: string): { host?: string; port: number } | null {
  // Matches: "beast endpoint=192.168.85.64:8080"
  const endpoint = frontendConfig.match(/\bendpoint=(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})\b/);
  if (endpoint && endpoint[1] && endpoint[2]) {
    const port = Number(endpoint[2]);
    if (Number.isFinite(port) && port > 0 && port < 65536) return { host: endpoint[1], port };
  }

  // Matches: "beast port=192.168.45.230:8080"
  const portIp = frontendConfig.match(/\bport=(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})\b/);
  if (portIp && portIp[1] && portIp[2]) {
    const port = Number(portIp[2]);
    if (Number.isFinite(port) && port > 0 && port < 65536) return { host: portIp[1], port };
  }

  // Matches: "beast port=8080"
  const portOnly = frontendConfig.match(/\bport=(\d{1,5})\b/);
  if (portOnly && portOnly[1]) {
    const port = Number(portOnly[1]);
    if (Number.isFinite(port) && port > 0 && port < 65536) return { port };
  }

  return null;
}

async function resolveIpv4ViaGetent(hostname: string): Promise<string | null> {
  const h = String(hostname ?? "").trim();
  if (!h) return null;

  const ip = await execText([
    "bash",
    "-lc",
    `getent ahostsv4 "${h.replace(/"/g, '\\"')}" | awk 'NR==1{print $1}'`,
  ]);

  return ip ? ip : null;
}

async function httpProbeViaCurl(endpointUrl: string, timeoutSec = 1): Promise<boolean> {
  const url = String(endpointUrl ?? "").trim();
  if (!url) return false;

  const rc = await execText([
    "bash",
    "-lc",
    `curl -sS -m ${timeoutSec} -o /dev/null "${url}/" >/dev/null 2>&1; echo $?`,
  ]);

  return rc === "0";
}

export async function firstWorkingRgwGateway(): Promise<RgwGateway | null> {
  const report = await cephJson(["report"]);

  const svcMap = report.servicemap || report.service_map || {};
  const rgwSvc = svcMap.services?.rgw || svcMap["rgw"] || {};
  const daemons = rgwSvc.daemons || rgwSvc["daemons"] || {};

  for (const [id, rawDaemon] of Object.entries(daemons)) {
    if (id === "summary") continue;

    const daemon: any = rawDaemon;
    const meta: any = daemon.metadata || {};

    const hostname = String(meta.hostname ?? "").trim();
    if (!hostname) continue;

    const frontendConfig: string = meta["frontend_config#0"] || "";
    const parsed = parseRgwFrontend(frontendConfig);
    if (!parsed) continue;

    const zonegroup: string = meta.zonegroup || meta["rgw_zonegroup"] || "default";
    const zone: string = meta.zone || meta["rgw_zone"] || zonegroup || "default";

    const isDefault: boolean =
      !!meta["rgw_zone_default"] ||
      !!meta["rgw_zonegroup_default"] ||
      (zonegroup === "default" && zone === "default");

    let host = parsed.host;
    const port = parsed.port;

    if (!host) {
      const ip = await resolveIpv4ViaGetent(hostname);
      if (!ip) continue;
      host = ip;
    }

    const endpoint = `http://${host}:${port}`;
    const ok = await httpProbeViaCurl(endpoint, 1);
    if (!ok) continue;

    return { id, hostname, zonegroup, zone, endpoint, isDefault };
  }

  return null;
}

export async function listRgwGateways(): Promise<RgwGateway[]> {
  const gw = await firstWorkingRgwGateway();
  return gw ? [gw] : [];
}

async function cephJson(subArgs: string[]): Promise<any> {
  const cmd = new Command(["ceph", ...subArgs, "--format", "json"], {
    superuser: "try",
  });

  try {
    const proc = await unwrap(server.execute(cmd));
    const stdout =
      typeof (proc as any).getStdout === "function"
        ? (proc as any).getStdout()
        : ((proc as any).stdout ?? "").toString();

    const text = (stdout ?? "").toString().trim();


    if (!text) return {};
    return JSON.parse(text);
  } catch (state: any) {
    throw new Error(errorString(state));
  }
}
export async function listRgwUsers(): Promise<RgwUser[]> {
  const uids: string[] = await rgwJson(["user", "list"]);

  const CONCURRENCY = 5;
  const users: RgwUser[] = [];
  let index = 0;

  const toNumberOrNull = (v: any): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const clampPercent = (n: number): number => {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  };

  const computePercentOrNull = (used: number | null, max: number | null): number | null => {
    if (used == null || max == null) return null;
    if (max <= 0) return null; // unlimited / not set
    return clampPercent((used / max) * 100);
  };

  const computeRemainingOrNull = (used: number | null, max: number | null): number | null => {
    if (used == null || max == null) return null;
    if (max <= 0) return null; // unlimited / not set
    return Math.max(max - used, 0);
  };

  // Prefer *_actual fields first so “used/free” matches quota enforcement.
  const extractUsageFromUserStats = (
    stats: any
  ): { usedSizeKb: number | null; usedObjects: number | null } => {
    const candidates = [
      stats,
      stats?.stats,
      stats?.usage,
      stats?.summary,
      stats?.user_stats,
    ].filter(Boolean);

    let usedBytes: number | null = null;
    let usedKb: number | null = null;
    let usedObjects: number | null = null;

    for (const s of candidates) {
      if (usedBytes == null) {
        usedBytes =
          toNumberOrNull(s?.size_actual) ??
          toNumberOrNull(s?.total_bytes_actual) ??
          toNumberOrNull(s?.total_size_actual) ??
          null;
      }

      if (usedKb == null) {
        usedKb =
          toNumberOrNull(s?.size_kb_actual) ??
          toNumberOrNull(s?.total_kb_actual) ??
          toNumberOrNull(s?.total_size_kb_actual) ??
          null;
      }

      // Fallbacks if *_actual isn’t present
      if (usedBytes == null) {
        usedBytes =
          toNumberOrNull(s?.total_bytes) ??
          toNumberOrNull(s?.total_size) ??
          toNumberOrNull(s?.size) ??
          null;
      }

      if (usedKb == null) {
        usedKb =
          toNumberOrNull(s?.total_kb) ??
          toNumberOrNull(s?.total_size_kb) ??
          toNumberOrNull(s?.size_kb) ??
          null;
      }

      if (usedObjects == null) {
        usedObjects =
          toNumberOrNull(s?.num_objects) ??
          toNumberOrNull(s?.total_objects) ??
          toNumberOrNull(s?.objects) ??
          null;
      }
    }

    const usedSizeKb =
      usedKb != null ? usedKb : usedBytes != null ? Math.floor(usedBytes / 1024) : null;

    return { usedSizeKb, usedObjects };
  };

  async function worker() {
    while (index < uids.length) {
      const fullUid = uids[index++];
      const { tenant, uid } = splitTenantFromUid(fullUid!);

      try {
        // 1) user info
        const infoArgs = ["user", "info", "--uid", uid];
        if (tenant) infoArgs.push("--tenant", tenant);
        const info = await rgwJson(infoArgs);

        const userQuota = info.user_quota || {};
        const quotaMaxSizeKb =
          typeof userQuota.max_size_kb === "number" ? userQuota.max_size_kb : null;
        const quotaMaxObjects =
          typeof userQuota.max_objects === "number" ? userQuota.max_objects : null;

        // 2) user stats 
        const statsArgs = ["user", "stats", "--uid", uid];
        if (tenant) statsArgs.push("--tenant", tenant);
        const stats = await rgwJson(statsArgs);

        const { usedSizeKb, usedObjects } = extractUsageFromUserStats(stats);

        const quotaRemainingSizeKb = computeRemainingOrNull(usedSizeKb, quotaMaxSizeKb);
        const quotaRemainingObjects = computeRemainingOrNull(usedObjects, quotaMaxObjects);
        users.push({
          uid,
          tenant,
          displayName: info.display_name || info.displayName,
          email: info.email ?? undefined,
          suspended: !!info.suspended,
          maxBuckets: typeof info.max_buckets === "number" ? info.max_buckets : undefined,

          // Limits
          quotaMaxSizeKb,
          quotaMaxObjects,

          // Current usage
          quotaUsedSizeKb: usedSizeKb,
          quotaUsedObjects: usedObjects,

          // Convenience (computed)
          quotaRemainingSizeKb,
          quotaRemainingObjects,
          quotaUsedSizePercent: computePercentOrNull(usedSizeKb, quotaMaxSizeKb),
          quotaUsedObjectsPercent: computePercentOrNull(usedObjects, quotaMaxObjects),
        } satisfies RgwUser);
      } catch (e) {
        users.push({ uid, tenant } as RgwUser);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, uids.length) }, () => worker()));

  // Keep original list order
  const key = (u: RgwUser) => (u.tenant ? `${u.tenant}$${u.uid}` : u.uid);
  users.sort((a, b) => uids.indexOf(key(a)) - uids.indexOf(key(b)));

  return users;
}

export async function listRGWUserNames(): Promise<string[]> {
  const users: string[] = await rgwJson(["user", "list"]);
  return users;
}


async function getRgwUserS3Creds(uid: string): Promise<RgwS3Creds> {
  const key = (uid || "").trim();
  if (!key) throw new Error("getRgwUserS3Creds: uid is required");

  const cached = cachedRgwCredsByUid.get(key);
  if (cached) return cached;

  const info = await rgwJson(["user", "info", "--uid", key]);

  const keys = (info as any).keys || (info as any).s3_keys || [];
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error(`No S3 keys found for RGW user: ${key}`);
  }

  const first = keys[0];

  const accessKey = (first as any).access_key || (first as any).accessKey;
  const secretKey = (first as any).secret_key || (first as any).secretKey;

  if (!accessKey || !secretKey) {
    throw new Error(`RGW user ${key} S3 keys are missing access/secret key fields`);
  }

  const creds: RgwS3Creds = { accessKey, secretKey };
  cachedRgwCredsByUid.set(key, creds);
  return creds;
}

// Backwards-compatible wrappers (optional, keep call sites unchanged if you want)
async function getDashboardS3Creds(): Promise<RgwS3Creds> {
  return getRgwUserS3Creds("ceph-dashboard");
}

async function getHoustonUiS3Creds(): Promise<RgwS3Creds> {
  return getRgwUserS3Creds("houstonUi");
}

function shQuote(s: string): string {
  // Safe for bash: wraps in single quotes and escapes any embedded single quotes
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

export async function changeRgwBucketOwner(
  bucketName: string,
  newOwnerFromList: string // "uid" or "tenant$uid"
): Promise<void> {
  const rawBucketName = (bucketName || "").trim();
  if (!rawBucketName) throw new Error("changeRgwBucketOwner: bucketName is required");

  // 1) bucket context
  const stats = await rgwJson(["bucket", "stats", "--bucket", rawBucketName]);

  const bucketId: string | undefined = stats.id || stats.bucket_id || stats.bucket?.id;
  const sourceTenant: string = String(stats.tenant ?? "").trim(); // "" means non-tenant bucket

  // 2) new owner context ("uid" or "tenant$uid")
  const { tenant: targetTenant, uid: targetUid } = splitTenantFromUid(newOwnerFromList);

  const targetUserId = newOwnerFromList

  // 3) LINK (docs-style)
  // - non-tenant bucket -> tenanted user: use /BUCKET
  // - otherwise: use BUCKET (or tenant/bucket if the bucket is already tenanted)
  const linkBucketRef =
    !sourceTenant && !!targetTenant
      ? `/${rawBucketName}`
      : sourceTenant
        ? `${rawBucketName}`
        : rawBucketName;

  const linkArgs = ["bucket", "link", "--bucket", linkBucketRef,  "--uid", targetUserId,];
  if (bucketId) linkArgs.push("--bucket-id", bucketId);

  await rgwJson(linkArgs);

  // 4) CHOWN (docs-style)
  // - if target is tenanted: tenant/bucket
  // - else: bucket
  const cleanBucketName = rawBucketName.replace(/^\/+/, ""); // if link used "/bucket"
  const bucketPart = cleanBucketName.includes("/") ? cleanBucketName.split("/").slice(1).join("/") : cleanBucketName;
  
  let chownBucketRef: string;
  if (targetUserId.includes("$")) {
    // tenant user -> tenant/bucket
    const { tenant } = splitTenantFromUid(targetUserId);
    chownBucketRef = tenant ? `${tenant}/${bucketPart}` : bucketPart;
  } else {
    // non-tenant user -> bucket
    chownBucketRef = bucketPart;
  }
  
  
  const chownArgs = ["bucket", "chown", "--bucket", chownBucketRef, "--uid", targetUserId];
  if (bucketId) chownArgs.push("--bucket-id", bucketId);
  
  await rgwJson(chownArgs);
}
export async function createCephBucketViaS3(params: {
  bucketName: string;
  endpoint: string;
  tenant?: string;
  tags?: Record<string, string>;
  encryptionMode?: "none" | "sse-s3" | "kms";
  kmsKeyId?: string;
  bucketPolicy?: string | null;
  aclRules?: CephAclRule[];
  objectLockEnabled?: boolean;
  objectLockMode?: "GOVERNANCE" | "COMPLIANCE";
  objectLockRetentionDays?: number;
  owner?: string;
  placementTarget?: string;
}): Promise<void> {
  const log = (...a: any[]) => console.log("[createCephBucketViaS3]", ...a);

  const endpointUrl = params.endpoint.startsWith("http")
    ? params.endpoint
    : `http://${params.endpoint}`;

  const houstonCreds = await getRgwUserS3Creds("houstonUi");

  const ownerTenant =
    params.owner && params.owner.includes("$") ? params.owner.split("$", 1)[0] : undefined;
  const effectiveTenant = (params.tenant ?? ownerTenant ?? "").trim();

  const bucketForCreate = effectiveTenant
    ? `${effectiveTenant}:${params.bucketName}`
    : params.bucketName;

  // 1) Create bucket using python helper
  await cephCreateBucket(endpointUrl, houstonCreds, params.bucketName, {
    objectLockEnabled: params.objectLockEnabled,
  });

  // 2) Chown to final owner
  if (params.owner?.trim()) {
    const owner = params.owner.trim();
    log("changeRgwBucketOwner", { owner });
    await changeRgwBucketOwner(params.bucketName, owner);
  }

  // 3) Apply all other settings through update
  const bucketNameForUpdate = effectiveTenant
    ? `${effectiveTenant}/${params.bucketName}`
    : params.bucketName;

  await updateCephBucketViaS3({
    bucketName: bucketNameForUpdate,
    endpoint: params.endpoint,
    tags: params.tags ?? undefined,
    encryptionMode: params.encryptionMode,
    kmsKeyId: params.kmsKeyId,
    bucketPolicy: params.bucketPolicy,
    aclRules: params.aclRules,
    objectLockMode: params.objectLockMode,
    objectLockRetentionDays: params.objectLockRetentionDays,
    owner: undefined,
  });

  log("done");
}


async function runRgwAdmin(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const cmd = new Command(["radosgw-admin", ...args], { superuser: "try" });

  try {
    const proc = await unwrap(server.execute(cmd));

    const stdout =
      typeof (proc as any).getStdout === "function"
        ? (proc as any).getStdout()
        : ((proc as any).stdout ?? "").toString();

    const stderr =
      typeof (proc as any).getStderr === "function"
        ? (proc as any).getStderr()
        : ((proc as any).stderr ?? "").toString();

    return { stdout, stderr };
  } catch (state: any) {
    throw new Error(errorString(state));
  }
}

/**
 * 1) user create
 */
async function rgwUserCreateBase(opts: CreateRgwUserOptions): Promise<CreatedRgwUserKeys> {
  const {uid,tenant,displayName,email,maxBuckets,systemUser,autoGenerateKey,accessKey,secretKey,suspended,
  } = opts;

  if (!uid) throw new Error("rgwUserCreateBase: uid is required");
  if (!displayName) throw new Error("rgwUserCreateBase: displayName is required");

  if (!autoGenerateKey && (!accessKey || !secretKey)) {
    throw new Error(
      "rgwUserCreateBase: either enable autoGenerateKey or provide accessKey + secretKey"
    );
  }

  const args: string[] = ["user", "create", `--uid=${uid}`, `--display-name=${displayName}`];

  if (tenant) {
    args.push(`--tenant=${tenant}`);
  }
  if (email) {
    args.push(`--email=${email}`);
  }
  if (typeof maxBuckets === "number") {
    args.push(`--max-buckets=${maxBuckets}`);
  }
  if (systemUser) {
    args.push("--system");
  }

  if (autoGenerateKey) {
    args.push("--gen-access-key", "--gen-secret");
  } else {
    args.push(`--access-key=${accessKey}`, `--secret=${secretKey}`);
  }

  const { stdout } = await runRgwAdmin(args);

  // Handle suspended/enable right after create
  if (typeof suspended === "boolean") {
    const suspendArgs: string[] = ["user", suspended ? "suspend" : "enable", `--uid=${uid}`];
    if (tenant) {
      suspendArgs.push(`--tenant=${tenant}`);
    }
    await runRgwAdmin(suspendArgs);
  }

  let generatedAccessKey: string | undefined;
  let generatedSecretKey: string | undefined;

  if (stdout) {
    try {
      const json = JSON.parse(stdout);
      const keys = json.keys?.[0];
      if (keys) {
        generatedAccessKey = keys.access_key;
        generatedSecretKey = keys.secret_key;
      }
    } catch (e) {
    }
  }

  return {
    accessKey: autoGenerateKey ? generatedAccessKey : accessKey,
    secretKey: autoGenerateKey ? generatedSecretKey : secretKey,
  };
}

/**
 * 2) user-level quota (quota-scope=user)
 */
async function rgwSetUserQuota(opts: {uid: string;tenant?: string;enabled: boolean;maxSizeKb?: number;maxObjects?: number;
}): Promise<void> {
  const { uid, tenant, enabled, maxSizeKb, maxObjects } = opts;
  if (!uid) throw new Error("rgwSetUserQuota: uid is required");
  if (!enabled) return;

  const setArgs: string[] = ["quota", "set", `--uid=${uid}`, "--quota-scope=user"];
  if (tenant) setArgs.push(`--tenant=${tenant}`);

  if (typeof maxSizeKb === "number") {
    setArgs.push("--max-size", `${maxSizeKb}K`);
  }

  if (typeof maxObjects === "number") {
    setArgs.push("--max-objects", String(maxObjects));
  }

  await runRgwAdmin(setArgs);

  const enableArgs: string[] = ["quota", "enable", `--uid=${uid}`, "--quota-scope=user"];
  if (tenant) enableArgs.push(`--tenant=${tenant}`);

  await runRgwAdmin(enableArgs);
}

async function rgwSetBucketQuota(opts: {uid: string;tenant?: string;enabled: boolean;maxSizeKb?: number;maxObjects?: number;
}): Promise<void> {
  const { uid, tenant, enabled, maxSizeKb, maxObjects } = opts;
  if (!uid) throw new Error("rgwSetBucketQuota: uid is required");
  if (!enabled) return;

  const setArgs: string[] = ["quota", "set", `--uid=${uid}`, "--quota-scope=bucket"];
  if (tenant) setArgs.push(`--tenant=${tenant}`);

  if (typeof maxSizeKb === "number") {
    setArgs.push("--max-size", `${maxSizeKb}K`);
  }

  if (typeof maxObjects === "number") {
    setArgs.push("--max-objects", String(maxObjects));
  }

  await runRgwAdmin(setArgs);

  const enableArgs: string[] = ["quota", "enable", `--uid=${uid}`, "--quota-scope=bucket"];
  if (tenant) enableArgs.push(`--tenant=${tenant}`);

  await runRgwAdmin(enableArgs);
}

export async function createRgwUser(opts: CreateRgwUserOptions): Promise<CreatedRgwUserKeys> {
  const {uid,tenant,userQuotaEnabled,userQuotaMaxSizeKb,userQuotaMaxObjects,bucketQuotaEnabled,bucketQuotaMaxSizeKb,bucketQuotaMaxObjects,
  } = opts;

  const keys = await rgwUserCreateBase(opts);

  await rgwSetUserQuota({uid,tenant,enabled: !!userQuotaEnabled,maxSizeKb: userQuotaMaxSizeKb,maxObjects: userQuotaMaxObjects,
  });

  await rgwSetBucketQuota({uid,tenant,enabled: !!bucketQuotaEnabled,maxSizeKb: bucketQuotaMaxSizeKb,maxObjects: bucketQuotaMaxObjects,
  });

  return keys;
}

export async function deleteRgwUser(
  uid: string,
  opts?: { tenant?: string; purgeData?: boolean; purgeKeys?: boolean }
): Promise<void> {
  if (!uid) {
    throw new Error("deleteRgwUser: uid is required");
  }

  const args: string[] = ["user", "rm", `--uid=${uid}`];

  if (opts?.tenant) {
    args.push(`--tenant=${opts.tenant}`);
  }
  if (opts?.purgeData) {
    args.push("--purge-data");
  }
  if (opts?.purgeKeys) {
    args.push("--purge-keys");
  }

  await runRgwAdmin(args);
}

export async function updateRgwUser(opts: CreateRgwUserOptions): Promise<void> {
  const {uid,tenant,displayName,email,maxBuckets,systemUser,suspended,userQuotaEnabled,userQuotaMaxSizeKb,userQuotaMaxObjects,bucketQuotaEnabled,bucketQuotaMaxSizeKb,bucketQuotaMaxObjects,autoGenerateKey,accessKey,secretKey,
  } = opts;

  if (!uid) {
    throw new Error("updateRgwUser: uid is required");
  }

  const args: string[] = ["user", "modify", `--uid=${uid}`];
  if (tenant) {
    args.push(`--tenant=${tenant}`);
  }

  if (displayName) {
    args.push(`--display-name=${displayName}`);
  }
  if (email) {
    args.push(`--email=${email}`);
  }
  if (typeof maxBuckets === "number") {
    args.push(`--max-buckets=${maxBuckets}`);
  }
  if (systemUser) {
    args.push("--system");
  }

  if (typeof autoGenerateKey === "boolean") {
    if (autoGenerateKey) {
      args.push("--gen-access-key", "--gen-secret");
    } else if (accessKey && secretKey) {
      args.push(`--access-key=${accessKey}`, `--secret=${secretKey}`);
    }
  } else if (accessKey && secretKey) {
    args.push(`--access-key=${accessKey}`, `--secret=${secretKey}`);
  }

  await runRgwAdmin(args);

  if (typeof suspended === "boolean") {
    const suspendArgs: string[] = ["user", suspended ? "suspend" : "enable", `--uid=${uid}`];
    if (tenant) {
      suspendArgs.push(`--tenant=${tenant}`);
    }
    await runRgwAdmin(suspendArgs);
  }

  await rgwSetUserQuota({uid,tenant,enabled: !!userQuotaEnabled,maxSizeKb: userQuotaMaxSizeKb,maxObjects: userQuotaMaxObjects,
  });

  await rgwSetBucketQuota({uid,tenant,enabled: !!bucketQuotaEnabled,maxSizeKb: bucketQuotaMaxSizeKb,maxObjects: bucketQuotaMaxObjects,
  });
}
export async function getRgwUserInfo(uid: string, tenant?: string): Promise<RgwUserDetails> {
  if (!uid) throw new Error("getRgwUserInfo: uid is required");

  const fullUid = tenant ? `${tenant}$${uid}` : uid;

  // Fetch only what the table doesn't already have (keys/caps + bucket quota).
  // Do NOT call "user stats" or recompute usage/percent here, because listRgwUsers
  // already provides quotaMax/used/remaining/percent and we want the modal to match the table.
  const info = await rgwJson(["user", "info", `--uid=${fullUid}`]);

  const keysRaw = info.keys || info.s3_keys || [];
  const capsRaw = info.caps || [];

  const keys: RgwUserKey[] = Array.isArray(keysRaw)
    ? keysRaw.map((k: any) => ({
        accessKey: k.access_key || k.accessKey,
        secretKey: k.secret_key || k.secretKey,
        user: k.user,
      }))
    : [];

  const caps: RgwUserCap[] = Array.isArray(capsRaw)
    ? capsRaw.map((c: any) => ({
        type: c.type,
        perm: c.perm,
      }))
    : [];

  const fullUserId = info.user_id || info.uid || fullUid;
  const { tenant: decodedTenant, uid: shortUid } = splitTenantFromUid(fullUserId);

  const bucketQuota = info.bucket_quota || {};

  const bucketQuotaMaxSizeKb =
    typeof bucketQuota.max_size_kb === "number"
      ? bucketQuota.max_size_kb
      : typeof bucketQuota.max_size === "number"
        ? Math.floor(bucketQuota.max_size / 1024)
        : null;

  const bucketQuotaMaxObjects =
    typeof bucketQuota.max_objects === "number" ? bucketQuota.max_objects : null;

  const details: RgwUserDetails = {
    uid: shortUid,
    tenant: decodedTenant,

    displayName: info.display_name || info.displayName,
    email: info.email ?? null,
    suspended: !!info.suspended,
    maxBuckets: typeof info.max_buckets === "number" ? info.max_buckets : null,

    bucketQuotaMaxSizeKb,
    bucketQuotaMaxObjects,

    keys,
    caps,
  };

  return details;
}

function splitTenantFromUid(fullUid: string): { tenant?: string; uid: string } {
  const idx = fullUid.indexOf("$");

  if (idx === -1) {
    return { uid: fullUid };
  }
  return {
    tenant: fullUid.slice(0, idx),
    uid: fullUid,
  };
}


export async function getCephS3Connection(): Promise<CephS3Connection> {
  if (cachedCephS3Conn) return cachedCephS3Conn;

  // 1) Optional env overrides
  const envEndpoint = process.env.CEPH_S3_ENDPOINT;

  if (envEndpoint) {
    const endpointUrl = envEndpoint.startsWith("http") ? envEndpoint : `http://${envEndpoint}`;

    cachedCephS3Conn = {
      endpointUrl,
    };
    return cachedCephS3Conn;
  }

  // 2) Derive from RGW servicemap
  const gateways = await listRgwGateways();
  const gw = gateways.find((g) => g.isDefault) || gateways[0];

  if (!gw) {
    throw new Error("No RGW gateways found to derive Ceph S3 endpoint");
  }

  const endpointUrl = gw.endpoint.startsWith("http") ? gw.endpoint : `http://${gw.endpoint}`;

  cachedCephS3Conn = { endpointUrl };
  return cachedCephS3Conn;
}

function mapCephVersioning(stats: any): BucketVersioningStatus {
  // Ceph exposes several hints; map them into S3-style states
  if (stats.versioning === "enabled" || stats.versioning_enabled) {
    return "Enabled";
  }
  if (stats.versioning === "suspended") {
    return "Suspended";
  }
  return "Disabled";
}

export async function getCephBucketFromStats(adminRefOrName: string): Promise<CephBucket> {
  const rgwBucket = String(adminRefOrName ?? "").trim();
  if (!rgwBucket) throw new Error("getCephBucketFromStats: bucket name is required");

  // rgw-admin expects tenant:bucket (not tenant/bucket). Your hydrate uses replace("/",":") too.

  const stats: any = await rgwJson(["bucket", "stats", "--bucket", rgwBucket]);
  return buildS3BucketFromRgwStats(stats);
}


export function buildS3BucketFromRgwStats(stats: any): CephBucket {
  // usage
  const usage = stats.usage || {};
  const usageKey = "rgw.main" in usage ? "rgw.main" : Object.keys(usage)[0];
  const usageMain = usageKey ? usage[usageKey] || {} : {};

  const sizeBytes: number = usageMain.size ?? 0;
  const objectCount: number = usageMain.num_objects ?? 0;
  const versionCount: number | undefined = usageMain.num_object_versions;

  // tags from tagset
  const tags = stats.tagset && Object.keys(stats.tagset).length ? { ...stats.tagset } : undefined;

  // versioning + object lock
  const versioning = mapCephVersioning(stats);
  const objectLockEnabled = !!stats.object_lock_enabled;

  // optional: quota, zone, zonegroup, etc.
  const quotaBytes =
    stats.bucket_quota &&
    typeof stats.bucket_quota.max_size_kb === "number" &&
    stats.bucket_quota.max_size_kb > 0
      ? stats.bucket_quota.max_size_kb * 1024
      : undefined;
    let adminRef = ""
    if(stats.tenant){
      adminRef = stats.tenant + "/" + stats.bucket 
    }else{
      adminRef =  stats.bucket 
    }
   
  return {backendKind: "ceph",name: stats.bucket,owner: stats.owner,createdAt: stats.creation_time,lastModifiedTime: stats.mtime,sizeBytes,
    objectCount,versionCount,quotaBytes,objectLockEnabled,versioning,tags,zone: stats.zone,zonegroup: stats.zonegroup, adminRef: adminRef
  };
}

function deriveCannedAclFromRules(
  rules?: CephAclRule[],
): "private" | "public-read" | "public-read-write" | "authenticated-read" | null {
  if (!rules || rules.length === 0) return null;

  const all = rules.find((r) => r.grantee === "all-users");
  if (all) {
    if (all.permission === "READ") return "public-read";
    if (all.permission === "READ_WRITE" || all.permission === "FULL_CONTROL") return "public-read-write";
  }

  const auth = rules.find((r) => r.grantee === "authenticated-users");
  if (auth) {
    // canned ACL only supports authenticated-read
    return "authenticated-read";
  }

  // owner rule (or anything else)
  return "private";
}

export async function getBucketDashboardStats(
  opts: BucketDashboardOptions
): Promise<{ stats: BucketDashboardStats; perUser: BucketUserUsage[] }> {
  const { bucket, uid, startDate, endDate, showLog } = opts;

  if (!bucket) {
    throw new Error("getBucketDashboardStats: bucket is required");
  }
  const normalizeDate = (value: string, kind: "start" | "end") => {
    if (!value) return value;

    // Already a full timestamp, don't touch it
    if (value.includes("T")) {
      return value;
    }

    // Date-only
    if (kind === "start") {
      return `${value}T00:00:00`;
    }

    // kind === "end": move to next day (exclusive bound)
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      // If parsing fails for some reason, just pass raw value through
      return value;
    }
    d.setUTCDate(d.getUTCDate() + 1);
    // Ceph expects naive ISO without timezone; keep just YYYY-MM-DD
    return d.toISOString().slice(0, 10);
  };

  const args: string[] = ["usage", "show"];

  args.push("--bucket", bucket);

  if (uid) {
    args.push("--uid", uid);
  }

  if (startDate) {
    args.push("--start-date", normalizeDate(startDate, "start"));
  }

  if (endDate) {
    args.push("--end-date", normalizeDate(endDate, "end"));
  }

  // For per-bucket stats we need bucket-level entries
  if (showLog) {
    args.push("--show-log-entries");
  }

  const raw = await rgwJson(args);

  const entries: any[] = Array.isArray(raw.entries) ? raw.entries : [];

  const perUser: BucketUserUsage[] = [];

  for (const userEntry of entries) {
    const userId = userEntry.user || userEntry.owner || "";

    const buckets: any[] = Array.isArray(userEntry.buckets) ? userEntry.buckets : [];

    for (const b of buckets) {
      if (b.bucket !== bucket) continue;

      const categories: any[] = Array.isArray(b.categories) ? b.categories : [];

      const totals = categories.reduce(
        (acc, cat) => {
          acc.bytesSent += cat.bytes_sent ?? 0;
          acc.bytesReceived += cat.bytes_received ?? 0;
          acc.ops += cat.ops ?? 0;
          acc.successfulOps += cat.successful_ops ?? 0;
          return acc;
        },
        { bytesSent: 0, bytesReceived: 0, ops: 0, successfulOps: 0 }
      );

      perUser.push({
        bucket: b.bucket,
        owner: b.owner || userId,
        bytesSent: totals.bytesSent,
        bytesReceived: totals.bytesReceived,
        ops: totals.ops,
        successfulOps: totals.successfulOps,
      });
    }
  }

  const aggregate = perUser.reduce(
    (acc, u) => {
      acc.bytesSent += u.bytesSent;
      acc.bytesReceived += u.bytesReceived;
      acc.ops += u.ops;
      acc.successfulOps += u.successfulOps;
      return acc;
    },
    { bytesSent: 0, bytesReceived: 0, ops: 0, successfulOps: 0 }
  );

  const stats: BucketDashboardStats = {
    bucket,
    totalBytesSent: aggregate.bytesSent,
    totalBytesReceived: aggregate.bytesReceived,
    totalOps: aggregate.ops,
    totalSuccessfulOps: aggregate.successfulOps,
    raw,
  };

  return { stats, perUser };
}
export async function getCephBucketSecurity(
  bucketName: string
): Promise<{ acl?: CephAclRule[]; policy?: string }> {
  const { endpointUrl } = await getCephS3Connection();
  const { accessKey, secretKey } = await getDashboardS3Creds();

  const creds: CephCreds = { accessKeyId: accessKey, secretAccessKey: secretKey };

  const [aclJson, policyStr] = await Promise.all([
    cephGetBucketAcl(endpointUrl, creds, bucketName),
    cephGetBucketPolicy(endpointUrl, creds, bucketName),
  ]);

  type RawAclPermission = "READ" | "WRITE" | "FULL_CONTROL" | string;

  function collapsePerms(perms: Set<RawAclPermission>): CephAclPermission {
    if (perms.has("FULL_CONTROL")) return "FULL_CONTROL";
    const hasRead = perms.has("READ");
    const hasWrite = perms.has("WRITE");

    // If WRITE exists, treat it as "Read and write"
    if (hasRead && hasWrite) return "READ_WRITE";
    if (hasWrite) return "READ_WRITE";
    return "READ";
  }

  function pickUiRuleFromAclJson(input: any): CephAclRule | undefined {
    if (!input || !Array.isArray(input.Grants)) return;

    const permsByGrantee: Record<CephAclRule["grantee"], Set<RawAclPermission>> = {
      "all-users": new Set(),
      "authenticated-users": new Set(),
      owner: new Set(),
    };

    for (const g of input.Grants as any[]) {
      if (!g?.Grantee || !g?.Permission) continue;

      const perm = g.Permission as RawAclPermission;
      const gr = g.Grantee;

      if (gr.Type === "Group" && typeof gr.URI === "string") {
        if (gr.URI.endsWith("/AllUsers")) permsByGrantee["all-users"].add(perm);
        else if (gr.URI.endsWith("/AuthenticatedUsers")) {
          permsByGrantee["authenticated-users"].add(perm);
        }
      } else if (gr.Type === "CanonicalUser") {
        permsByGrantee.owner.add(perm);
      }
    }

    // Prefer Everyone, else Authenticated users, else Owner
    if (permsByGrantee["all-users"].size) {
      return {
        grantee: "all-users",
        permission: collapsePerms(permsByGrantee["all-users"]),
      };
    }
    if (permsByGrantee["authenticated-users"].size) {
      return {
        grantee: "authenticated-users",
        permission: collapsePerms(permsByGrantee["authenticated-users"]),
      };
    }
    if (permsByGrantee.owner.size) {
      return { grantee: "owner", permission: "FULL_CONTROL" };
    }

    return;
  }

  // Collapsed ACL for the UI (single rule)
  let acl: CephAclRule[] | undefined;
  const uiRule = pickUiRuleFromAclJson(aclJson);
  if (uiRule) acl = [uiRule];

  // Pretty-print policy
  let policy: string | undefined;
  if (policyStr) {
    try {
      policy = JSON.stringify(JSON.parse(policyStr), null, 2);
    } catch {
      policy = policyStr;
    }
  }

  return { acl, policy };
}

export async function isRgwUsageLogEnabled(): Promise<boolean | null> {
  return rgwLimit(async () => {
    const cmd = new Command(["ceph", "config", "get", "client.rgw", "rgw_enable_usage_log"], {
      superuser: "try",
    });

    try {
      const proc = await unwrap(server.execute(cmd));
      const stdout =
        typeof (proc as any).getStdout === "function"
          ? (proc as any).getStdout()
          : ((proc as any).stdout ?? "").toString();

      const text = (stdout ?? "").toString().trim().toLowerCase();

      if (text === "true") return true;
      if (text === "false") return false;
      return null;
    } catch (state: any) {
      return null;
    }
  });
}

async function rgwUserExists(uid: string, tenant?: string): Promise<boolean> {
  const args = ["user", "info", "--uid", uid];
  if (tenant) args.push("--tenant", tenant);

  try {
    await rgwJson(args);
    return true;
  } catch {
    return false;
  }
}
async function ensureRgwUserExists(opts: {uid: string;tenant?: string;displayName: string;systemUser?: boolean;maxBuckets?: number;suspended?: boolean;
}): Promise<void> {
  const exists = await rgwUserExists(opts.uid, opts.tenant);
  if (exists) return;

  // Create user and auto-generate keys
  await createRgwUser({
    uid: opts.uid,
    tenant: opts.tenant,
    displayName: opts.displayName,
    maxBuckets: opts.maxBuckets,
    systemUser: opts.systemUser ?? true,
    autoGenerateKey: true,
    suspended: opts.suspended ?? false,

    // quotas off by default
    userQuotaEnabled: false,
    bucketQuotaEnabled: false,
  });
}



export type CephCreds = { accessKeyId: string; secretAccessKey: string };



async function execPython(
  pythonSource: string,
  env: Record<string, string>,
): Promise<string> {
  const exports = Object.entries(env)
    .map(([k, v]) => `export ${k}=${shQuote(v)}`)
    .join("; ");

  const cmdLine = `${exports}; python3 - <<'PY'\n${pythonSource}\nPY`;
  const cmd = new Command(["bash", "-lc", cmdLine],{ superuser: "try" });

  try {
    const proc = await unwrap(server.execute(cmd));
    const stdout =
      typeof (proc as any).getStdout === "function"
        ? (proc as any).getStdout()
        : ((proc as any).stdout ?? "").toString();

    return (stdout ?? "").toString().trim();
  } catch (state: any) {
    throw new Error(errorString(state));
  }
}

/**
 * Botocore setup:
 * - path-style addressing
 * - SigV4
 * - disable bucket name validation to allow tenant:bucket
 *
 * IMPORTANT: do not require RGW_OP here (create/versioning/etc. won't provide it).
 */
const PY_SETUP = `
import os, json
import botocore.session
from botocore.config import Config
import botocore.handlers

endpoint = os.environ["RGW_ENDPOINT"]
bucket = os.environ["RGW_BUCKET"]

sess = botocore.session.get_session()
client = sess.create_client(
  "s3",
  endpoint_url=endpoint,
  aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
  aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
  config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
)

# Disable bucket name validation (allows tenant:bucket)
emitter = client.meta.events
for ev in ("before-parameter-build.s3", "provide-client-params.s3"):
  try: emitter.unregister(ev, botocore.handlers.validate_bucket_name)
  except Exception: pass
  try: emitter.unregister(ev, "botocore.handlers.validate_bucket_name")
  except Exception: pass
`;



/* -----------------------------
   Policy (tenant-safe)
-------------------------------- */

export async function cephGetBucketPolicy(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
): Promise<string | undefined> {
  const py =
    PY_SETUP +
    `
try:
  resp = client.get_bucket_policy(Bucket=bucket)
  pol = resp.get("Policy")
  if isinstance(pol, str):
    print(pol)
  else:
    print(json.dumps(pol) if pol is not None else "")
except Exception as e:
  msg = str(e)
  if "NoSuchBucketPolicy" in msg or "NoSuchBucket" in msg or "404" in msg:
    print("")
  else:
    raise
`;

  const out = await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });

  return out ? out : undefined;
}

export async function cephPutBucketPolicy(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
  policyJson: string,
): Promise<void> {
  const py =
    PY_SETUP +
    `
policy_text = os.environ["RGW_POLICY_JSON"]
policy = json.loads(policy_text)  # validate JSON
client.put_bucket_policy(Bucket=bucket, Policy=json.dumps(policy))
print("ok")
`;

  await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    RGW_POLICY_JSON: policyJson,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

export async function cephDeleteBucketPolicy(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
): Promise<void> {
  const py =
    PY_SETUP +
    `
try:
  client.delete_bucket_policy(Bucket=bucket)
except Exception as e:
  msg = str(e)
  if "NoSuchBucketPolicy" in msg or "NoSuchBucket" in msg or "404" in msg:
    pass
  else:
    raise
print("ok")
`;

  await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

/* -----------------------------
   Versioning (tenant-safe)
-------------------------------- */

export async function cephPutBucketVersioning(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
  enabled: boolean,
): Promise<void> {
  const py =
    PY_SETUP +
    `
status = "Enabled" if os.environ["RGW_VERSIONING_ENABLED"] == "true" else "Suspended"
client.put_bucket_versioning(
  Bucket=bucket,
  VersioningConfiguration={"Status": status},
)
print("ok")
`;

  await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    RGW_VERSIONING_ENABLED: enabled ? "true" : "false",
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

/* -----------------------------
   Tags (tenant-safe)
-------------------------------- */

export async function cephPutBucketTagging(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
  tags: Record<string, string>,
): Promise<void> {
  const TagSet = Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
  const py =
    PY_SETUP +
    `
tagging = json.loads(os.environ["RGW_TAGGING_JSON"])
client.put_bucket_tagging(Bucket=bucket, Tagging=tagging)
print("ok")
`;

  await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    RGW_TAGGING_JSON: JSON.stringify({ TagSet }),
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

export async function cephDeleteBucketTagging(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
): Promise<void> {
  const py =
    PY_SETUP +
    `
try:
  client.delete_bucket_tagging(Bucket=bucket)
except Exception as e:
  msg = str(e)
  if "NoSuchTagSet" in msg or "NoSuchBucket" in msg or "404" in msg:
    pass
  else:
    raise
print("ok")
`;

  await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

/* -----------------------------
   Encryption (tenant-safe)
-------------------------------- */

export async function cephPutBucketEncryption(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
  encryptionMode: "sse-s3" | "kms",
  kmsKeyId: string | undefined,
): Promise<void> {
  const py =
    PY_SETUP +
    `
mode = os.environ["RGW_ENCRYPTION_MODE"]
kms = os.environ.get("RGW_KMS_KEY_ID", "")
rules = []

if mode == "sse-s3":
  rules.append({"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}})
elif mode == "kms":
  if not kms:
    raise Exception("KMS encryption selected but no kmsKeyId provided")
  rules.append({"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms", "KMSMasterKeyID": kms}})
else:
  raise Exception("Unsupported encryption mode")

client.put_bucket_encryption(
  Bucket=bucket,
  ServerSideEncryptionConfiguration={"Rules": rules},
)
print("ok")
`;

  await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    RGW_ENCRYPTION_MODE: encryptionMode,
    RGW_KMS_KEY_ID: kmsKeyId ?? "",
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

export async function cephDeleteBucketEncryption(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
): Promise<void> {
  const py =
    PY_SETUP +
    `
try:
  client.delete_bucket_encryption(Bucket=bucket)
except Exception as e:
  msg = str(e)
  if "ServerSideEncryptionConfigurationNotFoundError" in msg or "NoSuchBucket" in msg or "404" in msg:
    pass
  else:
    raise
print("ok")
`;

  await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

/* -----------------------------
   ACL (tenant-safe, canned ACL only)
-------------------------------- */

export async function cephPutBucketAclCanned(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
  cannedAcl: "private" | "public-read" | "public-read-write" | "authenticated-read",
): Promise<void> {
  const py =
    PY_SETUP +
    `
acl = os.environ["RGW_CANNED_ACL"]
client.put_bucket_acl(Bucket=bucket, ACL=acl)
print("ok")
`;
  await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    RGW_CANNED_ACL: cannedAcl,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

/* -----------------------------
   Object lock configuration (tenant-safe)
-------------------------------- */

export async function cephPutObjectLockConfiguration(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
  mode: "GOVERNANCE" | "COMPLIANCE",
  days: number,
): Promise<void> {
  const py =
    PY_SETUP +
    `
mode = os.environ["RGW_OBJECT_LOCK_MODE"]
days = int(os.environ["RGW_OBJECT_LOCK_DAYS"])

client.put_object_lock_configuration(
  Bucket=bucket,
  ObjectLockConfiguration={
    "ObjectLockEnabled": "Enabled",
    "Rule": {"DefaultRetention": {"Mode": mode, "Days": days}},
  },
)
print("ok")
`;

  await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    RGW_OBJECT_LOCK_MODE: mode,
    RGW_OBJECT_LOCK_DAYS: String(days),
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });
}

/* -----------------------------
   Create bucket (tenant-safe if bucket contains :)
   Also tolerant of RGW returning JSON on create.
-------------------------------- */

export async function cephCreateBucket(
  endpointUrl: string,
  creds: RgwS3Creds,
  bucket: string,
  opts?: {
    objectLockEnabled?: boolean;
  }
): Promise<void> {
  const py =
    PY_SETUP +
    `
import time
import botocore.handlers

# Disable bucket name validation (allows tenant:bucket)
emitter = client.meta.events
for ev in ("before-parameter-build.s3", "provide-client-params.s3"):
  try: emitter.unregister(ev, botocore.handlers.validate_bucket_name)
  except Exception: pass
  try: emitter.unregister(ev, "botocore.handlers.validate_bucket_name")
  except Exception: pass

def head_ok():
  try:
    client.head_bucket(Bucket=bucket)
    return True
  except Exception:
    return False

params = {"Bucket": bucket}

if os.environ.get("RGW_OBJECT_LOCK_ENABLED") == "true":
  params["ObjectLockEnabledForBucket"] = True

try:
  client.create_bucket(**params)
  print("ok")
except Exception as e:
  msg = str(e)

  if "BucketAlreadyOwnedByYou" in msg or "BucketAlreadyExists" in msg:
    print("ok")
  elif "ResponseParserError" in msg or "invalid XML" in msg or "Unable to parse response" in msg:
    for _ in range(5):
      if head_ok():
        print("ok")
        break
      time.sleep(0.2)
    else:
      raise
  else:
    raise
`;

  await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    RGW_OBJECT_LOCK_ENABLED: opts?.objectLockEnabled ? "true" : "false",
    AWS_ACCESS_KEY_ID: creds.accessKey,
    AWS_SECRET_ACCESS_KEY: creds.secretKey,
  });
}


export async function updateCephBucketViaS3(params: {
  bucketName: string; 
  endpoint: string;

  versioningEnabled?: boolean;
  tags?: Record<string, string> | null;

  encryptionMode?: "none" | "sse-s3" | "kms";
  kmsKeyId?: string;

  bucketPolicy?: string | null;
  aclRules?: CephAclRule[];

  objectLockMode?: "GOVERNANCE" | "COMPLIANCE";
  objectLockRetentionDays?: number;

  owner?: string; // "uid" or "tenant$uid"
}): Promise<void> {
  const endpointUrl = params.endpoint.startsWith("http")
    ? params.endpoint
    : `http://${params.endpoint}`;

  const { accessKey, secretKey } = await getDashboardS3Creds();
  const creds: CephCreds = { accessKeyId: accessKey, secretAccessKey: secretKey };

  // Normalize the incoming bucket into { tenant?, bucket } regardless of delimiter
  const parseBucket = (raw: string): { tenant?: string; bucket: string } => {
    const s = (raw ?? "").trim();
    if (!s) return { bucket: "" };

    // Prefer "tenant/bucket" form
    if (s.includes("/")) {
      const [t, ...rest] = s.split("/");
      return { tenant: t || undefined, bucket: rest.join("/") };
    }

    // Also tolerate "tenant:bucket"
    if (s.includes(":")) {
      const [t, ...rest] = s.split(":");
      return { tenant: t || undefined, bucket: rest.join(":") };
    }

    return { bucket: s };
  };

  const toAwsBucket = (p: { tenant?: string; bucket: string }): string => {
    return p.tenant ? `${p.tenant}:${p.bucket}` : p.bucket;
  };

  // Track current bucket identity for subsequent S3 ops
  let current = parseBucket(params.bucketName);
  if (!current.bucket) throw new Error("bucketName is required");

  // 0) Owner first (admin), and if this moves bucket into a tenant, update the bucket identity
  if (params.owner && params.owner.trim()) {
    const owner = params.owner.trim();

    await changeRgwBucketOwner(current.bucket, owner);

    // If owner is tenanted ("tenant$uid"), the bucket will now live under that tenant.
    // Update the bucket identity we use for the rest of S3 operations.
    if (owner.includes("$")) {
      const newTenant = owner.split("$", 1)[0]!.trim();
      if (newTenant) current = { tenant: newTenant, bucket: current.bucket };
    }
  }

  const bucketNameForAws = toAwsBucket(current);

  // 1) Versioning
  if (typeof params.versioningEnabled === "boolean") {
    await cephPutBucketVersioning(endpointUrl, creds, bucketNameForAws, params.versioningEnabled);
  }

  // 2) Tags
  if (params.tags !== undefined) {
    const tags = params.tags || {};
    if (Object.keys(tags).length > 0) {
      await cephPutBucketTagging(endpointUrl, creds, bucketNameForAws, tags);
    } else {
      await cephDeleteBucketTagging(endpointUrl, creds, bucketNameForAws);
    }
  }

  // 3) Encryption
  if (params.encryptionMode !== undefined) {
    if (params.encryptionMode === "none") {
      await cephDeleteBucketEncryption(endpointUrl, creds, bucketNameForAws);
    } else {
      await cephPutBucketEncryption(
        endpointUrl,
        creds,
        bucketNameForAws,
        params.encryptionMode,
        params.kmsKeyId
      );
    }
  }

  // 4) ACL (canned)
  if (params.aclRules !== undefined) {
    const cannedAcl =
      (params.aclRules && params.aclRules.length > 0
        ? deriveCannedAclFromRules(params.aclRules)
        : "private") ?? "private";

    await cephPutBucketAclCanned(endpointUrl, creds, bucketNameForAws, cannedAcl);
  }

  // 5) Bucket policy
  if (params.bucketPolicy !== undefined) {
    const text = (params.bucketPolicy ?? "").trim();
    if (text) {
      await cephPutBucketPolicy(endpointUrl, creds, bucketNameForAws, text);
    } else {
      await cephDeleteBucketPolicy(endpointUrl, creds, bucketNameForAws);
    }
  }

  // 6) Object lock config
  if (params.objectLockMode && typeof params.objectLockRetentionDays === "number") {
    await cephPutObjectLockConfiguration(
      endpointUrl,
      creds,
      bucketNameForAws,
      params.objectLockMode,
      params.objectLockRetentionDays
    );
  }
}


export async function cephGetBucketAcl(
  endpointUrl: string,
  creds: CephCreds,
  bucket: string,
): Promise<any | undefined> {
  const py =
    PY_SETUP +
    `
try:
  resp = client.get_bucket_acl(Bucket=bucket)
  print(json.dumps(resp))
except Exception as e:
  msg = str(e)
  if "NoSuchBucket" in msg or "404" in msg:
    print("")
  else:
    raise
`;

  const out = await execPython(py, {
    RGW_ENDPOINT: endpointUrl,
    RGW_BUCKET: bucket,
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
  });

  if (!out) return undefined;
  try {

    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

export async function listRgwPlacementTargets(zonegroup?: string): Promise<string[]> {
  const args = ["zonegroup", "placement", "list", "--format", "json"];
  if (zonegroup) args.splice(1, 0, "--rgw-zonegroup", zonegroup);

  const out = await rgwJson(args);
  if (!out) return [];

  // Case 1: this command returns an array of { key, val: { name, ... } }
  if (Array.isArray(out)) {
    return out
      .map((x: any) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") return x.key ?? x.name ?? x.val?.name;
        return "";
      })
      .map((x: any) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }

  // Case 2: other formats might return { placement_targets: [...] }
  const pt = (out as any).placement_targets;
  if (Array.isArray(pt)) {
    if (pt.length && typeof pt[0] === "object" && pt[0]) {
      return pt
        .map((x: any) => x.key ?? x.name ?? x.placement_target ?? x.id)
        .map((x: any) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean);
    }
    return pt.map((x: any) => String(x).trim()).filter(Boolean);
  }

  return [];
}

export async function getRgwZonegroupName(): Promise<string | null> {
  const out = await rgwJson(["zonegroup", "list", "--format", "json"]);
  const zgs = (out as any)?.zonegroups;
  if (Array.isArray(zgs) && zgs.length) return String(zgs[0]);
  return null;
}

export async function getRgwZonegroupApiName(zonegroup?: string): Promise<string | null> {
  const zg = zonegroup ?? (await getRgwZonegroupName());
  if (!zg) return null;

  const out = await rgwJson(["zonegroup", "get", "--rgw-zonegroup", zg, "--format", "json"]);
  const api = (out as any)?.api_name;
  return typeof api === "string" && api.trim() ? api.trim() : null;
}
