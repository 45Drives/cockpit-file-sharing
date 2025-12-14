// backends/bucketBackend.ts
import type { S3Bucket, RgwGateway } from "../types/types";

export interface BucketFormData {
  [key: string]: any;
}

export interface BackendContext {
  cephGateway?: RgwGateway | null;
}

export interface BucketBackend<B extends S3Bucket = S3Bucket> {
  label: string;

  listBuckets(ctx: BackendContext): Promise<B[]>;

  createBucket(form: BucketFormData, ctx: BackendContext): Promise<void>;

  updateBucket(bucket: B, form: BucketFormData, ctx: BackendContext): Promise<void>;

  deleteBucket(bucket: B, ctx: BackendContext): Promise<void>;
}
