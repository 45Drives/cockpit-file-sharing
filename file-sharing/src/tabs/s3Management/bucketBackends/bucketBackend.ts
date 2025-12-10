// backends/bucketBackend.ts
import type { S3Bucket, RgwGateway } from "../types/types";


export interface BucketFormData {
  [key: string]: any;
}

export interface BackendContext {
  cephGateway?: RgwGateway | null;
}

export interface BucketBackend {
  label: string;

  listBuckets(ctx: BackendContext): Promise<S3Bucket[]>;

  createBucket(form: BucketFormData, ctx: BackendContext): Promise<void>;

  updateBucket(
    bucket: S3Bucket,
    form: BucketFormData,
    ctx: BackendContext,
  ): Promise<void>;

  deleteBucket(bucket: S3Bucket, ctx: BackendContext): Promise<void>;
}
