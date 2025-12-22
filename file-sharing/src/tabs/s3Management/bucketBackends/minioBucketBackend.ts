// backends/minioBucketBackend.ts
import type { BucketBackend, BackendContext, BucketCreateForm, BucketEditForm } from "./bucketBackend";
import type { MinioBucket } from "../types/types";
import {
  listBucketsFromMinio,
  createBucketFromMinio,
  deleteBucketFromMinio,
  updateMinioBucket,
  type UpdateMinioBucketOptions,
} from "../api/minioCliAdapter";

export const minioBucketBackend: BucketBackend<MinioBucket> = {
  label: "MinIO",

  async listBuckets(_ctx: BackendContext): Promise<MinioBucket[]> {
    return listBucketsFromMinio();
  },

  async createBucket(form: BucketCreateForm, _ctx: BackendContext): Promise<void> {
    if (form.backend !== "minio") return;
    console.log("minio create bucket form ", form)

    const { versioning, quotaSize, tags,objectLock } = form.minio;

    await createBucketFromMinio(form.name, {
      withVersioning: !!versioning,
      quotaSize: quotaSize ?? undefined,
      withLock: !!objectLock,
    });

    // MinIO tags are applied after create
    if (tags && Object.keys(tags).length) {
      await updateMinioBucket(form.name, { tags });
    }
  },

  async updateBucket(bucket: MinioBucket, form: BucketEditForm, _ctx: BackendContext): Promise<void> {
    if (form.backend !== "minio") return;

    const options: UpdateMinioBucketOptions = {};

    // Versioning
    const newVersioningEnabled = !!form.minio.versioning;
    const oldVersioningEnabled = bucket.versioning === "Enabled";
    if (newVersioningEnabled !== oldVersioningEnabled) {
      options.versioning = newVersioningEnabled;
    }

    // Quota (null means clear, string means set, undefined means no change)
    if ("quotaSize" in form.minio) {
      options.quotaSize = form.minio.quotaSize ?? null;
    }

    // Tags (null clears, object sets)
    if ("tags" in form.minio) {
      options.tags = form.minio.tags ?? null;
    }

    if ("versioning" in options || "quotaSize" in options || "tags" in options) {
      await updateMinioBucket(bucket.name, options);
    }

    // Optional local sync (only if you want optimistic updates)
    bucket.versioning = newVersioningEnabled ? "Enabled" : "Suspended";
    bucket.tags = form.minio.tags ?? undefined;
    // quotaBytes cannot be derived from quotaSize without parsing, so leave it or refresh from API.
  },

  async deleteBucket(bucket: MinioBucket, _ctx: BackendContext): Promise<void> {
    await deleteBucketFromMinio(bucket.name);
  },

  async prepareCreate() {
    return {};
  },

  async prepareEdit(bucket) {
    return { bucket, deps: {} };
  },
};
