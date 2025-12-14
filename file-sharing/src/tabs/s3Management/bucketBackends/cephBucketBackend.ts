// backends/cephBucketBackend.ts
import type { BucketBackend, BucketFormData, BackendContext } from "./bucketBackend";
import type { CephBucket } from "../types/types";
import { parseTags } from "./bucketUtils";

import {listBucketsFromCeph,createCephBucketViaS3,updateCephBucketViaS3,deleteBucketFromCeph,getCephBucketSecurity
} from "../api/s3CliAdapter";

export const cephBucketBackend: BucketBackend<CephBucket> = {
  label: "Ceph RGW",

  async listBuckets(_ctx: BackendContext): Promise<CephBucket[]> {
    return listBucketsFromCeph();
  },

  async createBucket(form: BucketFormData, ctx: BackendContext): Promise<void> {
    const region =
      form.cephPlacementTarget || ctx.cephGateway?.zone || "us-east-1";

    const tags = parseTags(form.tagsText || "");

    await createCephBucketViaS3({
      bucketName: form.name,
      endpoint: ctx.cephGateway?.endpoint ?? "http://192.168.85.64:8080",
      tags: Object.keys(tags).length ? tags : undefined,
      encryptionMode: form.cephEncryptionMode,
      kmsKeyId: form.cephKmsKeyId || undefined,
      bucketPolicyJson: form.bucketPolicyText || undefined,
      owner: form.owner,
      aclRules: form.cephAclRules,
      objectLockEnabled: form.cephObjectLockEnabled,
      objectLockMode: form.cephObjectLockMode,
      objectLockRetentionDays: form.cephObjectLockRetentionDays
        ? Number(form.cephObjectLockRetentionDays)
        : undefined,
    });
  },

  async updateBucket(
    bucket: CephBucket,
    form: BucketFormData,
    ctx: BackendContext,
  ): Promise<void> {
    const region =
      form.cephPlacementTarget ||
      form.region ||
      ctx.cephGateway?.zone ||
      "us-east-1";

    const parsedTags = parseTags(form.tagsText || "");
    const newTags: Record<string, string> | null =
      Object.keys(parsedTags).length ? parsedTags : null;

    const newVersioningEnabled = !!form.versioningEnabled;
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

    const policyText = (form.bucketPolicyText ?? "").trim();
    let bucketPolicyOption: string | null | undefined = undefined;
    if (policyText) {
      bucketPolicyOption = policyText;
    }

    const newOwner = (form.owner || "").trim();
    const oldOwner = bucket.owner || "";
    const ownerChanged = newOwner && newOwner !== oldOwner;

    const params: any = {
      bucketName: bucket.name,
      endpoint: ctx.cephGateway?.endpoint ?? "http://192.168.85.64:8080",
      region,
    };

    if (versioningChanged) {
      params.versioningEnabled = newVersioningEnabled;
    }
    if (tagsOption !== undefined) {
      params.tags = tagsOption;
    }
    if (bucketPolicyOption !== undefined) {
      params.bucketPolicyJson = bucketPolicyOption;
    }
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
};
export async function hydrateCephBucketForEdit(
  bucket: CephBucket,
  _ctx: BackendContext,
): Promise<CephBucket> {
  const { acl, policy } = await getCephBucketSecurity(bucket.name);

  return {
    ...bucket,
    acl,
    policy,
  };
}