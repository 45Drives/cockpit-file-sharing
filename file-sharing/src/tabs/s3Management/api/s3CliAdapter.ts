// cephRgwCliAdapter.ts
import type {
  S3Bucket,
  Endpoint,
  BucketVersioningStatus,
  BucketAcl,
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
      // 2) Per-bucket stats from RGW admin
      const stats = await rgwJson([
        "bucket",
        "stats",
        "--bucket",
        bucketName,
      ]);


      const owner: string | undefined = stats.owner;
      const creationTime: string | undefined = stats.creation_time;

      // Pick a usage entry (usually "rgw.main")
      const usage = stats.usage || {};
      const usageKey = "rgw.main" in usage ? "rgw.main" : Object.keys(usage)[0];
      const usageMain = usageKey ? usage[usageKey] || {} : {};

      const sizeBytes: number = usageMain.size ?? 0;
      const objectCount: number = usageMain.num_objects ?? 0;
      const versionsCount: number | undefined = usageMain.num_object_versions;

      // Ceph doesn't have a true S3 "region"; use zone/zonegroup as a proxy
      const region: string =
        stats.zone || stats.zonegroup || "ceph-default-zone";

      

      // Tags, ACL, policy, last accessed are not filled via RGW admin
      const acl: BucketAcl | undefined = undefined;
      const policy: string | undefined = undefined;
      const tags: Record<string, string> | undefined = undefined;
      const lastAccessed: string | undefined = undefined;

      return {
        name: bucketName,
        createdAt: creationTime,
        region,
        owner,
        acl,
        policy,
        objectCount,
        sizeBytes,
        tags,
        lastAccessed,
        versionsCount,
      } as S3Bucket;
    })
  );

  return detailed;
}

/**
 * If you still want object-level stats independently of `bucket stats`,
 * you can keep a helper like this (optional).
 * This uses RGW admin bucket stats only, no S3 listing.
 */
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
