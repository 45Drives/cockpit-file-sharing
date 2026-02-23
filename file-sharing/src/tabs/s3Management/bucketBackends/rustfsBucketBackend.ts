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
} from "../api/rustfsCliAdapter";

export const rustfsBucketBackend: BucketBackend<RustfsBucket> = {
  label: "RustFS",

  async listBuckets(_ctx: BackendContext): Promise<RustfsBucket[]> {
    return listBucketsFromRustfs();
  },

  async createBucket(form: BucketCreateForm, _ctx: BackendContext): Promise<void> {
    if (form.backend !== "rustfs") return;
    const { versioning, quotaSize, tags } = form.rustfs;

    await createBucketFromRustfs(form.name, {
      withVersioning: !!versioning,
      quotaSize: quotaSize ?? undefined,
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
      options.quotaSize = form.rustfs.quotaSize ?? null;
    }

    if ("tags" in form.rustfs) {
      options.tags = form.rustfs.tags ?? null;
    }

    if ("versioning" in options || "quotaSize" in options || "tags" in options) {
      await updateRustfsBucket(bucket.name, options);
    }

    bucket.versioning = newVersioningEnabled ? "Enabled" : "Suspended";
    bucket.tags = form.rustfs.tags ?? undefined;
  },

  async getBucket(ref: string, _ctx: BackendContext): Promise<RustfsBucket> {
    const bucketName = String(ref || "").trim();
    if (!bucketName) throw new Error("getBucket(rustfs): bucket name is required");

    const [stats, quotaBytes] = await Promise.all([
      getRustfsBucketStats(bucketName),
      getRustfsBucketQuotaBytes(bucketName),
    ]);

    const {
      createdAt,
      region,
      objectCount,
      sizeBytes,
      objectLockEnabled,
      tagsFromStat,
    } = stats;

    const tags = tagsFromStat;
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
      versioning: undefined,
      tags: tags || undefined,
      objectLockEnabled: !!objectLockEnabled,
    };
  },

  async deleteBucket(bucket: RustfsBucket, _ctx: BackendContext): Promise<void> {
    await deleteBucketFromRustfs(bucket.name);
  },

  async prepareCreate() {
    return {};
  },

  async prepareEdit(bucket) {
    return { bucket, deps: {} };
  },
};
