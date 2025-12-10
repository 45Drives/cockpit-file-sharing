// backends/minioBucketBackend.ts
import type {BucketBackend,BucketFormData,BackendContext} from "./bucketBackend";
  import type { S3Bucket } from "../types/types";
  
  import {parseTags,parseQuotaSize,BINARY_MULTIPLIERS,DECIMAL_MULTIPLIERS,} from "./bucketUtils";
  
  import {listBucketsFromMinio,createBucketFromMinio,deleteBucketFromMinio,updateMinioBucket,type UpdateMinioBucketOptions,
  } from "../api/minioCliAdapter";
  
  export const minioBucketBackend: BucketBackend = {
    label: "MinIO",
  
    async listBuckets(_ctx: BackendContext): Promise<S3Bucket[]> {
      return listBucketsFromMinio();
    },
  
    async createBucket(form: BucketFormData): Promise<void> {
      const maxSizeRaw = String(form.minioQuotaMaxSize ?? "").trim();
      const tags = parseTags(form.tagsText || "");
  
      let quotaSize: string | undefined;
  
      if (maxSizeRaw) {
        const allMultipliers: Record<string, number> = {
          ...BINARY_MULTIPLIERS,
          ...DECIMAL_MULTIPLIERS,
        };
  
        const { bytes, sizeString } = parseQuotaSize(
          maxSizeRaw,
          form.minioQuotaMaxSizeUnit, // e.g. "GiB" / "GB"
          allMultipliers,
        );
  
        // Only set quota if value is valid
        if (bytes !== null && sizeString !== null) {
          quotaSize = sizeString; // e.g. "10GiB"
        }
      }
  
      await createBucketFromMinio(form.name, {
        region: form.region || undefined,
        withLock: form.minioObjectLockEnabled,
        withVersioning: form.minioVersioningEnabled,
        quotaSize,
        ignoreExisting: false,
      });
  
      if (Object.keys(tags).length) {
        await updateMinioBucket(form.name, { tags });
      }
    },
  
    async updateBucket(bucket: S3Bucket, form: BucketFormData): Promise<void> {
      const parsedTags = parseTags(form.tagsText || "");
      const newTags: Record<string, string> | null =
        Object.keys(parsedTags).length ? parsedTags : null;
  
      const options: UpdateMinioBucketOptions = {};
  
      // Versioning
      const newVersioningEnabled = !!form.minioVersioningEnabled;
      const oldVersioningEnabled = bucket.versioning === "Enabled";
  
      if (newVersioningEnabled !== oldVersioningEnabled) {
        options.versioning = newVersioningEnabled;
      }
  
      // Quota
      const maxSizeRaw = String(form.minioQuotaMaxSize ?? "").trim();
      const oldQuotaBytes: number | null = bucket.quotaBytes ?? null;
  
      let newQuotaBytes: number | null = oldQuotaBytes;
      let newQuotaString: string | null | undefined = undefined;
  
      if (maxSizeRaw === "") {
        // Empty field: clear quota
        newQuotaBytes = null;
        newQuotaString = null;
      } else {
        const allMultipliers: Record<string, number> = {
          ...BINARY_MULTIPLIERS,
          ...DECIMAL_MULTIPLIERS,
        };
  
        const parsed = parseQuotaSize(
          maxSizeRaw,
          form.minioQuotaMaxSizeUnit, // supports KiB/MiB/GiB/TiB and KB/MB/GB/TB
          allMultipliers,
        );
  
        if (parsed.bytes !== null && parsed.sizeString !== null) {
          newQuotaBytes = parsed.bytes;
          newQuotaString = parsed.sizeString;
        } else {
          // invalid input -> treat as "no change"
          newQuotaBytes = oldQuotaBytes;
          newQuotaString = undefined;
        }
      }
  
      if (newQuotaBytes !== oldQuotaBytes) {
        // null means "remove quota", string means "set quota"
        options.quotaSize = newQuotaString ?? null;
      }
  
      // Tags
      const oldTags: Record<string, string> | null =
        bucket.tags && Object.keys(bucket.tags).length ? bucket.tags : null;
  
      const tagsChanged =
        (oldTags === null && newTags !== null) ||
        (oldTags !== null && newTags === null) ||
        (oldTags !== null &&
          newTags !== null &&
          (Object.keys(oldTags).length !== Object.keys(newTags).length ||
            Object.entries(oldTags).some(([k, v]) => newTags[k] !== v)));
  
      if (tagsChanged) {
        options.tags = newTags;
      }
  
      // Only call API if something actually changed
      if (
        "versioning" in options ||
        "quotaSize" in options ||
        "tags" in options
      ) {
        await updateMinioBucket(bucket.name, options);
      }
  
      // Keep local bucket in sync
      bucket.versioning = newVersioningEnabled ? "Enabled" : "Suspended";
      bucket.quotaBytes = newQuotaBytes ?? undefined;
      bucket.tags = newTags ?? undefined;
    },
  
    async deleteBucket(bucket: S3Bucket): Promise<void> {
      await deleteBucketFromMinio(bucket.name);
    },
  };
  