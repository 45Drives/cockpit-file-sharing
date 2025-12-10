// backends/bucketBackendRegistry.ts
import type {  BucketBackend } from "./bucketBackend";
import { cephBucketBackend } from "./cephBucketBackend";
import { minioBucketBackend } from "./minioBucketBackend";
import { garageBucketBackend } from "./garageBucketBackend";
import {type BackendKind}  from "../types/types";

const registry: Record<BackendKind, BucketBackend> = {
  ceph: cephBucketBackend,
  minio: minioBucketBackend,
  garage: garageBucketBackend,
};

export function getBucketBackend(kind: BackendKind): BucketBackend {
  return registry[kind];
}
