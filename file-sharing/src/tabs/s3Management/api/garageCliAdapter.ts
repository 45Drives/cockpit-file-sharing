// garageCliAdapter.ts

import type {
  S3Bucket,
  Endpoint,
  BucketVersioningStatus,
  BucketAcl,
  GarageBucketCreateOptions,
} from "../types/types";

import { legacy } from "../../../../../houston-common/houston-common-lib";
const { errorString, useSpawn } = legacy;

// Garage CLI executable — usually in PATH
const GARAGE_CMD = process.env.GARAGE_CMD || "garage";

/**
 * Run `garage ...` and return raw stdout as string.
 */
async function garageRaw(subArgs: string[]): Promise<string> {
  const args = [GARAGE_CMD, ...subArgs];

  const proc = useSpawn(args, { superuser: "try" });

  const { stdout } = await proc.promise();
  const text = (stdout ?? "").toString().trim();

  console.log("garageRaw args =", args.join(" "));
  console.log("garageRaw raw stdout =", text);

  return text;
}

/**
 * List buckets from Garage by parsing `garage bucket list` output.
 *
 * Typical output example (simplified):
 *
 *   ==== BUCKETS ====
 *   ID                Created     Global aliases  Local aliases
 *   2faf6a78fe2766a8  2025-11-26  backups
 */
export async function listBucketsFromGarage(): Promise<S3Bucket[]> {
    const text = await garageRaw(["bucket", "list"]);
    const lines = text.split(/\r?\n/);
  
    const buckets: S3Bucket[] = [];
  
    const headerIndex = lines.findIndex((l) => l.trim().startsWith("ID"));
    if (headerIndex === -1) return buckets;
  
    const header = lines[headerIndex];
  
    const idStart = header.indexOf("ID");
    const createdStart = header.indexOf("Created");
    const globalStart = header.indexOf("Global aliases");
    const localStart = header.indexOf("Local aliases");
  
    if (idStart === -1 || createdStart === -1 || globalStart === -1) {
      return buckets;
    }
  
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
  
      const id = line.slice(idStart, createdStart).trim();
      const createdAt = line.slice(createdStart, globalStart).trim();
      const globalAliasesSlice =
        localStart === -1
          ? line.slice(globalStart).trim()
          : line.slice(globalStart, localStart).trim();
  
      // Display name = first alias; fallback to ID if none.
      let displayName = globalAliasesSlice.trim();
      if (displayName.includes(",")) {
        displayName = displayName.split(",")[0].trim();
      }
      if (!displayName) {
        displayName = id;
      }
  
      let stats;
      try {
        // Always use ID for stats; ID is stable and accepted by CLI.
        stats = await getGarageBucketStats(id);
      } catch {
        stats = { objectCount: 0, sizeBytes: 0 };
      }
  
      buckets.push({
        name: displayName,   // what you show in the UI
        createdAt,
        region: "garage",
        owner: undefined,
        acl: undefined,
        policy: undefined,
        objectCount: stats.objectCount,
        sizeBytes: stats.sizeBytes,
        garageId: id,        // canonical identifier for delete
      });
    }
  
    return buckets;
  }
  
export async function getGarageBucketStats(bucketName: string): Promise<{
  createdAt?: string;
  objectCount: number;
  sizeBytes: number;
}> {
  const text = await garageRaw(["bucket", "info", bucketName]);
  const lines = text.split("\n").map((l) => l.trim());

  let createdAt: string | undefined;
  let objectCount = 0;
  let sizeBytes = 0;

  for (const line of lines) {
    if (line.startsWith("Created:")) {
      // Created: 2025-11-26 16:12:34
      createdAt = line.replace(/^Created:\s*/, "");
    } else if (line.startsWith("Objects:")) {
      // Objects: 3
      const m = line.match(/^Objects:\s*(\d+)/);
      if (m) objectCount = Number(m[1]);
    } else if (line.startsWith("Bytes:")) {
      // Bytes: 12345
      const m = line.match(/^Bytes:\s*(\d+)/);
      if (m) sizeBytes = Number(m[1]);
    }
  }

  return { createdAt, objectCount, sizeBytes };
}

/**
 * Object-level stats is the same as bucket usage in Garage.
 */
export async function getBucketObjectStatsFromGarage(
  _endpoint: Endpoint,
  bucketName: string
): Promise<{ objectCount: number; sizeBytes: number }> {
  const info = await getGarageBucketStats(bucketName);
  return {
    objectCount: info.objectCount,
    sizeBytes: info.sizeBytes,
  };
}

export async function isGarageHealthy(): Promise<boolean> {
  try {
    const text = await garageRaw(["status"]);
    const lines = text.split("\n").map((l) => l.trim());
    const hasHeader = lines.some((l) => l.startsWith("==== HEALTHY NODES"));
    const hasNodeLine = lines.some(
      (l) =>
        l.length > 0 &&
        !l.startsWith("====") &&
        !l.startsWith("ID ") &&
        !l.startsWith("Hostname")
    );

    return hasHeader && hasNodeLine;
  } catch (e) {
    console.warn("Garage health check failed:", e);
    return false;
  }
}


export async function deleteBucketFromGarage(bucketNameOrId: string): Promise<void> {
    // First, ask Garage what aliases this bucket has
    const aliases = await getGarageBucketAliases(bucketNameOrId);
  
    // Case 1: No aliases reported. Just try deleting exactly what we were given.
    if (aliases.length === 0) {
      try {
        await garageRaw(["bucket", "delete", bucketNameOrId, "--yes"]);
        return;
      } catch (e: any) {
        const msg = errorString(e);
        console.error("Failed to delete Garage bucket (no aliases):", bucketNameOrId, msg);
        throw new Error(`Failed to delete Garage bucket "${bucketNameOrId}": ${msg}`);
      }
    }
  
    // Case 2: Exactly one alias. Delete using that alias; Garage wants that.
    if (aliases.length === 1) {
      const alias = aliases[0];
      try {
        await garageRaw(["bucket", "delete", alias, "--yes"]);
        return;
      } catch (e: any) {
        const msg = errorString(e);
        console.error("Failed to delete Garage bucket (single alias):", alias, msg);
        throw new Error(`Failed to delete Garage bucket "${alias}": ${msg}`);
      }
    }
  
    // Case 3: Multiple aliases. Unalias all but one, then delete via the last alias.
    const keep = aliases[aliases.length - 1];
    console.log("Multiple aliases, keeping:", keep, "removing:", aliases.filter(a => a !== keep));
  
    for (const alias of aliases) {
      if (alias === keep) continue;
  
      try {
        await garageRaw(["bucket", "unalias", alias]);
      } catch (e: any) {
        const msg = errorString(e);
        console.error(`Failed to unalias "${alias}" for bucket "${bucketNameOrId}":`, msg);
        throw new Error(
          `Failed to unalias "${alias}" for Garage bucket "${bucketNameOrId}": ${msg}`
        );
      }
    }
  
    try {
      await garageRaw(["bucket", "delete", keep, "--yes"]);
    } catch (e: any) {
      const msg = errorString(e);
      console.error("Delete after unalias failed:", keep, msg);
      throw new Error(`Failed to delete Garage bucket "${keep}" after unaliasing: ${msg}`);
    }
  }
        
  export async function createGarageBucket(
    bucketName: string,
    options: GarageBucketCreateOptions = {}
  ): Promise<void> {
    // First: create the bucket
    const args: string[] = ["bucket", "create", bucketName];
  
    if (options.placement) {
      args.push("--placement", options.placement);
    }
  
    if (options.allow?.length) {
      for (const a of options.allow) {
        args.push("--allow", a);
      }
    }
  
    if (options.deny?.length) {
      for (const d of options.deny) {
        args.push("--deny", d);
      }
    }
  
    if (options.extraArgs?.length) {
      args.push(...options.extraArgs);
    }
  
    try {
      // 1) Create bucket
      await garageRaw(args);
  
      // 2) Apply quotas (if any)
      if (options.quota) {
        const quotaArgs: string[] = [
          "bucket",
          "set-quotas",
          bucketName,
          ...options.quota.split(/\s+/).filter(Boolean),
        ];
        await garageRaw(quotaArgs);
      }
  
      // 3) Configure website access (if requested)
      if (options.website?.enable) {
        const websiteArgs: string[] = [
          "bucket",
          "website",
          "--allow",
          bucketName,
        ];
  
        if (options.website.indexDocument) {
          websiteArgs.push("--index-document", options.website.indexDocument);
        }
  
        if (options.website.errorDocument) {
          websiteArgs.push("--error-document", options.website.errorDocument);
        }
  
        await garageRaw(websiteArgs);
        
      }
      if (options.aliases?.length) {
        // `garage bucket alias <bucket> <alias> [<alias> ...]`
        await garageRaw(["bucket", "alias", bucketName, ...options.aliases]);
      }
    } catch (e: any) {
      const msg = errorString(e);
      console.error("Failed to create Garage bucket:", bucketName, msg);
      throw new Error(`Failed to create Garage bucket "${bucketName}": ${msg}`);
    }
  }
    
  async function getGarageBucketAliases(idOrAlias: string): Promise<string[]> {
    const text = await garageRaw(["bucket", "info", idOrAlias]);
    const lines = text.split(/\r?\n/);
  
    const aliases: string[] = [];
    let inBlock = false;
  
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
  
      // Look for either "Global alias:" or "Global aliases:"
      if (line.includes("Global alias:")) {
        inBlock = true;
  
        // Everything after the colon on this line
        const rest = line.split("Global alias:")[1].trim();
        if (rest) {
          // Usually there's just one alias here, but be safe
          for (const token of rest.split(/\s+/)) {
            if (token) aliases.push(token);
          }
        }
        continue;
      }
  
      if (line.includes("Global aliases:")) {
        inBlock = true;
  
        const rest = line.split("Global aliases:")[1].trim();
        if (rest) {
          for (const token of rest.split(/\s+/)) {
            if (token) aliases.push(token);
          }
        }
        continue;
      }
  
      if (inBlock) {
        // End of alias block when we hit a new section
        if (line.startsWith("====") || /^[A-Z][a-z]+:/.test(line)) {
          break;
        }
  
        // Continuation lines are just aliases, one per line
        const alias = line.split(/\s+/)[0].trim();
        if (alias) {
          aliases.push(alias);
        }
      }
    }
  
    console.log("getGarageBucketAliases", { idOrAlias, aliases });
    return aliases;
  }
  