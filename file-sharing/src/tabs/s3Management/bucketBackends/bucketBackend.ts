// backends/bucketBackend.ts
import type { S3Bucket, RgwGateway, GarageKeyDetail } from "../types/types";
import type { CephBucketCreateOptions, CephBucketUpdatePayload, GarageBucketOptions, GarageBucketKeyGrant, MinioBucketUpdateOptions,
} from "../types/types";


export type BucketCreateForm =
  | ({ backend: "ceph";  } & CephBucketCreateOptions)
  | ({ backend: "garage"; name: string } & { garage: GarageBucketOptions; grants?: GarageBucketKeyGrant[] })
  | ({ backend: "minio"; name: string } & { minio: MinioBucketUpdateOptions });

export type BucketEditForm =
  | ({ backend: "ceph" } & CephBucketUpdatePayload)
  | ({ backend: "garage"; name: string } & { garage: GarageBucketOptions; grants?: GarageBucketKeyGrant[] })
  | ({ backend: "minio"; name: string } & { minio: MinioBucketUpdateOptions });

export type BucketFormData = BucketCreateForm | BucketEditForm;
export interface BackendContext {
  cephGateway?: RgwGateway | null;
}

export type BucketModalDepsByKind = {
  ceph: {
    cephUsers: string[];
    cephPlacementTargets: string[];
  };
  garage: {
    garageKeys: GarageKeyDetail[];
  };
  minio: {};
};
export interface BucketBackend<B extends S3Bucket = S3Bucket> {
  label: string;

  listBuckets(ctx: BackendContext): Promise<B[]>;

  createBucket(form: BucketCreateForm, ctx: BackendContext): Promise<void>;

  updateBucket(bucket: B, form: BucketEditForm, ctx: BackendContext): Promise<void>;
  
  deleteBucket(bucket: B, ctx: BackendContext): Promise<void>;

  listBucketsProgressive?( ctx: BackendContext, onUpdate: (bucket: B) => void,): Promise<B[]>;
  prepareCreate?(ctx: BackendContext,): Promise<BucketModalDepsByKind[B["backendKind"]]>;

  prepareEdit?(bucket: B,ctx: BackendContext,
  ): Promise<{bucket: B;deps: BucketModalDepsByKind[B["backendKind"]];}>;
}
