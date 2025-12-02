// cephRgwCliAdapter.ts
import type {
  S3Bucket,
  Endpoint,
  BucketVersioningStatus,
  BucketAcl,RgwGateway,
  RgwUser,
  RgwDashboardS3Creds, CreatedRgwUserKeys,CreateRgwUserOptions
} from "../types/types";

import { legacy } from "../../../../../houston-common/houston-common-lib";

const { errorString, useSpawn } = legacy;

async function rgwJson(subArgs: string[]): Promise<any> {
  const args = ["radosgw-admin", ...subArgs, "--format", "json"];

  const proc = useSpawn(args, {
    superuser: "try", // fine even if already root
  });

  try {
    const { stdout } = await proc.promise();
    const text = (stdout ?? "").toString().trim();

    console.log("rgwJson args =", args.join(" "));
    console.log("rgwJson stdout =", text);

    if (!text) return {};
    return JSON.parse(text);
  } catch (state: any) {
    console.error("rgwJson error for", subArgs, state);
    throw new Error(errorString(state));
  }
}


export async function listBucketsFromCeph(): Promise<S3Bucket[]> {
  const bucketNames: string[] = await rgwJson(["bucket", "list"]);

  const detailed = await Promise.all(
    bucketNames.map(async (bucketName) => {
      const stats = await rgwJson([
        "bucket",
        "stats",
        "--bucket",
        bucketName,
      ]);

      const owner: string | undefined = stats.owner;
      const creationTime: string | undefined = stats.creation_time;

      const usage = stats.usage || {};
      const usageKey = "rgw.main" in usage ? "rgw.main" : Object.keys(usage)[0];
      const usageMain = usageKey ? usage[usageKey] || {} : {};

      const sizeBytes: number = usageMain.size ?? 0;
      const objectCount: number = usageMain.num_objects ?? 0;
      const versionCount: number | undefined = usageMain.num_object_versions;

      const region: string =
        stats.zone || stats.zonegroup || "ceph-default-zone";

      const acl: BucketAcl | undefined = undefined;
      const policy: string | undefined = undefined;
      const tags: Record<string, string> | undefined = undefined;

      const bucket: S3Bucket = {
        name: bucketName,
        createdAt: creationTime,
        region,
        owner,
        objectCount,
        sizeBytes,
        versionCount,
        acl,
        policy,
        tags,
      };

      return bucket;
    })
  );

  return detailed;
}

export async function getBucketObjectStats(
  _endpoint: Endpoint,
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
    return true;
  } catch (e) {
    console.warn("Ceph RGW health check failed:", e);
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

export async function listRgwGateways(): Promise<RgwGateway[]> {
  // `ceph report` contains the servicemap with RGW daemons and metadata.
  const report = await cephJson(["report"]);

  const svcMap = report.servicemap || report.service_map || {};
  const rgwSvc = svcMap.services?.rgw || svcMap["rgw"] || {};
  const daemons = rgwSvc.daemons || rgwSvc["daemons"] || {};

  const gateways: RgwGateway[] = [];

  for (const [id, rawDaemon] of Object.entries(daemons)) {
    const daemon: any = rawDaemon;
    const meta: any = daemon.metadata || {};

    const hostname: string =
      meta.hostname || id.split(".")[0] || id;

    const frontendType: string = meta["frontend_type#0"] || "";
    const frontendConfig: string = meta["frontend_config#0"] || "";

    // Parse "endpoint=IP:PORT" from e.g. "beast endpoint=192.168.85.65:8080"
    let endpoint = "";
    const m = frontendConfig.match(/endpoint=([^\s,]+)/);
    if (m) {
      endpoint = m[1];
    }

    // Zone / zonegroup; fall back to "default" if not present
    const zonegroup: string =
      meta.zonegroup ||
      meta["rgw_zonegroup"] ||
      "default";

    const zone: string =
      meta.zone ||
      meta["rgw_zone"] ||
      zonegroup ||
      "default";

    // Heuristic for "default" gateway
    const isDefault: boolean =
      !!meta["rgw_zone_default"] ||
      !!meta["rgw_zonegroup_default"] ||
      (zonegroup === "default" && zone === "default");

    // If there is no endpoint at all, you may want to skip this daemon
    if (!endpoint && !frontendConfig) {
      continue;
    }

    gateways.push({
      id,          // e.g. "gw02.rgw0"
      hostname,    // e.g. "gw02"
      zonegroup,
      zone,
      endpoint,    // e.g. "192.168.85.65:8080"
      isDefault,
    });

    console.log("RGW gateway from report:", {
      id,
      hostname,
      zonegroup,
      zone,
      frontendType,
      frontendConfig,
      endpoint,
      isDefault,
    });
  }

  return gateways;
}


async function cephJson(subArgs: string[]): Promise<any> {
  const args = ["ceph", ...subArgs, "--format", "json"];

  const proc = useSpawn(args, { superuser: "try" });

  try {
    const { stdout } = await proc.promise();
    const text = (stdout ?? "").toString().trim();

    console.log("cephJson args =", args.join(" "));
    console.log("cephJson stdout =", text);

    if (!text) return {};
    return JSON.parse(text);
  } catch (state: any) {
    console.error("cephJson error for", subArgs, state);
    throw new Error(errorString(state));
  }
}

// export async function listRgwUsers(): Promise<RgwUser[]> {
//   // radosgw-admin user list  ->  ["uid1","uid2",...]
//   const uids: string[] = await rgwJson(["user", "list"]);

//   const users: RgwUser[] = [];

//   for (const uid of uids) {
//     try {
//       const info = await rgwJson(["user", "info", "--uid", uid]);

//       users.push({
//         uid,
//         displayName: info.display_name || info.displayName,
        
//       });
//     } catch (e) {
//       console.warn("Failed to fetch info for RGW user", uid, e);
//       // Fallback: at least expose the uid
//       users.push({ uid });
//     }
//   }

//   return users;
// }

export async function listRgwUsers(): Promise<RgwUser[]> {
  const uids: string[] = await rgwJson(["user", "list"]);
  const users: RgwUser[] = [];

  for (const uid of uids) {
    try {
      const info = await rgwJson(["user", "info", "--uid", uid]);
      const userQuota = info.user_quota || {};

      users.push({
        uid,
        tenant: info.tenant ?? undefined,
        displayName: info.display_name || info.displayName,
        email: info.email ?? undefined,
        suspended: !!info.suspended,
        maxBuckets:
          typeof info.max_buckets === "number" ? info.max_buckets : undefined,
        // These two are actually absolute values from Ceph, not real “%”
        capacityLimitPercent:
          typeof userQuota.max_size_kb === "number"
            ? userQuota.max_size_kb
            : undefined,
        objectLimitPercent:
          typeof userQuota.max_objects === "number"
            ? userQuota.max_objects
            : undefined,
      } as RgwUser);
    } catch (e) {
      console.warn("Failed to fetch info for RGW user", uid, e);
      users.push({ uid } as RgwUser);
    }
  }

  return users;
}

export async function createRgwBucket(params: {
  name: string;
  ownerUid?: string;
  placementTarget?: string;
  zone?: string;
  zonegroup?: string;
}): Promise<void> {
  const args: string[] = ["bucket", "create", "--bucket", params.name];

  if (params.ownerUid) {
    args.push("--uid", params.ownerUid);
  }

  // Placement / location constraint (Ceph RGW uses placement-id)
  if (params.placementTarget) {
    args.push("--placement-id", params.placementTarget);
  }

 
  await rgwJson(args);
}

async function getDashboardS3Creds(): Promise<RgwDashboardS3Creds> {
  // Adjust uid if your dashboard user has a different name
  const info = await rgwJson(["user", "info", "--uid", "dashboard"]);

  const keys = info.keys || info.s3_keys || [];
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error("No S3 keys found for dashboard user");
  }

  const first = keys[0];

  const accessKey = first.access_key || first.accessKey;
  const secretKey = first.secret_key || first.secretKey;

  if (!accessKey || !secretKey) {
    throw new Error("Dashboard user S3 keys are missing access/secret key fields");
  }

  return { accessKey, secretKey };
}

async function runAwsWithDashboardCreds(
  args: string[],
  endpointUrl: string,
  region: string
): Promise<void> {
  const { accessKey, secretKey } = await getDashboardS3Creds();

  const cmd =
    `AWS_ACCESS_KEY_ID='${accessKey}' ` +
    `AWS_SECRET_ACCESS_KEY='${secretKey}' ` +
    `AWS_DEFAULT_REGION='${region}' ` +
    `aws --endpoint-url '${endpointUrl}' ` +
    args.map((a) => `'${a}'`).join(" ");

  const proc = useSpawn(["bash", "-lc", cmd], {
    superuser: "try",
  });

  try {
    const { stdout } = await proc.promise();
    const text = (stdout ?? "").toString().trim();
    console.log("runAwsWithDashboardCreds stdout =", text);
  } catch (state: any) {
    const stderr = String(state.stderr ?? "");

    // Special-case the "invalid XML" + bucket_info JSON thing for create-bucket only.
    if (
      args[0] === "s3api" &&
      args[1] === "create-bucket" &&
      stderr.includes("Unable to parse response (not well-formed (invalid token)") &&
      stderr.includes('"bucket_info"')
    ) {
      console.warn("AWS CLI parse error, but RGW reports bucket created:", stderr);
      return;
    }

    console.error("runAwsWithDashboardCreds error", state);
    throw new Error(errorString(state));
  }
}

export async function changeRgwBucketOwner(
  bucketName: string,
  newOwnerUid: string
): Promise<void> {
  // First, get the bucket-id to be explicit
  const stats = await rgwJson(["bucket", "stats", "--bucket", bucketName]);

  const bucketId: string | undefined =
    stats.id ||
    stats.bucket_id ||
    stats.bucket?.id;

  const args: string[] = [
    "bucket",
    "link",
    "--bucket",
    bucketName,
    "--uid",
    newOwnerUid,
  ];

  if (bucketId) {
    args.push("--bucket-id", bucketId);
  }

  await rgwJson(args);
}



export async function createCephBucketViaS3(
  params: {
    bucketName: string;
    endpoint: string;
    region?: string;

    // extra config
    tags?: Record<string, string>;
    encryptionMode?: "none" | "sse-s3" | "kms";
    kmsKeyId?: string;
    bucketPolicyJson?: string;
    aclGrantee?: string;
    aclPermission?: "READ" | "WRITE" | "READ_ACP" | "WRITE_ACP" | "FULL_CONTROL";

    objectLockEnabled?: boolean;
    objectLockMode?: "GOVERNANCE" | "COMPLIANCE";
    objectLockRetentionDays?: number;
    owner?: string;
  }
): Promise<void> {
  const endpointUrl = params.endpoint.startsWith("http")
    ? params.endpoint
    : `http://${params.endpoint}`;

  const region = params.region || "us-east-1";

  // 1) create bucket (optionally with object-lock flag)
  const createArgs = [
    "s3api",
    "create-bucket",
    "--bucket",
    params.bucketName,
  ];

  if (region && region !== "us-east-1") {
    createArgs.push(
      "--create-bucket-configuration",
      `LocationConstraint=${region}`
    );
  }

  if (params.objectLockEnabled) {
    createArgs.push("--object-lock-enabled-for-bucket");
  }

  await runAwsWithDashboardCreds(createArgs, endpointUrl, region);

  // 2) tags
  if (params.tags && Object.keys(params.tags).length) {
    const TagSet = Object.entries(params.tags).map(([Key, Value]) => ({
      Key,
      Value,
    }));

    const taggingJson = JSON.stringify({ TagSet });

    await runAwsWithDashboardCreds(
      [
        "s3api",
        "put-bucket-tagging",
        "--bucket",
        params.bucketName,
        "--tagging",
        taggingJson,
      ],
      endpointUrl,
      region
    );
  }

  // 3) encryption
  if (params.encryptionMode && params.encryptionMode !== "none") {
    const rules: any[] = [];

    if (params.encryptionMode === "sse-s3") {
      rules.push({
        ApplyServerSideEncryptionByDefault: {
          SSEAlgorithm: "AES256",
        },
      });
    } else if (params.encryptionMode === "kms") {
      if (!params.kmsKeyId) {
        throw new Error("KMS encryption selected but no kmsKeyId provided");
      }
      rules.push({
        ApplyServerSideEncryptionByDefault: {
          SSEAlgorithm: "aws:kms",
          KMSMasterKeyID: params.kmsKeyId,
        },
      });
    }

    const encryptionJson = JSON.stringify({
      Rules: rules,
    });

    await runAwsWithDashboardCreds(
      [
        "s3api",
        "put-bucket-encryption",
        "--bucket",
        params.bucketName,
        "--server-side-encryption-configuration",
        encryptionJson,
      ],
      endpointUrl,
      region
    );
  }

  // 4) ACL
  if (params.aclGrantee && params.aclPermission) {
    const grantJson = JSON.stringify({
      Grants: [
        {
          Grantee: {
            Type: "CanonicalUser",
            ID: params.aclGrantee,
          },
          Permission: params.aclPermission,
        },
      ],
      Owner: {},
    });

    await runAwsWithDashboardCreds(
      [
        "s3api",
        "put-bucket-acl",
        "--bucket",
        params.bucketName,
        "--access-control-policy",
        grantJson,
      ],
      endpointUrl,
      region
    );
  }

  // 5) bucket policy
  if (params.bucketPolicyJson && params.bucketPolicyJson.trim()) {
    await runAwsWithDashboardCreds(
      [
        "s3api",
        "put-bucket-policy",
        "--bucket",
        params.bucketName,
        "--policy",
        params.bucketPolicyJson,
      ],
      endpointUrl,
      region
    );
  }

  // 6) object lock configuration (if enabled)
  if (
    params.objectLockEnabled &&
    params.objectLockMode &&
    params.objectLockRetentionDays
  ) {
    const lockConfig = JSON.stringify({
      ObjectLockEnabled: "Enabled",
      Rule: {
        DefaultRetention: {
          Mode: params.objectLockMode,
          Days: params.objectLockRetentionDays,
        },
      },
    });

    await runAwsWithDashboardCreds(
      [
        "s3api",
        "put-object-lock-configuration",
        "--bucket",
        params.bucketName,
        "--object-lock-configuration",
        lockConfig,
      ],
      endpointUrl,
      region
    );
  }

  // 7) finally, change bucket owner via radosgw-admin
  if (params.owner && params.owner.trim()) {
    await changeRgwBucketOwner(params.bucketName, params.owner.trim());
  }
}


async function runRgwAdmin(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const proc = useSpawn(["radosgw-admin", ...args], { superuser: "try" });

  try {
    const { stdout, stderr } = await proc.promise();
    const out = stdout ? stdout.toString() : "";
    const err = stderr ? stderr.toString() : "";

    console.log("runRgwAdmin args =", ["radosgw-admin", ...args].join(" "));
    if (out) console.log("runRgwAdmin stdout =", out);
    if (err) console.log("runRgwAdmin stderr =", err);

    return { stdout: out, stderr: err };
  } catch (state: any) {
    console.error("runRgwAdmin error for", args.join(" "), state);
    throw new Error(errorString(state));
  }
}

/**
 * 1) user create
 */
async function rgwUserCreateBase(opts: CreateRgwUserOptions): Promise<CreatedRgwUserKeys> {
  const {uid, tenant,displayName,email,maxBuckets,systemUser,autoGenerateKey,accessKey,secretKey, suspended
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

  if (!autoGenerateKey) {
    args.push(`--access-key=${accessKey}`, `--secret=${secretKey}`);
  }

  const { stdout } = await runRgwAdmin(args);

  if (typeof suspended === "boolean") {
    if (suspended) {
      await runRgwAdmin(["user", "suspend", `--uid=${uid}`]);
    } else {
      await runRgwAdmin(["user", "enable", `--uid=${uid}`]);
    }
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
      console.warn("rgwUserCreateBase: failed to parse JSON from user create:", e);
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
async function rgwSetUserQuota(opts: {
  uid: string;
  tenant?: string;
  enabled: boolean;
  maxSizeKb?: number;
  maxObjects?: number;
}): Promise<void> {
  const { uid, tenant, enabled, maxSizeKb, maxObjects } = opts;
  if (!uid) throw new Error("rgwSetUserQuota: uid is required");
  if (!enabled) return;

  const setArgs: string[] = ["quota", "set", `--uid=${uid}`, "--quota-scope=user"];
  if (tenant) setArgs.push(`--tenant=${tenant}`);

  if (typeof maxSizeKb === "number") {
    setArgs.push(`--max-size-kb=${maxSizeKb}`);
  }
  if (typeof maxObjects === "number") {
    setArgs.push(`--max-objects=${maxObjects}`);
  }

  await runRgwAdmin(setArgs);

  const enableArgs = ["quota", "enable", `--uid=${uid}`, "--quota-scope=user"];
  if (tenant) enableArgs.push(`--tenant=${tenant}`);
  await runRgwAdmin(enableArgs);
}

async function rgwSetBucketQuota(opts: {
  uid: string;
  tenant?: string;
  enabled: boolean;
  maxSizeKb?: number;
  maxObjects?: number;
}): Promise<void> {
  const { uid, tenant, enabled, maxSizeKb, maxObjects } = opts;
  if (!uid) throw new Error("rgwSetBucketQuota: uid is required");
  if (!enabled) return;

  const setArgs: string[] = ["quota", "set", `--uid=${uid}`, "--quota-scope=bucket"];
  if (tenant) setArgs.push(`--tenant=${tenant}`);

  if (typeof maxSizeKb === "number") {
    setArgs.push(`--max-size-kb=${maxSizeKb}`);
  }
  if (typeof maxObjects === "number") {
    setArgs.push(`--max-objects=${maxObjects}`);
  }

  await runRgwAdmin(setArgs);

  const enableArgs = ["quota", "enable", `--uid=${uid}`, "--quota-scope=bucket"];
  if (tenant) enableArgs.push(`--tenant=${tenant}`);
  await runRgwAdmin(enableArgs);
}

export async function createRgwUser(
  opts: CreateRgwUserOptions
): Promise<CreatedRgwUserKeys> {
  const {
    uid,
    tenant,
    userQuotaEnabled,
    userQuotaMaxSizeKb,
    userQuotaMaxObjects,
    bucketQuotaEnabled,
    bucketQuotaMaxSizeKb,
    bucketQuotaMaxObjects,
  } = opts;

  const keys = await rgwUserCreateBase(opts);

  await rgwSetUserQuota({
    uid,
    tenant,
    enabled: !!userQuotaEnabled,
    maxSizeKb: userQuotaMaxSizeKb,
    maxObjects: userQuotaMaxObjects,
  });

  await rgwSetBucketQuota({
    uid,
    tenant,
    enabled: !!bucketQuotaEnabled,
    maxSizeKb: bucketQuotaMaxSizeKb,
    maxObjects: bucketQuotaMaxObjects,
  });

  return keys;
}

export async function deleteRgwUser(uid: string,opts?: {
    purgeData?: boolean;
    purgeKeys?: boolean;
  }
): Promise<void> {
  if (!uid) {
    throw new Error("deleteRgwUser: uid is required");
  }

  const args: string[] = ["user", "rm", `--uid=${uid}`];

  if (opts?.purgeData) {
    args.push("--purge-data");
  }

  if (opts?.purgeKeys) {
    args.push("--purge-keys");
  }

  await runRgwAdmin(args);
}


export async function updateRgwUser(
  opts: CreateRgwUserOptions
): Promise<void> {
  const {
    uid,
    tenant,
    displayName,
    email,
    maxBuckets,
    systemUser,
    suspended,

    userQuotaEnabled,
    userQuotaMaxSizeKb,
    userQuotaMaxObjects,

    bucketQuotaEnabled,
    bucketQuotaMaxSizeKb,
    bucketQuotaMaxObjects,
  } = opts;

  if (!uid) {
    throw new Error("updateRgwUser: uid is required");
  }

  // 1) Modify basic user attributes
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

  await runRgwAdmin(args);

  // 2) Suspended / enabled
  if (typeof suspended === "boolean") {
    const suspendArgs: string[] = [
      "user",
      suspended ? "suspend" : "enable",
      `--uid=${uid}`,
    ];
    if (tenant) {
      suspendArgs.push(`--tenant=${tenant}`);
    }
    await runRgwAdmin(suspendArgs);
  }

  // 3) User-level quota
  await rgwSetUserQuota({
    uid,
    tenant,
    enabled: !!userQuotaEnabled,
    maxSizeKb: userQuotaMaxSizeKb,
    maxObjects: userQuotaMaxObjects,
  });

  // 4) Bucket-level quota
  await rgwSetBucketQuota({
    uid,
    tenant,
    enabled: !!bucketQuotaEnabled,
    maxSizeKb: bucketQuotaMaxSizeKb,
    maxObjects: bucketQuotaMaxObjects,
  });
}