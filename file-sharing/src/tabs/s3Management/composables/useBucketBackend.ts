// composables/useBucketBackend.ts
import { ref, computed } from "vue";
import type { Ref } from "vue";

import type { BucketByKind, BackendKind } from "../types/types";
import type {
  BackendContext,
  BucketEditForm,
  BucketFormData,
} from "../bucketBackends/bucketBackend";
import type { BucketBackend } from "../bucketBackends/bucketBackend";
import { getBucketBackend } from "../bucketBackends/bucketBackendRegistry";

export function useBucketBackend<K extends BackendKind>(backend: Ref<K>, ctx: Ref<BackendContext>) {
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

          const keyOf = (x: any) => x.adminRef ?? x.id ?? x.name;

          for (const u of pending) {
            const i = buckets.value.findIndex((b: any) => keyOf(b) === keyOf(u));
            if (i >= 0) {
              buckets.value.splice(i, 1, u as any);
            }
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

  const keyOf = (x: any) => String(x?.adminRef ?? x?.id ?? x?.name ?? "");

  function refFromCreateForm(form: BucketFormData): string {
    if (form.backend === "ceph") {
      const owner = String((form as any).ownerUid ?? (form as any).owner ?? "").trim();
      if (owner.includes("$")) {
        const tenant = owner.split("$", 1)[0]?.trim();
        if (tenant) return `${tenant}/${form.name}`;
      }
      return form.name;
    }
    return form.name;
  }
  async function createBucketFromForm(form: BucketFormData): Promise<BucketByKind<K>> {
    const impl = backendImpl.value;

    await impl.createBucket(form, context.value);

    const ref = refFromCreateForm(form);
    const created = (await impl.getBucket(ref, context.value)) as BucketByKind<K>;

    const k = keyOf(created);
    console.log("key of ", k )
    const i = buckets.value.findIndex((b: any) => keyOf(b) === k);
    console.log("key found ", i)
    if (i >= 0) buckets.value.splice(i, 1, created as any);
    else buckets.value.unshift(created as any);

    return created;
  }

  async function updateBucketFromForm(bucket: BucketByKind<K>, form: BucketEditForm) {
    await backendImpl.value.updateBucket(bucket, form, context.value);
  }

  async function deleteBucket(bucket: BucketByKind<K>) {
    await backendImpl.value.deleteBucket(bucket, context.value);
  }
  async function prepareCreate() {
    const impl = backendImpl.value;
    if (!impl.prepareCreate) return {};
    return impl.prepareCreate(context.value) as any;
  }

  async function prepareEdit(bucket: BucketByKind<K>) {
    const impl = backendImpl.value;
    if (!impl.prepareEdit) return { bucket, deps: {} as any };
    return impl.prepareEdit(bucket as any, context.value) as any;
  }

  return {
    buckets,
    loading,
    error,
    loadBuckets,
    createBucketFromForm,
    updateBucketFromForm,
    deleteBucket,
    prepareEdit,
    prepareCreate,
  };
}
