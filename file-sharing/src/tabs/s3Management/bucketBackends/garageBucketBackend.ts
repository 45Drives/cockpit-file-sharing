import type { BucketBackend, BackendContext, BucketCreateForm, BucketEditForm } from "./bucketBackend";
import type { GarageBucket } from "../types/types";
import {
  listBucketsFromGarage,
  deleteBucketFromGarage,
  createGarageBucket,
  updateGarageBucket,
  listGarageKeysWithInfo,
} from "../api/garageCliAdapter";

export const garageBucketBackend: BucketBackend<GarageBucket> = {
  label: "Garage",

  async listBuckets(_ctx: BackendContext): Promise<GarageBucket[]> {
    return listBucketsFromGarage();
  },

  async createBucket(form: BucketCreateForm, _ctx: BackendContext): Promise<void> {
    if (form.backend !== "garage") return;

    await createGarageBucket(form.name, form.garage);
  },

  async updateBucket(bucket: GarageBucket, form: BucketEditForm, _ctx: BackendContext): Promise<void> {
    if (form.backend !== "garage") return;

    await updateGarageBucket(bucket.garageId!, form.garage);

    // Optional local sync if you want optimistic updates:
    const g = form.garage;

    if ("maxObjects" in g) {
      bucket.garageMaxObjects = g.maxObjects ?? undefined;
    }
    if ("website" in g) {
      bucket.garageWebsiteEnabled = !!g.website?.enable;
    }
    if ("aliases" in g && Array.isArray(g.aliases)) {
      bucket.garageAliases = g.aliases ?? [];
    }
    // quotaBytes: you can’t safely derive bytes from "30GiB" here unless you parse it;
    // either leave it or refresh stats after update.
  },

  async deleteBucket(bucket: GarageBucket, _ctx: BackendContext): Promise<void> {
    await deleteBucketFromGarage(bucket.garageId!);
  },

  async prepareCreate(_ctx: BackendContext) {
    const garageKeys = await listGarageKeysWithInfo();
    return { garageKeys };
  },

  async prepareEdit(bucket, ctx) {
    const deps = await this.prepareCreate!(ctx);
    return { bucket, deps };
  },
};
