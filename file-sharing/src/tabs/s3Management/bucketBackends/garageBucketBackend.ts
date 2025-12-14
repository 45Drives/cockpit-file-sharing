// backends/garageBucketBackend.ts
import type { BucketBackend, BucketFormData, BackendContext } from "./bucketBackend";
import type { GarageBucket } from "../types/types";
import {listBucketsFromGarage,deleteBucketFromGarage,createGarageBucket,updateGarageBucket,
} from "../api/garageCliAdapter";
import { parseList, parseQuotaSize, BINARY_MULTIPLIERS } from "./bucketUtils";

export const garageBucketBackend: BucketBackend<GarageBucket> = {
  label: "Garage",

  async listBuckets(_ctx: BackendContext): Promise<GarageBucket[]> {
    return listBucketsFromGarage();
  },

  async createBucket(form: BucketFormData): Promise<void> {
    const allow = parseList(form.garageAllowText || "");
    const deny = parseList(form.garageDenyText || "");
    const extraArgs = parseList(form.garageExtraArgsText || "");
    const aliases = parseList(form.garageAliasesText || "");
  
    const maxSizeRaw = String(form.garageMaxSize ?? "").trim();
    const maxObjectsRaw = String(form.garageMaxObjects ?? "").trim();
  
    // Use shared helper for quota size
    let quota: string | undefined;
    if (maxSizeRaw) {
      const { bytes, sizeString } = parseQuotaSize(maxSizeRaw,form.garageMaxSizeUnit,   BINARY_MULTIPLIERS,"GiB");
  
      // Only set quota if value is valid
      if (bytes !== null && sizeString !== null) {
        quota = `--max-size ${sizeString}`;
      }
    }
  
    const maxObjects = maxObjectsRaw ? Number(maxObjectsRaw) : undefined;
  
    await createGarageBucket(form.name, {
      quota,
      maxObjects,
      allow: allow.length ? allow : undefined,
      deny: deny.length ? deny : undefined,
      extraArgs: extraArgs.length ? extraArgs : undefined,
      website: form.garageWebsiteEnabled
        ? {
            enable: true,
            indexDocument: form.garageWebsiteIndex || undefined,
            errorDocument: form.garageWebsiteError || undefined,
          }
        : undefined,
      aliases: aliases.length ? aliases : undefined,
    });
  },

  async updateBucket(bucket: GarageBucket, form: BucketFormData): Promise<void> {
    const allow = parseList(form.garageAllowText || "");
    const deny = parseList(form.garageDenyText || "");
    const extraArgs = parseList(form.garageExtraArgsText || "");
    const aliases = parseList(form.garageAliasesText || "");
    const maxSizeRaw = String(form.garageMaxSize ?? "").trim();
  
    let newQuotaBytes: number | null = null;
    let quotaOption: string | null | undefined = undefined;
  
    if (maxSizeRaw === "") {
      newQuotaBytes = null;
      quotaOption = null;
    } else {
      const { bytes, sizeString } = parseQuotaSize(
        maxSizeRaw,
        form.garageMaxSizeUnit, // "MiB" | "GiB" | "TiB"
        BINARY_MULTIPLIERS,
        "GiB",
      );
  
      if (bytes !== null && sizeString !== null) {
        newQuotaBytes = bytes;
        quotaOption = `--max-size ${sizeString}`;
      } else {
        // invalid value -> treat as "no change"
        newQuotaBytes = bucket.quotaBytes ?? null;
        quotaOption = undefined;
      }
    }
  
    const oldQuotaBytes: number | null = bucket.quotaBytes ?? null;
    // If bytes didn’t actually change, avoid sending quotaOption
    if (newQuotaBytes === oldQuotaBytes) {
      quotaOption = undefined;
    }
  
    // MAX OBJECTS
    const maxObjectsRaw = String(form.garageMaxObjects ?? "").trim();
    let newMaxObjects: number | null = null;
    if (maxObjectsRaw === "") {
      newMaxObjects = null;
    } else {
      const n = Number(maxObjectsRaw);
      newMaxObjects = Number.isFinite(n) && n > 0 ? n : null;
    }
  
    const oldMaxObjects: number | null =
      (bucket as any).garageMaxObjects ?? null;
  
    let maxObjectsOption: number | null | undefined = undefined;
    if (newMaxObjects !== oldMaxObjects) {
      maxObjectsOption = newMaxObjects;
    }
  
    await updateGarageBucket(bucket.garageId!, {
      quota: quotaOption,
      maxObjects: maxObjectsOption,
      allow: allow.length ? allow : null,
      deny: deny.length ? deny : null,
      extraArgs: extraArgs.length ? extraArgs : undefined,
      website: form.garageWebsiteEnabled
        ? {
            enable: true,
            indexDocument: form.garageWebsiteIndex || undefined,
            errorDocument: form.garageWebsiteError || undefined,
          }
        : { enable: false },
      aliases: aliases.length ? aliases : null,
    });
  
    // keep local bucket in sync
    if (maxObjectsOption !== undefined) {
      (bucket as any).garageMaxObjects =
        maxObjectsOption === null ? undefined : maxObjectsOption;
    }
    if (quotaOption !== undefined) {
      bucket.quotaBytes = newQuotaBytes ?? undefined;
    }
  },

  async deleteBucket(bucket: GarageBucket): Promise<void> {
    await deleteBucketFromGarage(bucket.garageId!);
  },
};
