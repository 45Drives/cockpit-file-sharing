// backends/cephBucketBackend.ts
import type { BucketBackend, BackendContext, BucketCreateForm, BucketEditForm } from "./bucketBackend";
import type { CephBucket } from "../types/types";
import { parseTags } from "./bucketUtils";

import {listBucketsFromCeph,createCephBucketViaS3,updateCephBucketViaS3,deleteBucketFromCeph,getCephBucketSecurity,rgwJson,getCephS3Connection,buildS3BucketFromRgwStats,
} from "../api/s3CliAdapter";



export const cephBucketBackend: BucketBackend<CephBucket> = {
  label: "Ceph RGW",

  async listBuckets(_ctx: BackendContext): Promise<CephBucket[]> {
    return listBucketsFromCeph();
  },

  async createBucket(form: BucketCreateForm, ctx: BackendContext): Promise<void> {
      if (form.backend !== "ceph") {
    throw new Error("Ceph backend received non-ceph form");
  }
    const region =
      form.placementTarget || ctx.cephGateway?.zone || "us-east-1";

    const tags = parseTags(form.tagsText || "");

    await createCephBucketViaS3({
      bucketName: form.name,
      endpoint: ctx.cephGateway?.endpoint ?? "http://192.168.85.64:8080",
      tags: Object.keys(tags).length ? tags : undefined,
      encryptionMode: form.encryptionMode,
      kmsKeyId: form.kmsKeyId || undefined,
      bucketPolicy: form.bucketPolicy || undefined,
      owner: form.ownerUid,
      aclRules: form.aclRules,
      objectLockEnabled: form.objectLockEnabled,
      objectLockMode: form.objectLockMode,
      objectLockRetentionDays: form.objectLockRetentionDays
    });
  },

  async updateBucket(bucket: CephBucket, form: BucketEditForm, ctx: BackendContext): Promise<void> {
    if (form.backend !== "ceph") {
      throw new Error("Ceph backend received non-ceph form");
    }
    // const region =
    //   form.placementTarget ||
    //   form.region ||
    //   ctx.cephGateway?.zone ||
    //   "us-east-1";

    const parsedTags = parseTags(form.tagsText || "");
    const newTags: Record<string, string> | null =
      Object.keys(parsedTags).length ? parsedTags : null;

    const newVersioningEnabled = !!form.cephVersioningEnabled;
    const oldVersioningEnabled = bucket.versioning === "Enabled";
    const versioningChanged = newVersioningEnabled !== oldVersioningEnabled;

    const oldTags: Record<string, string> | null =
      bucket.tags && Object.keys(bucket.tags).length ? bucket.tags : null;

    const tagsChanged =
      (oldTags === null && newTags !== null) ||
      (oldTags !== null && newTags === null) ||
      (oldTags !== null &&
        newTags !== null &&
        (Object.keys(oldTags).length !== Object.keys(newTags).length ||
          Object.entries(oldTags).some(([k, v]) => newTags[k] !== v)));

    let tagsOption: Record<string, string> | null | undefined = undefined;
    if (tagsChanged) {
      tagsOption = newTags === null ? {} : newTags;
    }

    const policyText = (form.bucketPolicy ?? "").trim();
    const bucketPolicyOption: string | null =
    policyText ? policyText : null;

    const newOwner = (form.owner || "").trim();
    const oldOwner = bucket.owner || "";
    const ownerChanged = newOwner && newOwner !== oldOwner;

    const params: any = {
      bucketName: bucket.name,
      endpoint: ctx.cephGateway?.endpoint ?? "http://192.168.85.64:8080",
      // region,
    };

    if (versioningChanged) {
      params.versioningEnabled = newVersioningEnabled;
    }
    if (tagsOption !== undefined) {
      params.tags = tagsOption;
    }
      params.bucketPolicy = bucketPolicyOption;
    
    if (ownerChanged) {
      params.owner = newOwner;
    }

    await updateCephBucketViaS3(params);

    // sync local
    if (versioningChanged) {
      bucket.versioning = newVersioningEnabled ? "Enabled" : "Suspended";
    }
    if (tagsChanged) {
      bucket.tags = newTags ?? undefined;
    }
    if (ownerChanged) {
      bucket.owner = newOwner;
    }
  },

  async deleteBucket(bucket: CephBucket): Promise<void> {
    await deleteBucketFromCeph(bucket.name, { purgeObjects: true });
  },
  async listBucketsProgressive(
    _ctx: BackendContext,
    onUpdate: (bucket: CephBucket) => void,
  ): Promise<CephBucket[]> {
    const { region: defaultRegion } = await getCephS3Connection();
  
    const names: string[] = await rgwJson(["bucket", "list"]);
    const shells = names.map((n) => shellCephBucket(n, defaultRegion));
  
    // Fire-and-forget: rgwJson itself is globally concurrency-limited now
    void Promise.all(
      shells.map(async (b) => {
        try {
          const stats = await rgwJson(["bucket", "stats", "--bucket", b.name]);
          const full = buildS3BucketFromRgwStats(stats, defaultRegion);
          onUpdate({ ...b, ...full });
        } catch {
          // leave shell
        }
      }),
    );
  
    return shells;
  },
};
export async function hydrateCephBucket(
  bucket: CephBucket,
): Promise<CephBucket> {
  const { acl, policy } = await getCephBucketSecurity(bucket.name);
  return {
    ...bucket,
    acl,
    policy,
  };
}

function shellCephBucket(name: string, defaultRegion: string): CephBucket {
  return {
    backendKind: "ceph",
    name,
    region: defaultRegion || "ceph-default-zone",

    owner: undefined,
    createdAt: undefined,
    lastModifiedTime: undefined,

    sizeBytes: undefined,
    objectCount: undefined,
    versionCount: undefined,

    quotaBytes: undefined,
    objectLockEnabled: false,
    versioning: undefined,
    tags: undefined,

    zone: undefined,
    zonegroup: undefined,
    placementTarget: undefined,

    acl: undefined,
    policy: undefined,
    lastAccessed: undefined,
  };
}


