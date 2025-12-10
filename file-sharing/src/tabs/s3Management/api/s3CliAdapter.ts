// cephRgwCliAdapter.ts
import type {S3Bucket,Endpoint,CephAclRule,RgwGateway,RgwUser,RgwDashboardS3Creds, CreatedRgwUserKeys,CreateRgwUserOptions,
  RgwUserDetails,RgwUserKey,RgwUserCap, CephBucketUpdatePayload,
  CephAclPermission,} from "../types/types";
  import { legacy, server, Command, unwrap } from "../../../../../houston-common/houston-common-lib";
  const { errorString } = legacy;
  type CephS3Connection = {
    endpointUrl: string;
    region: string;

  };
  let cachedCephS3Conn: CephS3Connection | null = null;
let cachedDashboardCreds: RgwDashboardS3Creds | null = null;
  async function rgwJson(subArgs: string[]): Promise<any> {
    const cmd = new Command(["radosgw-admin", ...subArgs, "--format", "json"], {
      superuser: "try", // same intent as before
    });
  
    try {
      const proc = await unwrap(server.execute(cmd));
      const stdout =
        typeof (proc as any).getStdout === "function"
          ? (proc as any).getStdout()
          : ((proc as any).stdout ?? "").toString();
  
      const text = (stdout ?? "").toString().trim();
  
      console.log("rgwJson args =", ["radosgw-admin", ...subArgs, "--format", "json"].join(" "));
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
    const { region: defaultRegion } = await getCephS3Connection();
  
    const detailed = await Promise.all(
      bucketNames.map((bucketName) =>
        buildS3BucketFromRgwStats(bucketName, defaultRegion)
      )
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

    gateways.push({id,hostname,zonegroup,zone,endpoint,isDefault,
    });

    console.log("RGW gateway from report:", {id,hostname,zonegroup,zone,frontendType,frontendConfig,endpoint,isDefault,
    });
  }

  return gateways;
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

    console.log("cephJson args =", ["ceph", ...subArgs, "--format", "json"].join(" "));
    console.log("cephJson stdout =", text);

    if (!text) return {};
    return JSON.parse(text);
  } catch (state: any) {
    console.error("cephJson error for", subArgs, state);
    throw new Error(errorString(state));
  }
}


export async function listRgwUsers(): Promise<RgwUser[]> {
  const uids: string[] = await rgwJson(["user", "list"]);

  const CONCURRENCY = 5;
  const users: RgwUser[] = [];

  let index = 0;

  async function worker() {
    while (index < uids.length) {
      const fullUid = uids[index++];
      const { tenant, uid } = splitTenantFromUid(fullUid);

      try {
        const info = await rgwJson(["user", "info", "--uid", fullUid]);
        const userQuota = info.user_quota || {};

        users.push({
          uid,
          tenant,
          displayName: info.display_name || info.displayName,
          email: info.email ?? undefined,
          suspended: !!info.suspended,
          maxBuckets:
            typeof info.max_buckets === "number" ? info.max_buckets : undefined,
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
        console.warn("Failed to fetch info for RGW user", fullUid, e);
        users.push({ uid, tenant } as RgwUser);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, uids.length) }, () =>
    worker()
  );

  await Promise.all(workers);

  users.sort(
    (a, b) => uids.indexOf((a.tenant ? `${a.tenant}$` : "") + a.uid) -
              uids.indexOf((b.tenant ? `${b.tenant}$` : "") + b.uid)
  );

  return users;
}


async function getDashboardS3Creds(): Promise<RgwDashboardS3Creds> {
  if (cachedDashboardCreds) return cachedDashboardCreds;

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

  cachedDashboardCreds = { accessKey, secretKey };
  return cachedDashboardCreds;
}
async function runAwsWithDashboardCreds(
  args: string[],
  endpointUrl: string
): Promise<any> {
  const { accessKey, secretKey } = await getDashboardS3Creds();

  const cmdLine =
    `AWS_ACCESS_KEY_ID='${accessKey}' ` +
    `AWS_SECRET_ACCESS_KEY='${secretKey}' ` +
    `AWS_DEFAULT_REGION='default' ` +
    `aws --endpoint-url '${endpointUrl}' ` +
    args.map((a) => `'${a}'`).join(" ");

  const cmd = new Command(["bash", "-lc", cmdLine], { superuser: "try" });
  console.log("cmd ", cmd);

  try {
    const proc = await unwrap(server.execute(cmd));
    const stdout =
      typeof (proc as any).getStdout === "function"
        ? (proc as any).getStdout()
        : ((proc as any).stdout ?? "").toString();

    const text = (stdout ?? "").toString().trim();
    if (text) {
      console.log("runAwsWithDashboardCreds stdout =", text);
      return text; // most s3api calls: JSON or text
    }
    return;
  } catch (state: any) {
    const stderr =
      typeof state?.getStderr === "function"
        ? state.getStderr()
        : String(state.stderr ?? "");

    const isCreateBucket =
      args.length >= 2 &&
      args[0] === "s3api" &&
      args[1] === "create-bucket";

    if (
      isCreateBucket &&
      stderr.includes("Unable to parse response (not well-formed (invalid token)") &&
      stderr.includes('"bucket_info"')
    ) {
      console.warn(
        "Ignoring aws XML parse error for create-bucket; RGW returned bucket_info JSON",
      );
      return; // soft success, verification will be done via head-bucket
    }

    console.error("runAwsWithDashboardCreds error", state);
    console.error("runAwsWithDashboardCreds stderr =", stderr);
    throw new Error(errorString(state));
  }
}



async function ensureBucketExists(
  bucketName: string,
  endpointUrl: string,
): Promise<void> {
  try {
    await runAwsWithDashboardCreds(
      ["s3api", "head-bucket", "--bucket", bucketName],
      endpointUrl,
    );
  } catch (err) {
    // If head-bucket fails, treat this as a real failure:
    // either create-bucket genuinely failed, or there is a connectivity/perm issue.
    throw new Error(
      `Bucket "${bucketName}" does not appear to exist after create-bucket: ${String(
        err,
      )}`,
    );
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

    // extra config
    tags?: Record<string, string>;
    encryptionMode?: "none" | "sse-s3" | "kms";
    kmsKeyId?: string;
    bucketPolicyJson?: string;
    aclRules?: CephAclRule[];

    objectLockEnabled?: boolean;
    objectLockMode?: "GOVERNANCE" | "COMPLIANCE";
    objectLockRetentionDays?: number;
    owner?: string;
  }
): Promise<void> {
  const endpointUrl = params.endpoint.startsWith("http")
    ? params.endpoint
    : `http://${params.endpoint}`;


  const cannedAcl = deriveCannedAclFromRules(params.aclRules);

  // 1) create bucket (optionally with object-lock flag and canned ACL)
  const createArgs = ["s3api", "create-bucket", "--bucket", params.bucketName];

  if (cannedAcl && cannedAcl !== "private") {
    // private is the default; only send if we actually want public/authenticated
    createArgs.push("--acl", cannedAcl);
  }

  if (params.objectLockEnabled) {
    createArgs.push("--object-lock-enabled-for-bucket");
  }

  await runAwsWithDashboardCreds(createArgs, endpointUrl);
  await ensureBucketExists(params.bucketName, endpointUrl);


  // 2) tags
  if (params.tags && Object.keys(params.tags).length) {
    const TagSet = Object.entries(params.tags).map(([Key, Value]) => ({
      Key,
      Value,
    }));

    const taggingJson = JSON.stringify({ TagSet });

    await runAwsWithDashboardCreds(
      ["s3api","put-bucket-tagging","--bucket",params.bucketName,"--tagging",taggingJson,
      ],
      endpointUrl,
      
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
      ["s3api","put-bucket-encryption","--bucket",params.bucketName,"--server-side-encryption-configuration",encryptionJson,
      ],
      endpointUrl,
      
    );
  }
  
  // 5) bucket policy
  if (params.bucketPolicyJson && params.bucketPolicyJson.trim()) {
    await runAwsWithDashboardCreds(
      ["s3api","put-bucket-policy","--bucket",params.bucketName,"--policy",params.bucketPolicyJson,
      ],
      endpointUrl,
      
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
      ["s3api","put-object-lock-configuration","--bucket",params.bucketName,"--object-lock-configuration",lockConfig,
      ],
      endpointUrl,
      
    );
  }

  // 7) finally, change bucket owner via radosgw-admin
  if (params.owner && params.owner.trim()) {
    await changeRgwBucketOwner(params.bucketName, params.owner.trim());
  }
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

    console.log("runRgwAdmin args =", ["radosgw-admin", ...args].join(" "));
    if (stdout) console.log("runRgwAdmin stdout =", stdout);
    if (stderr) console.log("runRgwAdmin stderr =", stderr);

    return { stdout, stderr };
  } catch (state: any) {
    console.error("runRgwAdmin error for", args.join(" "), state);
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

  const args: string[] = ["user","create",`--uid=${uid}`,`--display-name=${displayName}`,
  ];

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
async function rgwSetUserQuota(opts: {uid: string;tenant?: string;enabled: boolean;maxSizeKb?: number;maxObjects?: number;
}): Promise<void> {
  const { uid, tenant, enabled, maxSizeKb, maxObjects } = opts;
  if (!uid) throw new Error("rgwSetUserQuota: uid is required");
  if (!enabled) return;

  const setArgs: string[] = ["quota","set",`--uid=${uid}`,"--quota-scope=user",
  ];
  if (tenant) setArgs.push(`--tenant=${tenant}`);

  if (typeof maxSizeKb === "number") {
    setArgs.push("--max-size", `${maxSizeKb}K`);
  }

  if (typeof maxObjects === "number") {
    setArgs.push("--max-objects", String(maxObjects));
  }

  await runRgwAdmin(setArgs);

  const enableArgs: string[] = ["quota","enable",`--uid=${uid}`,"--quota-scope=user",
  ];
  if (tenant) enableArgs.push(`--tenant=${tenant}`);

  await runRgwAdmin(enableArgs);
}

async function rgwSetBucketQuota(opts: {uid: string;tenant?: string;enabled: boolean;maxSizeKb?: number;maxObjects?: number;
}): Promise<void> {
  const { uid, tenant, enabled, maxSizeKb, maxObjects } = opts;
  if (!uid) throw new Error("rgwSetBucketQuota: uid is required");
  if (!enabled) return;

  const setArgs: string[] = ["quota","set",`--uid=${uid}`,"--quota-scope=bucket",
  ];
  if (tenant) setArgs.push(`--tenant=${tenant}`);

  if (typeof maxSizeKb === "number") {
    setArgs.push("--max-size", `${maxSizeKb}K`);
  }

  if (typeof maxObjects === "number") {
    setArgs.push("--max-objects", String(maxObjects));
  }

  await runRgwAdmin(setArgs);

  const enableArgs: string[] = ["quota","enable",`--uid=${uid}`,"--quota-scope=bucket",
  ];
  if (tenant) enableArgs.push(`--tenant=${tenant}`);

  await runRgwAdmin(enableArgs);
}

export async function createRgwUser(
  opts: CreateRgwUserOptions
): Promise<CreatedRgwUserKeys> {
  const {uid,tenant,userQuotaEnabled,userQuotaMaxSizeKb,userQuotaMaxObjects,bucketQuotaEnabled,bucketQuotaMaxSizeKb,bucketQuotaMaxObjects,
  } = opts;

  const keys = await rgwUserCreateBase(opts);

  await rgwSetUserQuota({uid,tenant,enabled: !!userQuotaEnabled,maxSizeKb: userQuotaMaxSizeKb,maxObjects: userQuotaMaxObjects,
  });

  await rgwSetBucketQuota({uid,tenant,enabled: !!bucketQuotaEnabled,maxSizeKb: bucketQuotaMaxSizeKb,maxObjects: bucketQuotaMaxObjects,
  });

  return keys;
}

export async function deleteRgwUser(uid: string,opts?: {  tenant?: string;  purgeData?: boolean;  purgeKeys?: boolean;
  }
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


export async function updateRgwUser(
  opts: CreateRgwUserOptions
): Promise<void> {
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

  await rgwSetUserQuota({uid,tenant,enabled: !!userQuotaEnabled,maxSizeKb: userQuotaMaxSizeKb,maxObjects: userQuotaMaxObjects,
  });

  await rgwSetBucketQuota({uid,tenant,enabled: !!bucketQuotaEnabled,maxSizeKb: bucketQuotaMaxSizeKb,maxObjects: bucketQuotaMaxObjects,
  });
}

export async function getRgwUserInfo(
  uid: string,
  tenant?: string
): Promise<RgwUserDetails> {
  if (!uid) {
    throw new Error("getRgwUserInfo: uid is required");
  }

  const fullUid = tenant ? `${tenant}$${uid}` : uid;

  const args: string[] = ["user", "info", `--uid=${fullUid}`];
  const info = await rgwJson(args);

  const userQuota = info.user_quota || {};
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

  // Decode tenant/uid from the actual user_id that RGW returns
  const fullUserId = info.user_id || info.uid || fullUid;
  const { tenant: decodedTenant, uid: shortUid } = splitTenantFromUid(fullUserId);

  const details: RgwUserDetails = {
    uid: shortUid,
    tenant: decodedTenant,
    displayName: info.display_name || info.displayName,
    email: info.email ?? undefined,
    suspended: !!info.suspended,
    maxBuckets:
      typeof info.max_buckets === "number" ? info.max_buckets : undefined,
    capacityLimitPercent:
      typeof userQuota.max_size_kb === "number"
        ? userQuota.max_size_kb
        : undefined,
    objectLimitPercent:
      typeof userQuota.max_objects === "number"
        ? userQuota.max_objects
        : undefined,
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
    uid: fullUid.slice(idx + 1),
  };
}


export async function updateCephBucketFromForm(
  form: CephBucketUpdatePayload,
  gateway: RgwGateway
): Promise<void> {
  const endpointUrl = gateway.endpoint;
  const region = form.region || "us-east-1";
  const tags = parseTagsText(form.tagsText) ?? {};

  const objectLockMode = form.cephObjectLockMode;
  const objectLockRetentionDays =
    form.cephObjectLockRetentionDays != null &&
    form.cephObjectLockRetentionDays !== ""
      ? Number(form.cephObjectLockRetentionDays)
      : undefined;

  await updateCephBucketViaS3({
    bucketName: form.name,
    endpoint: endpointUrl,
    region,
    versioningEnabled: form.cephVersioningEnabled,
    tags,
    encryptionMode: form.cephEncryptionMode,
    kmsKeyId: form.cephKmsKeyId,

    bucketPolicyJson: form.bucketPolicyText ?? null,
    aclRules: form.cephAclRules,
    objectLockMode,
    objectLockRetentionDays,
    owner: form.owner,
  });
}

function parseTagsText(tagsText?: string): Record<string, string> | undefined {
  const text = (tagsText || "").trim();
  if (!text) return undefined;

  const tags: Record<string, string> = {};

  for (const pair of text.split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    if (!key || !value) continue;
    tags[key] = value;
  }

  return Object.keys(tags).length ? tags : undefined;
}
export async function updateCephBucketViaS3(
  params: {
    bucketName: string;
    endpoint: string;
    region?: string;

    // patches; if a field is undefined, we leave it as-is
    versioningEnabled?: boolean;

    tags?: Record<string, string> | null;

    encryptionMode?: "none" | "sse-s3" | "kms";
    kmsKeyId?: string;

    bucketPolicyJson?: string | null;
    aclRules?: CephAclRule[];

    objectLockMode?: "GOVERNANCE" | "COMPLIANCE";
    objectLockRetentionDays?: number;

    owner?: string; // RGW uid, if you want to change owner
  }
): Promise<void> {
  const endpointUrl = params.endpoint.startsWith("http")
    ? params.endpoint
    : `http://${params.endpoint}`;

  const region = params.region || "us-east-1";

  // 1) Versioning
  if (typeof params.versioningEnabled === "boolean") {
    const versioningJson = JSON.stringify({
      Status: params.versioningEnabled ? "Enabled" : "Suspended",
    });

    await runAwsWithDashboardCreds(
      ["s3api","put-bucket-versioning","--bucket",params.bucketName,"--versioning-configuration",versioningJson,
      ],
      endpointUrl,
    );
  }

  // 2) Tags
  if (params.tags !== undefined) {
    const tags = params.tags || {};
    if (Object.keys(tags).length > 0) {
      const TagSet = Object.entries(tags).map(([Key, Value]) => ({
        Key,
        Value,
      }));
      const taggingJson = JSON.stringify({ TagSet });

      await runAwsWithDashboardCreds(
        ["s3api","put-bucket-tagging","--bucket",params.bucketName,"--tagging",taggingJson,
        ],
        endpointUrl,
      );
    } else {
      // explicit "clear tags"
      await runAwsWithDashboardCreds(
        ["s3api", "delete-bucket-tagging", "--bucket", params.bucketName],
        endpointUrl,
        
      );
    }
  }

  // 3) Encryption
  if (params.encryptionMode !== undefined) {
    if (params.encryptionMode === "none") {
      await runAwsWithDashboardCreds(
        ["s3api", "delete-bucket-encryption", "--bucket", params.bucketName],
        endpointUrl,
      );
    } else {
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

      const encryptionJson = JSON.stringify({ Rules: rules });

      await runAwsWithDashboardCreds(
        ["s3api","put-bucket-encryption","--bucket",params.bucketName,"--server-side-encryption-configuration",encryptionJson,
        ],
        endpointUrl,
      );
    }
  }

  // 4) ACL
  if (params.aclRules && params.aclRules.length > 0) {
    const cannedAcl = deriveCannedAclFromRules(params.aclRules);
    if (cannedAcl) {
      await runAwsWithDashboardCreds(
        ["s3api", "put-bucket-acl", "--bucket", params.bucketName, "--acl", cannedAcl],
        endpointUrl,
      );
    }
  }

  // 5) Bucket policy
  if (params.bucketPolicyJson !== undefined) {
    const text = params.bucketPolicyJson?.trim() ?? "";

    if (text) {
      await runAwsWithDashboardCreds(
        ["s3api","put-bucket-policy","--bucket",params.bucketName,"--policy",text,
        ],
        endpointUrl,
        
      );
    } else {
      await runAwsWithDashboardCreds(
        ["s3api", "delete-bucket-policy", "--bucket", params.bucketName],
        endpointUrl,
        
      );
    }
  }

  // 6) Object lock configuration (only if bucket already has locking enabled)
  if (
    params.objectLockMode &&
    typeof params.objectLockRetentionDays === "number"
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
      ["s3api","put-object-lock-configuration","--bucket",params.bucketName,"--object-lock-configuration",lockConfig,
      ],
      endpointUrl,
      
    );
  }

  // 7) Change RGW owner (radosgw-admin bucket link)
  if (params.owner && params.owner.trim()) {
    await changeRgwBucketOwner(params.bucketName, params.owner.trim());
  }
}


async function awsJsonOrNullWithDashboardCreds(
  args: string[],
  endpointOverride?: string,
  regionOverride?: string
): Promise<any | null> {
  const { endpointUrl: defaultEndpoint, region: defaultRegion } =
    await getCephS3Connection();

  const endpointUrl =
    endpointOverride && endpointOverride.length
      ? endpointOverride.startsWith("http")
        ? endpointOverride
        : `http://${endpointOverride}`
      : defaultEndpoint;

  const region = regionOverride || defaultRegion;

  const { accessKey, secretKey } = await getDashboardS3Creds();

  const cmdLine =
  `AWS_ACCESS_KEY_ID='${accessKey}' ` +
  `AWS_SECRET_ACCESS_KEY='${secretKey}' ` +
  `AWS_DEFAULT_REGION='${region}' ` +
  `AWS_DEFAULT_OUTPUT='json' ` + // override bad config (xml)
  `aws --output json --endpoint-url '${endpointUrl}' ` + // force json output
  args.map((a) => `'${a}'`).join(" ");

  const cmd = new Command(["bash", "-lc", cmdLine], { superuser: "try" });

  try {
    const proc = await unwrap(server.execute(cmd));
    const stdout =
      typeof (proc as any).getStdout === "function"
        ? (proc as any).getStdout()
        : ((proc as any).stdout ?? "").toString();

    const text = (stdout ?? "").toString().trim();
    console.log("awsJsonOrNullWithDashboardCreds stdout =", text);
    if (!text) return {};
    return JSON.parse(text);
  } catch (state: any) {
    const stderr =
      typeof state?.getStderr === "function"
        ? state.getStderr()
        : String(state.stderr ?? "");
    console.warn(
      "awsJsonOrNullWithDashboardCreds error for",
      args.join(" "),
      "stderr=",
      stderr
    );
    return null;
  }
}
async function getCephS3Connection(): Promise<CephS3Connection> {
  if (cachedCephS3Conn) return cachedCephS3Conn;

  // 1) Optional env overrides
  const envEndpoint = process.env.CEPH_S3_ENDPOINT;
  const envRegion = process.env.CEPH_S3_REGION;

  if (envEndpoint) {
    const endpointUrl = envEndpoint.startsWith("http")
      ? envEndpoint
      : `http://${envEndpoint}`;

    cachedCephS3Conn = {
      endpointUrl,
      region: envRegion || "us-east-1",
    };
    return cachedCephS3Conn;
  }

  // 2) Derive from RGW servicemap
  const gateways = await listRgwGateways();
  const gw = gateways.find((g) => g.isDefault) || gateways[0];

  if (!gw) {
    throw new Error("No RGW gateways found to derive Ceph S3 endpoint");
  }

  const endpointUrl = gw.endpoint.startsWith("http")
    ? gw.endpoint
    : `http://${gw.endpoint}`;

  const region = gw.zone || gw.zonegroup || "us-east-1";

  cachedCephS3Conn = { endpointUrl, region };
  return cachedCephS3Conn;
}


async function buildS3BucketFromRgwStats(
  bucketName: string,
  defaultRegion: string
): Promise<S3Bucket> {
  const stats = await rgwJson([
    "bucket",
    "stats",
    "--bucket",
    bucketName,
  ]);

  const owner: string | undefined = stats.owner;
  const creationTime: string | undefined = stats.creation_time;
  const lastModifiedTime: string | undefined = stats.mtime;

  const usage = stats.usage || {};
  const usageKey =
    "rgw.main" in usage ? "rgw.main" : Object.keys(usage)[0];
  const usageMain = usageKey ? usage[usageKey] || {} : {};

  const sizeBytes: number = usageMain.size ?? 0;
  const objectCount: number = usageMain.num_objects ?? 0;
  const versionCount: number | undefined = usageMain.num_object_versions;

  const region: string =
    stats.zone || stats.zonegroup || "ceph-default-zone";

  // Enrich with S3 metadata
  let tags: Record<string, string> | undefined;
  let versioning: "Enabled" | "Suspended" | "Disabled" = "Disabled";
  let objectLockEnabled = false;
  let acl: CephAclRule[] | undefined;

  const regionForAws = region || defaultRegion;

  // Tags
  const taggingJson = await awsJsonOrNullWithDashboardCreds(
    ["s3api", "get-bucket-tagging", "--bucket", bucketName],
    undefined,
    regionForAws
  );
  if (taggingJson && Array.isArray(taggingJson.TagSet)) {
    tags = {};
    for (const t of taggingJson.TagSet as Array<{ Key: string; Value: string }>) {
      if (t.Key) {
        tags[t.Key] = t.Value ?? "";
      }
    }
  }

  // Versioning
  const versioningJson = await awsJsonOrNullWithDashboardCreds(
    ["s3api", "get-bucket-versioning", "--bucket", bucketName],
    undefined,
    regionForAws
  );
  if (versioningJson && typeof versioningJson.Status === "string") {
    if (
      versioningJson.Status === "Enabled" ||
      versioningJson.Status === "Suspended"
    ) {
      versioning = versioningJson.Status;
    }
  }

  // Object lock
  const lockJson = await awsJsonOrNullWithDashboardCreds(
    ["s3api", "get-object-lock-configuration", "--bucket", bucketName],
    undefined,
    regionForAws
  );
  if (
    lockJson &&
    lockJson.ObjectLockConfiguration &&
    lockJson.ObjectLockConfiguration.ObjectLockEnabled === "Enabled"
  ) {
    objectLockEnabled = true;
  }
  const aclJson = await awsJsonOrNullWithDashboardCreds(
    ["s3api", "get-bucket-acl", "--bucket", bucketName],
    undefined,
    regionForAws
  );

  if (aclJson && Array.isArray(aclJson.Grants)) {
    const rules: CephAclRule[] = [];

    for (const g of aclJson.Grants as any[]) {
      if (!g || !g.Grantee || !g.Permission) continue;
      const perm = g.Permission as CephAclPermission;

      if (g.Grantee.Type === "Group" && typeof g.Grantee.URI === "string") {
        if (g.Grantee.URI.endsWith("/AllUsers")) {
          rules.push({ grantee: "all-users", permission: perm });
        } else if (g.Grantee.URI.endsWith("/AuthenticatedUsers")) {
          rules.push({ grantee: "authenticated-users", permission: perm });
        }
      } else if (g.Grantee.Type === "CanonicalUser") {
        // Treat canonical user as "owner"
        rules.push({ grantee: "owner", permission: perm });
      }
    }

    if (rules.length) {
      acl = rules;
    }
  }

  let policy: string | undefined;

  const policyJson = await awsJsonOrNullWithDashboardCreds(
    ["s3api", "get-bucket-policy", "--bucket", bucketName],
    undefined,
    regionForAws
  );

  console.log("policjson ", policyJson)
  if (policyJson && typeof policyJson.Policy === "string") {
    try {
      // Pretty-print it for the textarea
      const parsed = JSON.parse(policyJson.Policy);
      policy = JSON.stringify(parsed, null, 2);
    } catch {
      // If parsing fails, just store the raw string
      policy = policyJson.Policy;
    }
  }
  return {name: bucketName,createdAt: creationTime,lastModifiedTime,region,owner,objectCount,sizeBytes,versionCount,acl,policy,tags,versioning,objectLockEnabled,
  };
}


function deriveCannedAclFromRules(
  rules?: CephAclRule[],
):
  | "private"
  | "public-read"
  | "public-read-write"
  | "authenticated-read"
  | null {
  if (!rules || rules.length === 0) return null;

  const auth = rules.find((r) => r.grantee === "authenticated-users");
  const all  = rules.find((r) => r.grantee === "all-users");
  if (all) {
    if (all.permission === "READ") {
      return "public-read";
    }
    if (all.permission === "READ_WRITE" || all.permission === "FULL_CONTROL") {
      return "public-read-write";
    }
  }

  if (auth) {
    if (
      auth.permission === "READ" ||
      auth.permission === "READ_WRITE" ||
      auth.permission === "FULL_CONTROL"
    ) {
      return "authenticated-read";
    }
  }
  return "private";
}
