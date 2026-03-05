import type { BucketBackend, BackendContext, BucketCreateForm, BucketEditForm } from "./bucketBackend";
import type { RustfsBucket } from "../types/types";
import {
  listBucketsFromRustfs,
  createBucketFromRustfs,
  deleteBucketFromRustfs,
  updateRustfsBucket,
  type UpdateRustfsBucketOptions,
  getRustfsBucketStats,
  getRustfsBucketQuotaBytes,
  getRustfsBucketTags,
  getRustfsBucketVersioningStatus,
  getRustfsBucketObjectLockEnabled,
  getRustfsBucketObjectLockConfiguration,
} from "../api/rustfsCliAdapter";

export const rustfsBucketBackend: BucketBackend<RustfsBucket> = {
  label: "RustFS",

  async listBuckets(_ctx: BackendContext): Promise<RustfsBucket[]> {
    return listBucketsFromRustfs();
  },

  async createBucket(form: BucketCreateForm, _ctx: BackendContext): Promise<void> {
    if (form.backend !== "rustfs") return;
    const { versioning, quotaSize, tags, objectLock, objectLockMode, objectLockRetentionDays } = form.rustfs;

    await createBucketFromRustfs(form.name, {
      withLock: !!objectLock,
      withVersioning: !!versioning,
      quotaSize: quotaSize ?? undefined,
      objectLockMode,
      objectLockRetentionDays,
    });

    if (tags && Object.keys(tags).length) {
      await updateRustfsBucket(form.name, { tags });
    }
  },

  async updateBucket(bucket: RustfsBucket, form: BucketEditForm, _ctx: BackendContext): Promise<void> {
    if (form.backend !== "rustfs") return;

    const options: UpdateRustfsBucketOptions = {};

    const newVersioningEnabled = !!form.rustfs.versioning;
    const oldVersioningEnabled = bucket.versioning === "Enabled";
    if (newVersioningEnabled !== oldVersioningEnabled) {
      options.versioning = newVersioningEnabled;
    }

    if ("quotaSize" in form.rustfs) {
      const rawQuota = form.rustfs.quotaSize;
      const nextQuota =
        rawQuota === null || rawQuota === undefined || rawQuota.trim() === ""
          ? null
          : rawQuota;
      const hasExistingQuota = typeof bucket.quotaBytes === "number" && bucket.quotaBytes > 0;

      // Avoid unnecessary `mc quota clear` when there is no configured quota.
      if (!(nextQuota === null && !hasExistingQuota)) {
        options.quotaSize = nextQuota;
      }
    }

    if ("tags" in form.rustfs) {
      options.tags = form.rustfs.tags ?? null;
    }

    if ("objectLockMode" in form.rustfs) {
      options.objectLockMode = form.rustfs.objectLockMode;
    }

    if ("objectLockRetentionDays" in form.rustfs) {
      options.objectLockRetentionDays = form.rustfs.objectLockRetentionDays;
    }

    if ("versioning" in options || "quotaSize" in options || "tags" in options || "objectLockMode" in options || "objectLockRetentionDays" in options) {
      await updateRustfsBucket(bucket.name, options);
    }

    bucket.versioning = newVersioningEnabled ? "Enabled" : "Suspended";
    bucket.tags = form.rustfs.tags ?? undefined;
  },

  async getBucket(ref: string, _ctx: BackendContext): Promise<RustfsBucket> {
    const bucketName = String(ref || "").trim();
    if (!bucketName) throw new Error("getBucket(rustfs): bucket name is required");

    const [stats, quotaBytes, listedTags, versioning, objectLockEnabledFromApi, objectLockConfig] = await Promise.all([
      getRustfsBucketStats(bucketName),
      getRustfsBucketQuotaBytes(bucketName),
      getRustfsBucketTags(bucketName),
      getRustfsBucketVersioningStatus(bucketName),
      getRustfsBucketObjectLockEnabled(bucketName),
      getRustfsBucketObjectLockConfiguration(bucketName),
    ]);

    const {
      createdAt,
      region,
      objectCount,
      sizeBytes,
      objectLockEnabled,
      tagsFromStat,
    } = stats;

    const tags = tagsFromStat || listedTags;
    const owner: string | undefined =
      (tags && (tags.owner || tags.Owner || tags.bucketOwner)) || undefined;

    return {
      backendKind: "rustfs",
      name: bucketName,
      createdAt,
      region: region || "rustfs-default-region",
      owner,
      policy: undefined,
      objectCount,
      sizeBytes,
      quotaBytes,
      versioning,
      tags: tags || undefined,
      objectLockEnabled: objectLockEnabledFromApi ?? objectLockConfig.objectLockEnabled ?? !!objectLockEnabled,
      objectLockMode: objectLockConfig.objectLockMode,
      objectLockRetentionDays: objectLockConfig.objectLockRetentionDays,
    };
  },

  async deleteBucket(bucket: RustfsBucket, _ctx: BackendContext): Promise<void> {
    await deleteBucketFromRustfs(bucket.name);
  },

  async prepareCreate() {
    return {};
  },

  async prepareEdit(bucket, _ctx) {
    try {
      const bucketName = String(bucket?.name || "").trim();
      if (!bucketName) return { bucket, deps: {} };

      const [stats, quotaBytes, listedTags, versioning, objectLockEnabledFromApi, objectLockConfig] = await Promise.all([
        getRustfsBucketStats(bucketName),
        getRustfsBucketQuotaBytes(bucketName),
        getRustfsBucketTags(bucketName),
        getRustfsBucketVersioningStatus(bucketName),
        getRustfsBucketObjectLockEnabled(bucketName),
        getRustfsBucketObjectLockConfiguration(bucketName),
      ]);

      const {
        createdAt,
        region,
        objectCount,
        sizeBytes,
        objectLockEnabled,
        tagsFromStat,
      } = stats;

      const tags = tagsFromStat || listedTags;
      const owner: string | undefined =
        (tags && (tags.owner || tags.Owner || tags.bucketOwner)) || undefined;

      return {
        bucket: {
          backendKind: "rustfs",
          name: bucketName,
          createdAt,
          region: region || "rustfs-default-region",
          owner,
          policy: undefined,
          objectCount,
          sizeBytes,
          quotaBytes,
          versioning,
          tags: tags || undefined,
          objectLockEnabled: objectLockEnabledFromApi ?? objectLockConfig.objectLockEnabled ?? !!objectLockEnabled,
          objectLockMode: objectLockConfig.objectLockMode,
          objectLockRetentionDays: objectLockConfig.objectLockRetentionDays,
        },
        deps: {},
      };
    } catch {
      return { bucket, deps: {} };
    }
  },
};
