// composables/useBucketBackend.ts
import { ref, computed } from "vue";
import type { Ref } from "vue";
import type { S3Bucket, RgwGateway } from "../types/types";
import type {  BackendContext, BucketFormData } from "../bucketBackends/bucketBackend";
import { getBucketBackend } from "../bucketBackends/bucketBackendRegistry";
import type { BackendKind } from "../types/types"

export function useBucketBackend(
  backend: Ref<BackendKind>,
  ctx: Ref<{ cephGateway?: RgwGateway | null }>,
) {
  const buckets = ref<S3Bucket[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const context = computed<BackendContext>(() => ({
    cephGateway: ctx.value.cephGateway ?? null,
  }));

  const backendImpl = computed(() => getBucketBackend(backend.value));

  async function loadBuckets() {
    loading.value = true;
    error.value = null;
    try {
      buckets.value = await backendImpl.value.listBuckets(context.value);
    } catch (e: any) {
      error.value = e?.message ?? "Failed to list buckets";
      buckets.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function createBucketFromForm(form: BucketFormData) {
    await backendImpl.value.createBucket(form, context.value);
  }

  async function updateBucketFromForm(bucket: S3Bucket, form: BucketFormData) {
    await backendImpl.value.updateBucket(bucket, form, context.value);
  }

  async function deleteBucket(bucket: S3Bucket) {
    await backendImpl.value.deleteBucket(bucket, context.value);
  }

  return {
    buckets,
    loading,
    error,
    loadBuckets,
    createBucketFromForm,
    updateBucketFromForm,
    deleteBucket,
  };
}
