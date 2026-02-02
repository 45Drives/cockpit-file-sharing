
import type {MinioBucket,BucketVersioningStatus,MinioUser,MinioUserCreatePayload,MinioUserDetails,MinioUserGroupMembership,MinioUserUpdatePayload,
  MinioBucketDashboardStats,MinioReplicationUsage,MinioGroupInfo,McAliasCandidate,
  MinioServiceAccount,
  MinioServiceAccountCreatePayload,
  MinioServiceAccountUpdatePayload,
} from "../types/types";
import pLimit from "p-limit";


import { legacy, server, Command, unwrap } from "@45drives/houston-common-lib";

const bucketLimit = pLimit(6);
const { errorString } = legacy;

let MINIO_ALIAS = process.env.MINIO_MC_ALIAS || "gw01";

// Expose setter so UI can select alias
export function setMinioAlias(alias: string): void {
  const trimmed = String(alias ?? "").trim();
  if (!trimmed) return;
  MINIO_ALIAS = trimmed;
}

export function getMinioAlias(): string {
  return MINIO_ALIAS;
}

export async function listMinioAliasCandidates(): Promise<McAliasCandidate[]> {
  const rows = await mcJsonLines(["alias", "list"]);

  const candidates: McAliasCandidate[] = [];

  const isTemplateOrPublic = (alias: string, url: string) => {
    const a = alias.toLowerCase();
    const u = url.toLowerCase();
    if (a === "play") return true;
    if (u.includes("play.min.io")) return true;

    if (a === "s3" || u.includes("s3.amazonaws.com")) return true;
    if (a === "gcs" || u.includes("storage.googleapis.com")) return true;

    return false;
  };

  const isPlaceholder = (s: string) => {
    const v = s.trim();
    return !v || v === "ACCESS-KEY-HERE" || v === "SECRET-KEY-HERE";
  };

  for (const r of rows) {
    const alias = String((r as any)?.alias ?? "").trim();
    const url = String((r as any)?.URL ?? (r as any)?.url ?? "").trim();
    const api = String((r as any)?.API ?? (r as any)?.api ?? "").trim();

    const accessKey = String((r as any)?.AccessKey ?? (r as any)?.accessKey ?? "").trim();
    const secretKey = String((r as any)?.SecretKey ?? (r as any)?.secretKey ?? "").trim();

    if (!alias) continue;
    if (!url.startsWith("http")) continue;
    if (isTemplateOrPublic(alias, url)) continue;

    if (api && api.toLowerCase() !== "s3v4") continue;

    // Exclude empty or placeholder creds
    if (isPlaceholder(accessKey) || isPlaceholder(secretKey)) continue;

    candidates.push({ alias });
  }

  const verified: McAliasCandidate[] = [];
  for (const c of candidates) {
    try {
      await mcJsonSingle(["admin", "info", c.alias]);
      verified.push(c);
    } catch {
      // ignore
    }
  }

  return verified;
}

// Availability should not depend on the currently selected MINIO_ALIAS
export async function isMinioAvailable(): Promise<boolean> {
  const cands = await listMinioAliasCandidates();
  return cands.length > 0;
}

export async function isMinioHealthy(): Promise<boolean> {
  try {
    await mcJsonSingle(["admin", "info", MINIO_ALIAS]);
    return true;
  } catch (e) {
    console.warn("MinIO health check failed:", e);
    return false;
  }
}


type RunMcResult = {
  stdout: string;
  stderr: string;
  exitStatus: number;
};
async function runMc(args: string[], allowFailure = false): Promise<RunMcResult> {
  const cmd = new Command(["mc", ...args], { superuser: "try" });

  // Always return ExitedProcess so can read stdout/stderr even on failure
  const proc = await unwrap(server.execute(cmd, false));

  const stdout = proc.getStdout();
  const stderr = proc.getStderr();
  const exitStatus = proc.exitStatus;

  if (exitStatus !== 0 && !allowFailure) {
    const msg = stderr.trim() || stdout.trim() || `mc exited with status ${exitStatus}`;
    const e = new Error(msg) as any;
    e.stdout = stdout;
    e.stderr = stderr;
    e.exitStatus = exitStatus;
    e.cause = proc;
    throw e;
  }

  return { stdout, stderr, exitStatus };
}

function extractAdminCode(obj: any): string | undefined {
  const code = obj?.error?.cause?.error?.Code ;
  return typeof code === "string" && code ? code : undefined;
}


function parseJsonLines(text: string): any[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  return trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function mcJsonLines(subArgs: string[]): Promise<any[]> {
  const { stdout } = await runMc(["--json", ...subArgs]);
  return parseJsonLines(stdout);
}

/**
 * Convenience helper for commands that return exactly one JSON object.
 */
async function mcJsonSingle(subArgs: string[]): Promise<any> {
  const list = await mcJsonLines(subArgs);
  return list[0] ?? {};
}

/**
 * Get bucket-level stats from `mc stat <ALIAS>/<bucket> --json`
 * Uses MinIO’s internal usage metrics.
 */
export async function getMinioBucketStats(bucketName: string): Promise<{
  createdAt?: string;
  region?: string;
  objectCount: number;
  sizeBytes: number;
  versionsCount?: number;
  versioningStatus?: BucketVersioningStatus;
  objectLockEnabled?: boolean;
  tagsFromStat?: Record<string, string>;
}> {
  const stat = await mcJsonSingle(["stat", `${MINIO_ALIAS}/${bucketName}`]);

  const createdAt = stat.time || stat.lastModified || stat.LastModified || stat.Created || undefined;

  const region =
    stat.Location ||
    stat.location ||
    (stat.Properties && (stat.Properties.Location || stat.Properties.location)) ||
    undefined;

  const usage = stat.Usage || stat.usage || {};
  const sizeBytes: number = usage.totalSize ?? usage.size ?? 0;
  const objectCount: number = usage.objectsCount ?? usage.objects ?? 0;
  const versionsCount: number | undefined = usage.versionsCount ?? usage.versions ?? undefined;

  const rawVersioning = stat.Versioning || stat.versioning || {};
  const versioningStatus =
    typeof rawVersioning.status === "string" && rawVersioning.status
      ? (rawVersioning.status as BucketVersioningStatus)
      : undefined;

  const rawObjectLock = stat.ObjectLock || stat.objectLock || {};
  const objectLockEnabled =
    typeof rawObjectLock.enabled === "string" &&
    rawObjectLock.enabled.toLowerCase() === "enabled";

  const tagsFromStat =
    stat.tagging && typeof stat.tagging === "object" ? (stat.tagging as Record<string, string>) : undefined;

  return { createdAt, region, objectCount, sizeBytes, versionsCount, versioningStatus, objectLockEnabled, tagsFromStat };
}


/**
 * Get bucket tags via `mc tag list --json <ALIAS>/<bucket>`.
 */
async function getMinioBucketTags(
  bucketName: string
): Promise<Record<string, string> | undefined> {
  const { stdout, stderr } = await runMc(
    ["--json", "tag", "list", `${MINIO_ALIAS}/${bucketName}`],
     true 
  );

  const text = (stdout || "").trim();
  if (!text) return undefined;

  const lines = parseJsonLines(text);

  // If mc returned an error JSON line, treat "No tags found" as empty.
  for (const obj of lines) {
    if (obj?.status === "error") {
      const msg = String(obj?.error?.message ?? "").toLowerCase();
      if (msg.includes("no tags found")) return undefined;

      // real error
      throw new Error(obj?.error?.message ?? "mc tag list failed");
    }
  }

  // success path
  const aggregate: Record<string, string> = {};
  for (const obj of lines) {
    const tags = obj.tagset || obj.tags || obj.Tags || obj.tagset || {};
    for (const [k, v] of Object.entries(tags)) {
      aggregate[String(k)] = String(v);
    }
  }

  return Object.keys(aggregate).length ? aggregate : undefined;
}

/**
 * List buckets from MinIO and enrich them with usage, region, tags, etc.
 */
export async function listBucketsFromMinio(): Promise<MinioBucket[]> {
  // `mc --json ls ALIAS`
  const entries = await mcJsonLines(["ls", MINIO_ALIAS]);

  // Filter only bucket entries (type can be 'folder' or 'bucket' depending on mc)
  const bucketEntries = entries.filter(
    (e) => e.type === "folder" || e.type === "bucket"
  );

  const detailed = await Promise.all(
    bucketEntries.map((entry) =>
      bucketLimit(async () => {
        const rawName: string =
          entry.key || entry.name || entry.bucket || entry.target || "";
        const bucketName = String(rawName).replace(/\/$/, "");
  
        if (!bucketName) {
          console.warn("Skipping bucket entry with no name:", entry);
          return undefined;
        }
  
        const [stats, quotaBytes] = await Promise.all([
          getMinioBucketStats(bucketName),
          getMinioBucketQuotaBytes(bucketName),
        ]);
  
        const {createdAt,region,objectCount,sizeBytes,versionsCount,versioningStatus,objectLockEnabled,tagsFromStat
        } = stats;
        const tags = tagsFromStat
        const owner: string | undefined =
          (tags && (tags.owner || tags.Owner || tags.bucketOwner)) || undefined;
  
        const inferredVersioning: BucketVersioningStatus | undefined =
          versioningStatus ??
          (versionsCount && versionsCount > 0 ? "Enabled" : "Suspended");
  
        const bucket: MinioBucket = {
          backendKind: "minio",
          name: bucketName,
          createdAt,
          region: region || "minio-default-region",
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
  return detailed.filter((b): b is MinioBucket => Boolean(b));
}


export async function getMinioBucketQuotaBytes(
  bucketName: string
): Promise<number | undefined> {
  try {
    const entry = await mcJsonSingle([
      "quota",
      "info",
      `${MINIO_ALIAS}/${bucketName}`,
    ]);

    const quota = (entry as any).quota;

    return typeof quota === "number" ? quota : undefined;
  } catch (err) {
    console.warn(
      `getMinioBucketQuotaBytes: quota not found for ${bucketName}`,
      err
    );
    return undefined;
  }
}

/**
 * Object-level stats for a single bucket using `mc stat --json`.
 */
export async function getBucketObjectStatsFromMinio(
  bucketName: string
): Promise<{ objectCount: number; sizeBytes: number }> {
  const stat = await mcJsonSingle([
    "stat",
    `${MINIO_ALIAS}/${bucketName}`,
  ]);

  const usage = stat.Usage || stat.usage || {};
  const sizeBytes: number = usage.totalSize ?? usage.size ?? 0;
  const objectCount: number = usage.objectsCount ?? usage.objects ?? 0;

  return { objectCount, sizeBytes };
}



/**
 * deleteBucketFromMinio(bucketName, { force })
 *
 * Uses:
 *   mc rb [--force --dangerous] ALIAS/bucket
 */
export async function deleteBucketFromMinio(
  bucketName: string,
  options?: { force?: boolean }
): Promise<void> {
  if (!bucketName) {
    throw new Error("deleteBucketFromMinio: bucketName is required");
  }

  const bucketPath = `${MINIO_ALIAS}/${bucketName}`;
  const args = ["rb"];

  args.push(bucketPath);

  // default: force delete
  if (options?.force ?? true) {
    args.push("--force", "--dangerous");
  }

  await runMc(args);
}

export interface CreateBucketInMinioOptions {
  region?: string;
  withLock?: boolean;
  withVersioning?: boolean;
  quotaSize?: string;
  quotaObjects?: number;
  ignoreExisting?: boolean;
}

/**
 * createBucketFromMinio
 *
 * mc mb [--ignore-existing] [--region=...] [--with-lock] [--with-versioning] ALIAS/bucket
 * mc quota set [--size ...] ALIAS/bucket
 */
export async function createBucketFromMinio(
  bucketName: string,
  options: CreateBucketInMinioOptions = {}
): Promise<void> {
  if (!bucketName) {
    throw new Error("createBucketFromMinio: bucketName is required");
  }

  const {region,withLock,withVersioning,quotaSize,
  } = options;
  const bucketPath = `${MINIO_ALIAS}/${bucketName}`;

  const mbArgs: string[] = ["mb"];


  if (region && region.trim()) {
    mbArgs.push(`--region=${region.trim()}`);
  }
  if (withLock) {
    mbArgs.push("--with-lock");
  }
  if (withVersioning) {
    mbArgs.push("--with-versioning");
  }

  mbArgs.push(bucketPath);

  await runMc(mbArgs);

const hasSizeQuota = typeof quotaSize === "string" && quotaSize.trim().length > 0;

if (hasSizeQuota) {
  // Correct ordering per docs: TARGET first, then flags
  const quotaArgs: string[] = ["quota", "set", bucketPath, "--size", quotaSize.trim()];

  try {
    await runMc(quotaArgs);
  } catch (state: any) {
    throw new Error(
      `Bucket "${bucketPath}" created, but failed to set quota: ${errorString(state)}`
    );
  }
}

}


export async function listMinioUsers(): Promise<MinioUser[]> {
  const objs = await mcJsonLines(["admin", "user", "list", MINIO_ALIAS]);
  const users: MinioUser[] = [];

  for (const obj of objs) {
    const username: string =
      obj.accessKey || obj.user || obj.userName || obj.username;
    if (!username) continue;
    const rawStatus: string =
      obj.userStatus || obj.status || obj.statusValue || "enabled";

    const status: "enabled" | "disabled" =
      String(rawStatus).toLowerCase() === "disabled" ? "disabled" : "enabled";


    // ---- policies parsing ----
    let policies: string[] | undefined;

    if (Array.isArray(obj.policy)) {
      policies = obj.policy;
    } else if (Array.isArray(obj.policies)) {
      policies = obj.policies;
    } else if (typeof obj.policy === "string") {
      policies = [obj.policy];
    }

    // "policyName": "backups-full,consoleAdmin,diagnostics,readonly,readwrite,writeonly"
    if (!policies && typeof obj.policyName === "string") {
      policies = obj.policyName
        .split(",")
        .map((p: string) => p.trim())
        .filter(Boolean);
    }

    const policyCount = policies?.length ?? 0;

    users.push({ username, status, policies, policyCount,
    });
  }

  return users;
}

/**
 * deleteMinioUser(username: string): Promise<void>
 *
 * Uses:
 *   mc admin user remove ALIAS USERNAME
 */
export async function deleteMinioUser(username: string): Promise<void> {
  if (!username) {
    throw new Error("deleteMinioUser: username is required");
  }

  await runMc(["admin", "user", "remove", MINIO_ALIAS, username]);
}

/**
 * createMinioUser(payload: MinioUserCreatePayload): Promise<void>
 *
 * Uses:
 *   mc admin user add ALIAS USERNAME PASSWORD
 *   mc admin user enable/disable ALIAS USERNAME
 *   mc admin policy set ALIAS POLICY user=USERNAME
 */
export async function createMinioUser(
  payload: MinioUserCreatePayload
): Promise<void> {
  const { username, secretKey, status, policies } = payload;

  if (!username) {
    throw new Error("createMinioUser: username is required");
  }
  if (!secretKey) {
    throw new Error("createMinioUser: secretKey is required");
  }

  // 1) create user
  await runMc(["admin", "user", "add", MINIO_ALIAS, username, secretKey]);

  // 2) enable/disable
  if (status === "disabled") {
    await runMc(["admin", "user", "disable", MINIO_ALIAS, username]);
  } else {
    await runMc(["admin", "user", "enable", MINIO_ALIAS, username]);
  }

  // 3) attach policies
  if (policies && policies.length) {
    for (const policyName of policies) {
      if (!policyName) continue;

      await runMc(["admin","policy","attach",MINIO_ALIAS,policyName,"--user",username,
      ]);
    }
  }
}

/**
 * listMinioPolicies(): Promise<string[]>
 *
 * Uses:
 *   mc --json admin policy list ALIAS
 */
export async function listMinioPolicies(): Promise<string[]> {
  const objs = await mcJsonLines(["admin","policy","list",MINIO_ALIAS,
  ]);

  const names = new Set<string>();

  for (const obj of objs) {
    if (typeof obj.policy === "string") {
      names.add(obj.policy);
    }
    if (typeof obj.name === "string") {
      names.add(obj.name);
    }
    if (typeof obj.policyName === "string") {
      names.add(obj.policyName);
    }
    if (Array.isArray(obj.policies)) {
      for (const p of obj.policies) {
        if (typeof p === "string") names.add(p);
      }
    }
  }

  return Array.from(names).sort();
}

export async function getMinioUserInfo(username: string): Promise<MinioUserDetails> {
  if (!username) {
    throw new Error("getMinioUserInfo: username is required");
  }

  // mc --json admin user info ALIAS USERNAME
  const info = await mcJsonSingle(["admin", "user", "info", MINIO_ALIAS, username]);

  const accessKey: string | undefined =
    info.accessKey || info.AccessKey || info.user || username;

  const rawStatus: string =
    info.userStatus || info.status || info.Status || "enabled";

  const status: "enabled" | "disabled" =
    String(rawStatus).toLowerCase() === "disabled" ? "disabled" : "enabled";

  // --- policies parsing ---
  let policies: string[] | undefined;

  if (Array.isArray(info.policy)) {
    policies = info.policy;
  } else if (Array.isArray(info.policies)) {
    policies = info.policies;
  } else if (typeof info.policy === "string") {
    policies = [info.policy];
  }

  // Handle `policyName: "a,b,c"` as returned by `mc admin user info`
  if (!policies && typeof info.policyName === "string") {
    policies = info.policyName
      .split(",")
      .map((p: string) => p.trim())
      .filter(Boolean);
  }
  if (!policies && typeof info.PolicyName === "string") {
    policies = info.PolicyName
      .split(",")
      .map((p: string) => p.trim())
      .filter(Boolean);
  }

  const authentication: string | undefined =
    info.authentication || info.Authentication;

  const memberOfRaw = info.memberOf || info.member_of || [];
  const memberOf: MinioUserGroupMembership[] = Array.isArray(memberOfRaw)
    ? memberOfRaw.map((g: any) => ({
        name: g.name || g.group || "",
        policies: Array.isArray(g.policies)
          ? g.policies
          : typeof g.policies === "string"
          ? g.policies.split(",").map((p: string) => p.trim()).filter(Boolean)
          : undefined,
      }))
    : [];

  const details: MinioUserDetails = {
    username: accessKey || username,status,policies,accessKey,authentication,memberOf,raw: info,
  };

  return details;
}


export async function updateMinioUser(payload: MinioUserUpdatePayload): Promise<void> {
  const {
    username,
    status,
    policies = [],
    groups = [],
    resetSecret,
    newSecretKey,
  } = payload;

  if (!username) {
    throw new Error("updateMinioUser: username is required");
  }

  // 1) Fetch current state so can diff policies & groups and get accessKey
  const current: MinioUserDetails = await getMinioUserInfo(username);

  const currentPolicies: string[] = (current.policies ?? []) as string[];
  const currentGroups: string[] = (current.memberOf ?? [])
    .map((g) => g.name)
    .filter((name): name is string => Boolean(name));

  const desiredPolicies = Array.from(new Set(policies)).sort();
  const desiredGroups = Array.from(new Set(groups)).sort();

  // 2) Enable/disable user
  if (status === "enabled") {
    await runMc(["admin", "user", "enable", MINIO_ALIAS, username]);
  } else if (status === "disabled") {
    await runMc(["admin", "user", "disable", MINIO_ALIAS, username]);
  }

  // 3) Sync policies: detach removed, attach newly added
  const policiesToAttach = desiredPolicies.filter(
    (p) => !currentPolicies.includes(p)
  );
  const policiesToDetach = currentPolicies.filter(
    (p) => !desiredPolicies.includes(p)
  );

  for (const p of policiesToDetach) {
    await runMc([  "admin",  "policy",  "detach",  MINIO_ALIAS,  p,  "--user",  username,]);
  }

  for (const p of policiesToAttach) {
    await runMc(["admin","policy","attach",MINIO_ALIAS,p,"--user",username,]);
  }

  // 4) Sync groups: remove missing, add new
  const groupsToAdd = desiredGroups.filter(
    (g) => !currentGroups.includes(g)
  );
  const groupsToRemove = currentGroups.filter(
    (g) => !desiredGroups.includes(g)
  );

  for (const g of groupsToAdd) {
    await runMc(["admin","group","add",MINIO_ALIAS,g,username,]);
  }

  for (const g of groupsToRemove) {await runMc([  "admin",  "group",  "remove",  MINIO_ALIAS,  g,  username,]);
  }

  // 5) Secret handling
  if (resetSecret) {
    // If the user provided a specific secret, set that
    if (newSecretKey && newSecretKey.trim().length > 0) {
      // Prefer explicit accessKey from MinioUserDetails, fallback to username
      const accessKey = current.accessKey || username;

      await runMc(["admin", "user", "add", MINIO_ALIAS, username, newSecretKey.trim()]);
    } else {
      await runMc(["admin", "user", "reset", MINIO_ALIAS, username]);
    }
  }
}


export async function listMinioGroups(): Promise<string[]> {
  const res = await runMc(["--json", "admin", "group", "list", MINIO_ALIAS]);

  // Normalize to a string (runMc may return either a string or an object with stdout)
  const output = typeof res === "string" ? res : res.stdout ?? "";

  if (!output.trim()) {
    return [];
  }

  try {
    const data = JSON.parse(output);

    if (Array.isArray(data.groups)) {
      return data.groups.filter((g: any) => typeof g === "string");
    }

    // Fallbacks if mc ever returns something slightly different
    if (Array.isArray(data)) {
      return data.filter((g) => typeof g === "string");
    }

    return [];
  } catch {
    return [];
  }
}

export async function createMinioGroup(
  name: string,
  members: string[]
): Promise<void> {
  if (!name) {
    throw new Error("createMinioGroup: name is required");
  }
  if (!members.length) {
    throw new Error("createMinioGroup: at least one member is required");
  }

  // mc admin group add TARGET GROUPNAME MEMBERS...
  // e.g. mc admin group add gw01 testgroup user1 user2
  await runMc(["admin","group","add",MINIO_ALIAS,name,...members,
  ]);
}

// Delete a group by removing all its members
export async function deleteMinioGroup(name: string): Promise<void> {
  if (!name) {
    throw new Error("deleteMinioGroup: name is required");
  }

  // mc --json admin group info ALIAS GROUP
  // Reuse the existing JSON-lines helper instead of calling runMc directly.
  const entries = await mcJsonLines(["admin","group","info",MINIO_ALIAS,name,
  ]);

  // Collect all members from the JSON output
  const members = new Set<string>();

  for (const obj of entries) {
    if (!obj || typeof obj !== "object") continue;

    // Depending on mc version, this might be "members", "users", or "memberOf"
    const lineMembers: unknown =
      (obj as any).members ?? (obj as any).users ?? (obj as any).memberOf ?? [];

    if (Array.isArray(lineMembers)) {
      for (const m of lineMembers) {
        if (typeof m === "string" && m.trim()) {
          members.add(m.trim());
        }
      }
    }
  }

  // Remove each member from the group
  for (const user of members) {
    await runMc([ "admin", "group", "remove", MINIO_ALIAS, name, "--user", `${user}`,
    ]);
  }

}

export async function getMinioPolicy(name: string): Promise<string> {
  const { stdout } = await runMc([ "admin", "policy", "info", MINIO_ALIAS, name,
  ]);

  const trimmed = stdout.trim();

  if (!trimmed) {
    throw new Error(`MinIO policy "${name}" not found or empty output`);
  }
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return trimmed;
  }
}

async function runCmd(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const cmd = new Command(args, { superuser: "try" });

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

    const out = (stdout ?? "").toString();
    const err = (stderr ?? "").toString();

    return { stdout: out, stderr: err };
  } catch (state: any) {
    throw new Error(errorString(state));
  }
}

async function withTempJsonFile<T>(json: string, fn: (path: string) => Promise<T>): Promise<T> {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`Policy JSON is invalid: ${(err as Error).message}`);
  }

  const normalized = JSON.stringify(parsed, null, 2);

  let tmpFile: string | null = null;
  try {
    const { stdout } = await runCmd(["mktemp", "/tmp/minio-json-XXXXXX.json"]);
    tmpFile = stdout.trim();
    if (!tmpFile) throw new Error("Failed to create temp file with mktemp");

    const script = `cat << 'EOF' > "${tmpFile}"
${normalized}
EOF
`;
    await runCmd(["sh", "-c", script]);

    return await fn(tmpFile);
  } finally {
    if (tmpFile) {
      try { await runCmd(["sh", "-c", `rm -f -- "${tmpFile}"`]); } catch {}
    }
  }
}
export async function createOrUpdateMinioPolicy(name: string, policyJson: string): Promise<void> {
  await withTempJsonFile(policyJson, async (tmpFile) => {
    await runMc(["admin", "policy", "create", MINIO_ALIAS, name, tmpFile]);
  });
}

export async function deleteMinioPolicy(name: string): Promise<void> {
  await runMc([ "admin", "policy", "remove", MINIO_ALIAS, name,
  ]);
}


export async function getMinioGroupInfo(name: string): Promise<MinioGroupInfo> {
  const info = await mcJsonSingle(["admin", "group", "info", MINIO_ALIAS, name]);

  const toStringArray = (v: any): string[] => {
    if (Array.isArray(v)) {
      return v.map((x) => String(x).trim()).filter(Boolean);
    }
    if (typeof v === "string") {
      return v
        .split(/[,\n]/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const membersRaw =
    info.members ??
    info.Members ??
    [];

  // mc --json group info uses "groupPolicy" (comma-separated string)
  const policiesRaw =
    info.groupPolicy ??
    [];

  return {
    name: info.groupName ?? name,
    members: toStringArray(membersRaw),
    policies: toStringArray(policiesRaw),
    raw: info,
  };
}

/**
 * Update a group's membership and attached policies to match the desired state.
 */
export async function updateMinioGroup(
  name: string,
  desiredMembers: string[],
  desiredPolicies: string[]
): Promise<void> {
  const current = await getMinioGroupInfo(name);

  const currentMembers = Array.from(new Set(current.members)).sort();
  const currentPolicies = Array.from(new Set(current.policies)).sort();

  const wantMembers = Array.from(new Set(desiredMembers)).sort();
  const wantPolicies = Array.from(new Set(desiredPolicies)).sort();

  // Members: add new, remove missing
  const membersToAdd = wantMembers.filter(m => !currentMembers.includes(m));
  const membersToRemove = currentMembers.filter(m => !wantMembers.includes(m));

  for (const m of membersToAdd) {
    await runMc(["admin","group","add",MINIO_ALIAS,name,m,
    ]);
  }

  for (const m of membersToRemove) {
    await runMc(["admin","group","remove",MINIO_ALIAS,name,m,
    ]);
  }

  // Policies: attach new, detach missing
  const policiesToAttach = wantPolicies.filter(p => !currentPolicies.includes(p));
  const policiesToDetach = currentPolicies.filter(p => !wantPolicies.includes(p));

  for (const p of policiesToDetach) {
    await runMc(["admin","policy","detach",MINIO_ALIAS,p,"--group",name,
    ]);
  }

  for (const p of policiesToAttach) {
    await runMc(["admin","policy","attach",MINIO_ALIAS,p,"--group",name,
    ]);
  }
}

export interface UpdateMinioBucketOptions {
  versioning?: boolean;
  quotaSize?: string | null;
  tags?: Record<string, string> | null;
}

export async function updateMinioBucket(
  bucketName: string,
  options: UpdateMinioBucketOptions,
): Promise<void> {
  if (!bucketName) {
    throw new Error("updateMinioBucket: bucketName is required");
  }

  const bucketPath = `${MINIO_ALIAS}/${bucketName}`;
  // Versioning
  if (typeof options.versioning === "boolean") {
    const cmd = options.versioning ? "enable" : "suspend";
    await runMc(["version", cmd, bucketPath]);
  }

  // Quota
if (options.quotaSize !== undefined) {
  const bucketPath = `${MINIO_ALIAS}/${bucketName}`;

  // If null/empty string => clear quota, otherwise set quota
  if (options.quotaSize === null || options.quotaSize.trim() === "") {
    // Clear quota
    await runMc([
      "quota",
      "clear",
      bucketPath,
    ]);
  } else {
    // Set quota
    await runMc(["quota","set",bucketPath,"--size",options.quotaSize.trim(), // e.g. "20GiB"
    ]);
  }
}

  // Tags
  if ("tags" in options) {
    const { tags } = options;

    if (tags === null) {
      try {
        await runMc(["tag", "remove", bucketPath]);
      } catch (state: any) {
        const msg = errorString(state) || "";
        if (!msg.toLowerCase().includes("no tags")) {
          throw new Error(msg);
        }
      }
    } else if (tags && Object.keys(tags).length > 0) {
      const tagStr = Object.entries(tags)
        .map(([k, v]) => `${k}=${v}`)
        .join("&");

      await runMc(["tag", "set", bucketPath, tagStr]);
    } else {
      // tags is {} -> treat like "clear"
      try {
        await runMc(["tag", "remove", bucketPath]);
      } catch (state: any) {
        const msg = errorString(state) || "";
        if (!msg.toLowerCase().includes("no tags")) {
          throw new Error(msg);
        }
      }
    }
  }
}

export async function getMinioBucketDashboardStats(
  bucketName: string
): Promise<MinioBucketDashboardStats> {
  if (!bucketName) {
    throw new Error("getMinioBucketDashboardStats: bucketName is required");
  }

  const stat = await mcJsonSingle(["stat", `${MINIO_ALIAS}/${bucketName}`]);

  const usage = stat.Usage || stat.usage || {};
  const totalSizeBytes: number = Number(usage.size ?? usage.totalSize ?? 0) || 0;
  const objectCount: number = Number(usage.objectsCount ?? usage.objects ?? 0) || 0;

  const versionCount: number | undefined =
    typeof usage.versionsCount === "number"
      ? usage.versionsCount
      : typeof usage.versions === "number"
      ? usage.versions
      : undefined;

  const deleteMarkersCount: number | undefined =
    typeof usage.deleteMarkersCount === "number" ? usage.deleteMarkersCount : undefined;

  const lastModified: string | undefined =
    stat.lastModified || stat.LastModified || stat.time || undefined;

  const location: string | undefined =
    stat.location ||
    stat.Location ||
    (stat.Properties && (stat.Properties.location || stat.Properties.Location)) ||
    undefined;

  const rawVersioning = stat.Versioning || stat.versioning || {};
  const versioningStatus: BucketVersioningStatus | undefined =
    typeof rawVersioning.status === "string" && rawVersioning.status
      ? (rawVersioning.status as BucketVersioningStatus)
      : undefined;

  const rawObjectLock = stat.ObjectLock || stat.objectLock || {};
  const objectLockEnabled =
    typeof rawObjectLock.enabled === "string"
      ? rawObjectLock.enabled.toLowerCase() === "enabled"
      : undefined;

  const objectLockMode: string | undefined =
    typeof rawObjectLock.mode === "string" && rawObjectLock.mode ? rawObjectLock.mode : undefined;

  const objectLockValidity: string | undefined =
    typeof rawObjectLock.validity === "string" && rawObjectLock.validity
      ? rawObjectLock.validity
      : undefined;

  const policy = stat.Policy || stat.policy || {};
  const policyType: string | undefined =
    typeof policy.type === "string" ? policy.type : undefined;

  const replication = stat.Replication || stat.replication || {};
  const replicationEnabled: boolean | undefined =
    typeof replication.enabled === "boolean" ? replication.enabled : undefined;

  const replicationRole: string | undefined =
    replication?.config && typeof replication.config.Role === "string"
      ? replication.config.Role
      : undefined;

  const encryption = stat.Encryption || stat.encryption || {};
  const encryptionConfigured: boolean | undefined =
    encryption && typeof encryption === "object" ? (Object.keys(encryption).length > 0) : undefined;

  const ilm = stat.ilm || stat.ILM || stat.ILMConfig || {};
  const ilmConfigured: boolean | undefined =
    ilm && typeof ilm === "object" ? (Object.keys(ilm).length > 0) : undefined;

  const sizeHistogramSrc =
    usage.objectsSizesHistogram || usage.ObjectSizesHistogram || usage.objectSizesHistogram || null;

  const versionsHistogramSrc =
    usage.objectsVersionsHistogram || usage.ObjectVersionsHistogram || usage.objectVersionsHistogram || null;

  const sizeHistogram: Record<string, number> | undefined =
    sizeHistogramSrc && typeof sizeHistogramSrc === "object"
      ? Object.fromEntries(Object.entries(sizeHistogramSrc).map(([k, v]) => [k, Number(v) || 0]))
      : undefined;

  const versionsHistogram: Record<string, number> | undefined =
    versionsHistogramSrc && typeof versionsHistogramSrc === "object"
      ? Object.fromEntries(Object.entries(versionsHistogramSrc).map(([k, v]) => [k, Number(v) || 0]))
      : undefined;

  const replicationUsage: MinioReplicationUsage | undefined =
    replicationEnabled
      ? {
          objectsPendingReplicationCount: usage.objectsPendingReplicationCount,
          objectsPendingReplicationTotalSize: usage.objectsPendingReplicationTotalSize,
          objectsFailedReplicationCount: usage.objectsFailedReplicationCount,
          objectsFailedReplicationTotalSize: usage.objectsFailedReplicationTotalSize,
          objectsReplicatedTotalSize: usage.objectsReplicatedTotalSize,
          objectReplicaTotalSize: usage.objectReplicaTotalSize,
        }
      : undefined;

  const quotaBytes = await getMinioBucketQuotaBytes(bucketName);

  return {bucket: bucketName,totalSizeBytes,objectCount,versionCount,deleteMarkersCount,lastModified,location,versioningStatus,
    objectLockEnabled,objectLockMode,objectLockValidity,policyType,replicationEnabled,replicationRole,encryptionConfigured,ilmConfigured,quotaBytes,sizeHistogram,versionsHistogram,replicationUsage,raw: stat,
  };
}function tryParseJson(text: string): any | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}


export async function createMinioServiceAccount(payload: MinioServiceAccountCreatePayload) {
  const username = payload.username?.trim();
  if (!username) throw new Error("createMinioServiceAccount: username is required");

  const args = ["admin", "accesskey", "create", MINIO_ALIAS, username];
  if (payload.name) args.push("--name", payload.name);
  if (payload.description) args.push("--description", payload.description);
  if (payload.expiresAt) args.push("--expiry", payload.expiresAt);
  if (payload.accessKey) args.push("--access-key", payload.accessKey);
  if (payload.secretKey) args.push("--secret-key", payload.secretKey);

  if (payload.policyFilePath) {
    args.push("--policy", payload.policyFilePath);
    const out = await runMc(args);
    return parseCreatedCreds(out.stdout);
  }

  if (payload.policyJson?.trim()) {
    return await withTempJsonFile(payload.policyJson, async (p) => {
      const out = await runMc([...args, "--policy", p]);
      return parseCreatedCreds(out.stdout);
    });
  }

  const out = await runMc(args);
  return parseCreatedCreds(out.stdout);
}
export async function updateMinioServiceAccount(payload: MinioServiceAccountUpdatePayload): Promise<void> {
  const accessKey = payload.accessKey?.trim();
  if (!accessKey) throw new Error("updateMinioServiceAccount: accessKey is required");

  const args = ["admin", "accesskey", "edit", MINIO_ALIAS, accessKey];

  if (payload.name) args.push("--name", payload.name);
  if (payload.description) args.push("--description", payload.description);

  if (payload.clearExpiry) {
  } else if (payload.expiresAt) {
    args.push("--expiry", normalizeExpiryForMc(payload.expiresAt));
  }

  if (payload.policyFilePath) {
    await runMc([...args, "--policy", payload.policyFilePath]);
    return;
  }

  if (payload.policyJson?.trim()) {
    await withTempJsonFile(payload.policyJson, async (p) => {
      await runMc([...args, "--policy", p]);
    });
    return;
  }

  await runMc(args);
}


function normalizeExpiryForMc(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, "Z");
}
function normalizeExpiry(s: string | null): string | null {
  if (!s) return null;
  const v = s.trim();
  if (!v) return null;
  if (v.toLowerCase() === "never") return null;
  return v;
}
function pickExpiryIso(obj: any): string | null {
  const v = obj?.expiration ?? null;
  if (v == null) return null;

  // numeric timestamps
  if (typeof v === "number") {
    if (v <= 0) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    if (d.getTime() === 0) return null;
    return d.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  const s = String(v).trim();
  if (!s) return null;
  if (s.toLowerCase() === "never") return null;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  if (d.getTime() === 0) return null;

  if (d.getUTCFullYear() <= 1971) return null;

  return s;
}

function parseCreatedCreds(stdout: string) {
  const accessKey = stdout.match(/Access Key:\s*(\S+)/)?.[1];
  const secretKey = stdout.match(/Secret Key:\s*(\S+)/)?.[1];

  const expirationRaw = stdout.match(/Expiration:\s*(.*)$/m)?.[1]?.trim() ?? null;
  const expiresAt = normalizeExpiry(expirationRaw);

  if (!accessKey || !secretKey) throw new Error("Failed to parse created credentials");
  return { accessKey, secretKey, expiresAt };
}

export async function disableMinioServiceAccount(accessKey: string) {
  await runMc(["admin", "accesskey", "disable", MINIO_ALIAS, accessKey]);
}

export async function enableMinioServiceAccount(accessKey: string) {
  await runMc(["admin", "accesskey", "enable", MINIO_ALIAS, accessKey]);
}

export async function deleteMinioServiceAccount(accessKey: string) {
  await runMc(["admin", "accesskey", "rm", MINIO_ALIAS, accessKey]);
}


export async function getMinioServiceAccountInfo(accessKey: string): Promise<{
  accessKey: string;
  name?: string;
  description?: string;
  status?: "enabled" | "disabled";
  expiresAt?: string | null;
  parentUser?: string;
  policyJson?: string;    
  errorCode?: string;
}> {
  const { stdout, stderr, exitStatus } = await runMc(
    ["admin", "accesskey", "info", MINIO_ALIAS, accessKey, "--json"],
    true
  );

  const payloadText = stdout.trim() || stderr.trim();
  if (!payloadText) return { accessKey };

  const obj = tryParseJson(payloadText);
  if (!obj) return { accessKey };
  if (exitStatus !== 0 || obj.status === "error") {
    const code = extractAdminCode(obj);
    if (code === "XMinioAdminNoSuchAccessKey") {
      return { accessKey, status: "disabled", errorCode: code };
    }
    return { accessKey, errorCode: code };
  }

  const s = String(obj?.accountStatus ?? "").toLowerCase();
  const status =
    s === "off" || s === "disabled" ? "disabled" :
    s === "on" || s === "enabled" ? "enabled" :
    undefined;

  return {
    accessKey: obj?.accessKey ?? accessKey,
    name: obj?.name,
    description: obj?.description,
    status,
    expiresAt: pickExpiryIso(obj) ?? null,

    parentUser: obj?.parentUser,
    policyJson: obj?.policy ? JSON.stringify(obj.policy, null, 2) : undefined, // here
  };
}
export async function listMinioServiceAccounts(username: string): Promise<MinioServiceAccount[]> {
  const { stdout } = await runMc(
    ["admin", "accesskey", "list", MINIO_ALIAS, username, "--json"],
    false
  );

  const text = (stdout ?? "").trim();
  if (!text) return [];

  const root: any = JSON.parse(text);
  const svcaccs = (root?.svcaccs ?? []) as any[];

  const base = svcaccs
    .map((x) => ({
      accessKey: x?.accessKey,
      expiresAt: pickExpiryIso(x),
    }))
    .filter((x) => x.accessKey);

  const enriched = await Promise.all(
    base.map(async (x) => {
      const info = await getMinioServiceAccountInfo(x.accessKey);

      const status =
        info.status ??
        (info.errorCode === "XMinioAdminNoSuchAccessKey" ? "disabled" : undefined);

      const mergedExpiresAt =
        info.errorCode ? (x.expiresAt ?? null) : (info.expiresAt ?? null);
      return {
        accessKey: x.accessKey,
        expiresAt: mergedExpiresAt,
        name: info.name,
        description: info.description,
        status: status ?? "enabled",
      } satisfies MinioServiceAccount;
    })
  );

  return enriched;
}
