// minioCliAdapter.ts
import type {
    S3Bucket,
    Endpoint,
    BucketVersioningStatus,
    BucketAcl,
  } from "../types/types";
  
  import { legacy } from "../../../../../houston-common/houston-common-lib";
  const { errorString, useSpawn } = legacy;
  
  // Use the same alias you configured with `mc alias set`
  const MINIO_ALIAS = process.env.MINIO_MC_ALIAS || "gw01";
  
  /**
   * Run `mc` with --json and return parsed JSON lines.
   * Many `mc` commands output one JSON object per line.
   */
  async function mcJsonLines(subArgs: string[]): Promise<any[]> {
    const args = ["mc", "--json", ...subArgs];
  
    const proc = useSpawn(args, {
      superuser: "try",
    });
  
    try {
      const { stdout } = await proc.promise();
      const text = (stdout ?? "").toString().trim();
  
      console.log("mcJsonLines args =", args.join(" "));
      console.log("mcJsonLines raw stdout =", text);
  
      if (!text) return [];
  
      // mc usually prints one JSON per line
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.map((line) => JSON.parse(line));
    } catch (state: any) {
      console.error("mcJsonLines error for", subArgs, state);
      throw new Error(errorString(state));
    }
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
   * Uses MinIO’s internal usage metrics (like the Ceph `bucket stats` call).
   */
  async function getMinioBucketStats(bucketName: string): Promise<{
    createdAt?: string;
    region?: string;
    objectCount: number;
    sizeBytes: number;
    versionsCount?: number;
  }> {
    const stat = await mcJsonSingle([
      "stat",
      `${MINIO_ALIAS}/${bucketName}`,
    ]);
  
    // The exact field names can vary slightly; these are defensive lookups
    const createdAt: string | undefined =
      stat.time ||
      stat.lastModified ||
      stat.LastModified ||
      stat.Created ||
      undefined;
  
    // Region / location – MinIO exposes bucket location similar to S3
    const region: string | undefined =
      stat.Location ||
      stat.location ||
      (stat.Properties && (stat.Properties.Location || stat.Properties.location)) ||
      undefined;
  
    // Usage structure from mc stat JSON: Usage.totalSize, Usage.objectsCount, Usage.versionsCount
    const usage = stat.Usage || stat.usage || {};
    const sizeBytes: number = usage.totalSize ?? usage.size ?? 0;
    const objectCount: number = usage.objectsCount ?? usage.objects ?? 0;
    const versionsCount: number | undefined =
      usage.versionsCount ?? usage.versions ?? undefined;
  
    return {
      createdAt,
      region,
      objectCount,
      sizeBytes,
      versionsCount,
    };
  }
  
  /**
   * Get bucket tags via `mc tag list --json <ALIAS>/<bucket>`.
   * MinIO models tags like S3; we convert them into a simple key/value object.
   */
  async function getMinioBucketTags(
    bucketName: string
  ): Promise<Record<string, string> | undefined> {
    try {
      const lines = await mcJsonLines([
        "tag",
        "list",
        `${MINIO_ALIAS}/${bucketName}`,
      ]);
  
      if (!lines.length) return undefined;
  
      // Depending on mc version, tags may appear under .tags or .Tags
      const aggregate: Record<string, string> = {};
  
      for (const entry of lines) {
        const tags = entry.tags || entry.Tags || entry.tagset || {};
        for (const [k, v] of Object.entries(tags)) {
          aggregate[String(k)] = String(v);
        }
      }
  
      return Object.keys(aggregate).length ? aggregate : undefined;
    } catch (err) {
      // If bucket has no tags, mc exits non-zero; treat as "no tags"
      console.warn("getMinioBucketTags error, treating as no tags:", err);
      return undefined;
    }
  }
  
  /**
   * List buckets from MinIO and enrich them with usage, region, tags, etc.
   * Mirrors the Ceph RGW adapter’s `listBuckets()` shape.
   */
  export async function listBucketsFromMinio(): Promise<S3Bucket[]> {
    // 1) List buckets: `mc --json ls <ALIAS>`
    const entries = await mcJsonLines(["ls", MINIO_ALIAS]);
  
    // Filter only bucket entries (type can be 'folder' or 'bucket' depending on mc)
    const bucketEntries = entries.filter(
      (e) => e.type === "folder" || e.type === "bucket"
    );
    
  
    const detailed = await Promise.all(
      bucketEntries.map(async (entry) => {
        // Bucket name – mc usually exposes `key` or `name`
        const rawName: string =
          entry.key || entry.name || entry.bucket || entry.target || "";
          const bucketName = rawName.replace(/\/$/, "");

        if (!bucketName) {
          console.warn("Skipping bucket entry with no name:", entry);
          return undefined;
        }
  
        // 2) Per-bucket stats (usage, object count, region, createdAt)
        const {
          createdAt,
          region,
          objectCount,
          sizeBytes,
          versionsCount,
        } = await getMinioBucketStats(bucketName);
  
        // 3) Tags (owner etc can be modelled as tags if you want)
        const tags = await getMinioBucketTags(bucketName);
  
        // MinIO doesn’t expose a “bucket owner” the same way Ceph RGW does.
        // You can encode an "owner" tag and read it here, if you like:
        const owner: string | undefined =
          (tags && (tags.owner || tags.Owner || tags.bucketOwner)) || undefined;
  
        // Versioning: use bucket versioning status if you want, or infer from stats
        const versioningStatus: BucketVersioningStatus | undefined =
          versionsCount && versionsCount > 0 ? "Enabled" : "Suspended";
  
        const acl: BucketAcl | undefined = undefined;
        const policy: string | undefined = undefined;
        const lastAccessed: string | undefined = undefined;
  
        const bucket: S3Bucket = {
          name: bucketName,
          createdAt,
          region: region || "minio-default-region",
          owner,
          acl,
          policy,
          objectCount,
          sizeBytes,
        };
  
        return bucket;
      })
    );
  
    // Filter out any undefined entries (if a bucket entry couldn’t be parsed)
    return detailed.filter((b): b is S3Bucket => Boolean(b));
  }
  
  /**
   * Object-level stats for a single bucket using `mc stat --json`.
   * Very close in spirit to your Ceph `getBucketObjectStats`.
   */
  export async function getBucketObjectStatsFromMinio(
    _endpoint: Endpoint,
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
  
  export async function isMinioHealthy(): Promise<boolean> {
    try {
      // This will throw if alias/endpoint is wrong or MinIO is down
      await mcJsonSingle(["admin", "info", MINIO_ALIAS]);
      return true;
    } catch (e) {
      console.warn("MinIO health check failed:", e);
      return false;
    }
  }


  export async function deleteBucketFromMinio(
    bucketName: string,
    options?: { force?: boolean }
  ): Promise<void> {
    const args = [
      "mc",
      "rb",
      `${MINIO_ALIAS}/${bucketName}`,
    ];
  
    // Force delete (remove contents + bucket) – defaults to true
    if (options?.force ?? true) {
      args.push("--force", "--dangerous");
    }
  
    const proc = useSpawn(args, {
      superuser: "try",
    });
  
    try {
      const { stdout, stderr } = await proc.promise();
      console.log("deleteBucketFromMinio args =", args.join(" "));
      if (stdout) console.log("deleteBucketFromMinio stdout =", stdout.toString());
      if (stderr) console.log("deleteBucketFromMinio stderr =", stderr.toString());
    } catch (state: any) {
      console.error("deleteBucketFromMinio error for", bucketName, state);
      throw new Error(errorString(state));
    }
  }
  
  export interface CreateBucketInMinioOptions {
    region?: string;         
    withLock?: boolean;       
    withVersioning?: boolean; 
    quotaSize?: string;
    quotaObjects?: number;
    ignoreExisting?: boolean;
  }
  
  export async function createBucketFromMinio(
    bucketName: string,
    options: CreateBucketInMinioOptions = {}
  ): Promise<void> {
    if (!bucketName) {
      throw new Error("createBucketFromMinio: bucketName is required");
    }
  
    const {
      region,
      withLock,
      withVersioning,
      quotaSize,
      ignoreExisting,
    } = options;
  
    const bucketPath = `${MINIO_ALIAS}/${bucketName}`;
    const mbArgs = ["mc", "mb"];
    if (ignoreExisting) {
      mbArgs.push("--ignore-existing");
    }
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
  
    {
      const proc = useSpawn(mbArgs, {
        superuser: "try",
      });
  
      try {
        const { stdout, stderr } = await proc.promise();
        console.log("createBucketFromMinio mb args =", mbArgs.join(" "));
        if (stdout) console.log("createBucketFromMinio mb stdout =", stdout.toString());
        if (stderr) console.log("createBucketFromMinio mb stderr =", stderr.toString());
      } catch (state: any) {
        console.error("createBucketFromMinio mb error for", bucketPath, state);
        throw new Error(errorString(state));
      }
    }
  
    //
    // 2) Quota: mc quota set ...
    //
    const hasSizeQuota =
      typeof quotaSize === "string" && quotaSize.trim().length > 0;

  
    if (hasSizeQuota ) {
      const quotaArgs = ["mc", "quota", "set"];
  
      if (hasSizeQuota) {
        quotaArgs.push("--size", quotaSize!.trim());
      }

  
      quotaArgs.push(bucketPath);
  
      const proc = useSpawn(quotaArgs, {
        superuser: "try",
      });
  
      try {
        const { stdout, stderr } = await proc.promise();
        console.log("createBucketFromMinio quota args =", quotaArgs.join(" "));
        if (stdout) {
          console.log(
            "createBucketFromMinio quota stdout =",
            stdout.toString()
          );
        }
        if (stderr) {
          console.log(
            "createBucketFromMinio quota stderr =",
            stderr.toString()
          );
        }
      } catch (state: any) {
        console.error(
          "createBucketFromMinio quota error for",
          bucketPath,
          state
        );
        throw new Error(
          `Bucket "${bucketPath}" created, but failed to set quota: ${errorString(
            state
          )}`
        );
      }
    }
  }
  