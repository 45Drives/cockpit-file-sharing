// composables/useBucketBackend.ts
import { ref, computed } from "vue";
import type { Ref } from "vue";

import type { BucketByKind, BackendKind } from "../types/types";
import type { BackendContext, BucketEditForm, BucketFormData } from "../bucketBackends/bucketBackend";
import type { BucketBackend } from "../bucketBackends/bucketBackend";
import { getBucketBackend } from "../bucketBackends/bucketBackendRegistry";

export function useBucketBackend<K extends BackendKind>(
  backend: Ref<K>,
  ctx: Ref<BackendContext>,
) {
  const buckets = ref<BucketByKind<K>[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const context = computed<BackendContext>(() => ({
    cephGateway: ctx.value.cephGateway ?? null,
  }));

  const backendImpl = computed<BucketBackend<BucketByKind<K>>>(() => {
    return getBucketBackend(backend.value);
  });

  async function loadBuckets() {
    loading.value = true;
    error.value = null;
  
    try {
      const impl = backendImpl.value;
  
      // micro-batch updates to avoid 2000 reactive thrashes
      let pending: BucketByKind<K>[] = [];
      let flushScheduled = false;
  
      const updateOne = (updated: BucketByKind<K>) => {
        pending.push(updated);
        if (flushScheduled) return;
        flushScheduled = true;
  
        queueMicrotask(() => {
          flushScheduled = false;
  
          for (const u of pending) {
            const keyOf = (x: any) => x.adminRef ?? x.id ?? x.name;

            const i = buckets.value.findIndex((b: any) => keyOf(b) === keyOf(u));
            
            if (i >= 0) buckets.value[i] = u;
          }
          pending = [];
        });
      };
  
      if (impl.listBucketsProgressive) {
        buckets.value = await impl.listBucketsProgressive(context.value, updateOne);
      } else {
        buckets.value = await impl.listBuckets(context.value);
      }
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

  async function updateBucketFromForm(bucket: BucketByKind<K>, form: BucketEditForm) {
    await backendImpl.value.updateBucket(bucket, form, context.value);
  }

  async function deleteBucket(bucket: BucketByKind<K>) {
    await backendImpl.value.deleteBucket(bucket, context.value);
  }

  return {buckets,loading,error,loadBuckets,createBucketFromForm,updateBucketFromForm,deleteBucket,
  };
  
}
