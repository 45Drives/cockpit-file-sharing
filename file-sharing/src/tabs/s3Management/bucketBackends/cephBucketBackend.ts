// backends/cephBucketBackend.ts
import type { BucketBackend, BackendContext, BucketCreateForm, BucketEditForm } from "./bucketBackend";
import type { CephBucket } from "../types/types";
import { parseTags } from "./bucketUtils";

import {listBucketsFromCeph,createCephBucketViaS3,updateCephBucketViaS3,deleteBucketFromCeph,getCephBucketSecurity,rgwJson,
  buildS3BucketFromRgwStats,listRgwPlacementTargets, listRGWUserNames
} from "../api/cephCliAdapter";



export const cephBucketBackend: BucketBackend<CephBucket> = {
  label: "Ceph RGW",

  async listBuckets(_ctx: BackendContext): Promise<CephBucket[]> {
    return listBucketsFromCeph();
  },

  async createBucket(form: BucketCreateForm, ctx: BackendContext): Promise<void> {
      if (form.backend !== "ceph") {
    throw new Error("Ceph backend received non-ceph form");
  }

    const tags = parseTags(form.tagsText || "");

    await createCephBucketViaS3({
      bucketName: form.name,
      endpoint: ctx.cephGateway?.endpoint ?? "",
      tags: Object.keys(tags).length ? tags : undefined,
      encryptionMode: form.encryptionMode,
      kmsKeyId: form.kmsKeyId || undefined,
      bucketPolicy: form.bucketPolicy || undefined,
      owner: form.ownerUid,
      aclRules: form.aclRules,
      objectLockEnabled: form.objectLockEnabled,
      objectLockMode: form.objectLockMode,
      objectLockRetentionDays: form.objectLockRetentionDays,
      placementTarget: form.placementTarget || undefined,
    });
  },

  async updateBucket(bucket: CephBucket, form: BucketEditForm, ctx: BackendContext): Promise<void> {
    if (form.backend !== "ceph") {
      throw new Error("Ceph backend received non-ceph form");
    }

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
      bucketName: bucket.adminRef,
      endpoint: ctx.cephGateway?.endpoint ?? "",
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
    params.aclRules = form.cephAclRules
    
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
  
    const names: string[] = await rgwJson(["bucket", "list"]);
    const shells = names.map((n) => shellCephBucket(n));
  
    // Fire-and-forget: rgwJson itself is globally concurrency-limited now
    void Promise.all(
      shells.map(async (b) => {
        try {
          const stats = await rgwJson(["bucket", "stats", "--bucket", b.adminRef]);
          const full = buildS3BucketFromRgwStats(stats);
          onUpdate({ ...b, ...full });
        } catch {
          // leave shell
        }
      }),
    );
    console.log("shells ", shells)
    return shells;
  },

  async prepareCreate(_ctx) {
    const [cephUsers, cephPlacementTargets] = await Promise.all([
      listRGWUserNames(),
      listRgwPlacementTargets(),
    ]);

    return { cephUsers, cephPlacementTargets };
  },

  async prepareEdit(bucket, ctx) {
    const hydrated = await hydrateCephBucket(bucket);
    const deps = await this.prepareCreate!(ctx);
    return { bucket: hydrated, deps };
  },
};
export async function hydrateCephBucket(
  bucket: CephBucket,
): Promise<CephBucket> {

  const { acl, policy } = await getCephBucketSecurity(bucket.adminRef.replace("/",":"));
  return {
    ...bucket,
    acl,
    policy,
  };
}

function shellCephBucket(name: string): CephBucket {
  return {
    backendKind: "ceph",
    name,
    adminRef: name,
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


