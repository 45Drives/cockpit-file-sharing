// backends/bucketBackendRegistry.ts
import type { BucketBackend } from "./bucketBackend";
import type { BackendKind, BucketByKind } from "../types/types";
import { cephBucketBackend } from "./cephBucketBackend";
import { minioBucketBackend } from "./minioBucketBackend";
import { garageBucketBackend } from "./garageBucketBackend";

type BackendRegistry = {
  [K in BackendKind]: BucketBackend<BucketByKind<K>>;
};

const registry: BackendRegistry = {
  ceph: cephBucketBackend,
  minio: minioBucketBackend,
  garage: garageBucketBackend,
};

export function getBucketBackend<K extends BackendKind>(kind: K): BucketBackend<BucketByKind<K>> {
  return registry[kind];
}
