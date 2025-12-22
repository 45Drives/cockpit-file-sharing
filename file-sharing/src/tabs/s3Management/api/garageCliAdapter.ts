// garageCliAdapter.ts

import type { GarageBucket, GarageBucketOptions, GarageKeyListEntry, GarageKeyDetail, GarageBucketDashboardStats, GarageBucketKeyAccess,
} from "../types/types";
const { errorString } = legacy; // useSpawn no longer needed
import { legacy, server, Command, unwrap } from "@45drives/houston-common-lib";

const GARAGE_CMD = process.env.GARAGE_CMD || "garage";

/**
 * Run `garage ...` and return stdout as a trimmed string.
 */
export async function runGarage(subArgs: string[]): Promise<string> {
  const cmd = new Command([GARAGE_CMD, ...subArgs]);
  console.log("server", server);
  console.log("cmd", cmd);

  const proc = await unwrap(server.execute(cmd));

  const stderr = proc.getStderr?.() ?? "";
  if (stderr) {
    console.warn("Garage command warnings:", stderr);
  }

  const stdout = proc.getStdout?.() ?? "";
  console.log("stdoutresult", stdout);

  return stdout.trim();
}
export async function listBucketsFromGarage(): Promise<GarageBucket[]> {
  const text = await runGarage(["bucket", "list"]);
  const lines = text.split(/\r?\n/);

  const buckets: GarageBucket[] = [];

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
    const createdAtColumn = line.slice(createdStart, globalStart).trim();
    const globalAliasesSlice =
      localStart === -1
        ? line.slice(globalStart).trim()
        : line.slice(globalStart, localStart).trim();

    // Display name = first global alias if present, else bucket id
    let displayName = globalAliasesSlice.trim();
    if (displayName.includes(",")) {
      displayName = displayName.split(",")[0].trim();
    }
    if (!displayName) displayName = id;

    let info: GarageBucketDashboardStats | null = null;
    try {
      info = await getGarageBucketDashboardStats(id);
    } catch {
      info = null;
    }

    const bucket: GarageBucket = {
      backendKind: "garage",
      garageId: id,

      name: displayName,
      createdAt: info?.createdAt ?? createdAtColumn,

      objectCount: info?.objectCount ?? 0,
      sizeBytes: info?.totalSizeBytes ?? 0,
      quotaBytes: info?.quotaBytes,

      garageMaxObjects: info?.maxObjects,
      garageWebsiteEnabled: info?.websiteEnabled,

      // Use parsed aliases from the info output
      garageAliases: info?.globalAliases ?? [],
    };

    buckets.push(bucket);
  }

  return buckets;
}

export async function isGarageHealthy(): Promise<boolean> {
  try {
    const text = await runGarage(["status"]);
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


export async function deleteBucketFromGarage(
   
  bucketNameOrId: string
): Promise<void> {
  const aliases = await getGarageBucketAliases( bucketNameOrId);

  if (aliases.length === 0) {
    try {
      await runGarage(["bucket", "delete", bucketNameOrId, "--yes"]);
      return;
    } catch (e: any) {
      const msg = errorString(e);
      console.error("Failed to delete Garage bucket (no aliases):", bucketNameOrId, msg);
      throw new Error(`Failed to delete Garage bucket "${bucketNameOrId}": ${msg}`);
    }
  }

  if (aliases.length === 1) {
    const alias = aliases[0];
    try {
      await runGarage( ["bucket", "delete", alias, "--yes"]);
      return;
    } catch (e: any) {
      const msg = errorString(e);
      console.error("Failed to delete Garage bucket (single alias):", alias, msg);
      throw new Error(`Failed to delete Garage bucket "${alias}": ${msg}`);
    }
  }

  const keep = aliases[aliases.length - 1];

  for (const alias of aliases) {
    if (alias === keep) continue;

    try {
      await runGarage( ["bucket", "unalias", alias]);
    } catch (e: any) {
      const msg = errorString(e);
      console.error(`Failed to unalias "${alias}" for bucket "${bucketNameOrId}":`, msg);
      throw new Error(
        `Failed to unalias "${alias}" for Garage bucket "${bucketNameOrId}": ${msg}`
      );
    }
  }

  try {
    await runGarage( ["bucket", "delete", keep, "--yes"]);
  } catch (e: any) {
    const msg = errorString(e);
    console.error("Delete after unalias failed:", keep, msg);
    throw new Error(`Failed to delete Garage bucket "${keep}" after unaliasing: ${msg}`);
  }
}
        
export async function createGarageBucket(
  bucketName: string,
  options: GarageBucketOptions = {}
): Promise<void> {
  const args: string[] = ["bucket", "create", bucketName];

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
    // 1) create bucket
    await runGarage(args);

    // 2) quotas: size + max-objects
    if (options.quota != null || options.maxObjects != null) {
      const quotaArgs: string[] = ["bucket", "set-quotas", bucketName];
    
      if (options.quota != null) {
        quotaArgs.push("--max-size", String(options.quota).trim());
      }
      if (options.maxObjects != null) {
        quotaArgs.push("--max-objects", String(options.maxObjects));
      }
    
      await runGarage(quotaArgs);
    }
    

    // 3) website
    if (options.website?.enable) {
      const websiteArgs: string[] = ["bucket","website","--allow",bucketName,
      ];

      if (options.website.indexDocument) {
        websiteArgs.push("--index-document", options.website.indexDocument);
      }

      if (options.website.errorDocument) {
        websiteArgs.push("--error-document", options.website.errorDocument);
      }

      await runGarage(websiteArgs);
    }

    // 4) aliases
    if (options.aliases?.length) {
      for (const alias of options.aliases) {
        await runGarage(["bucket", "alias", bucketName, alias]);
      }
    }
  } catch (e: any) {
    const msg = errorString(e);
    console.error("Failed to create Garage bucket:", bucketName, msg);
    throw new Error(`Failed to create Garage bucket "${bucketName}": ${msg}`);
  }
}
    
async function getGarageBucketAliases(
   
  idOrAlias: string
): Promise<string[]> {
  const text = await runGarage( ["bucket", "info", idOrAlias]);
  const lines = text.split(/\r?\n/);

  const aliases: string[] = [];
  let inBlock = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.includes("Global alias:")) {
      inBlock = true;
      const rest = line.split("Global alias:")[1].trim();
      if (rest) {
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
      if (line.startsWith("====") || /^[A-Z][a-z]+:/.test(line)) {
        break;
      }

      const alias = line.split(/\s+/)[0].trim();
      if (alias) {
        aliases.push(alias);
      }
    }
  }

  return aliases;
}

function parseGarageKeyList(output: string): GarageKeyListEntry[] {
    const lines = output
      .split(/\r?\n/)
      .map(l => l.trimEnd())
      .filter(l => l.trim().length > 0);
  
    if (lines.length <= 1) {
      return [];
    }
  
    // Drop header line: "ID  Created  Name  Expiration"
    const dataLines = lines.slice(1);
  
    const entries: GarageKeyListEntry[] = [];
  
    for (const line of dataLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
  
      const parts = trimmed.split(/\s+/);
      if (parts.length < 4) {
        console.warn("Unexpected line in `garage key list`:", line);
        continue;
      }
  
      const id = parts[0];
      const created = parts[1];
      const expiration = parts[parts.length - 1];
      const name = parts.slice(2, parts.length - 1).join(" ");
  
      entries.push({ id, created, name, expiration });
    }
  
    return entries;
  }
  
  function parseGarageKeyInfo(output: string): GarageKeyDetail {
    const lines = output.split(/\r?\n/);
    const fields: Record<string, string> = {};
  
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
  
      if (trimmed.startsWith("==== BUCKETS FOR THIS KEY")) {
        break;
      }
  
      if (trimmed.startsWith("====")) {
        continue;
      }
  
      const m = trimmed.match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
  
      const key = m[1].trim();
      const value = m[2].trim();
      fields[key] = value;
    }
  
    return {
      id: fields["Key ID"] ?? "",
      name: fields["Key name"] ?? "",
      created: fields["Created"] ?? "",
      expiration: fields["Expiration"] ?? "",
      validity: fields["Validity"],
      canCreateBuckets:
        fields["Can create buckets"] !== undefined
          ? fields["Can create buckets"].toLowerCase() === "true"
          : undefined,
    };
  }
  export async function listGarageKeysWithInfo(
  ): Promise<GarageKeyDetail[]> {
    let listOut: string;
    try {
      listOut = await runGarage( ["key", "list"]);
    } catch (e: any) {
      const msg = errorString(e);
      console.error("Failed to run `garage key list`:", msg);
      throw new Error(`Failed to list Garage access keys: ${msg}`);
    }
  
    const entries = parseGarageKeyList(listOut);
    const results: GarageKeyDetail[] = [];
  
    for (const entry of entries) {
      let infoOut: string;
      try {
        infoOut = await runGarage( ["key", "info", entry.id]);
      } catch (e: any) {
        const msg = errorString(e);
        console.error(
          `Failed to get info for Garage access key "${entry.id}":`,
          msg
        );
        throw new Error(
          `Failed to get info for Garage access key "${entry.id}" (${entry.name}): ${msg}`
        );
      }
  
      const parsed = parseGarageKeyInfo(infoOut);
      results.push(parsed);
    }
  
    return results;
  }
  

  function parseGarageKeyInfoOutput(output: string): GarageKeyDetail {
    const lines = output.split(/\r?\n/);
    const fields: Record<string, string> = {};
  
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("====")) continue;
  
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
  
      const key = m[1].trim();
      const value = m[2].trim();
      fields[key] = value;
    }
  
    const id = fields["Key ID"] || "";
    const name = fields["Key name"] || "";
    const created = fields["Created"] || "";
    const expiration = fields["Expiration"] || "";
    const validity = fields["Validity"] || undefined;
  
    let canCreateBuckets: boolean | undefined;
    if (fields["Can create buckets"] !== undefined) {
      const v = fields["Can create buckets"].toLowerCase();
      if (v === "true") canCreateBuckets = true;
      else if (v === "false") canCreateBuckets = false;
    }
  
    return {id,name,created,expiration,validity,canCreateBuckets,
      // NEW: only present on `key create` output
      secretKey: fields["Secret key"] || undefined,
    };
  }
      
  // CREATE: just pass the pieces you actually need
  const creatingKeys = new Set<string>();

  export async function createGarageKey(
    name: string,
    canCreateBuckets?: boolean,
    expiresIn?: string
  ): Promise<GarageKeyDetail> {
    if (creatingKeys.has(name)) {
      console.warn("createGarageKey: duplicate call for", name);
      throw new Error(`Key creation already in progress for "${name}"`);
    }
  
    creatingKeys.add(name);
    try {
      const args = ["key", "create"] as string[];
  
      if (expiresIn) {
        args.push("--expires-in", expiresIn);
      }
      if (name) {
        args.push(name);
      }
  
      const createOut = await runGarage(args);
      const created = parseGarageKeyInfoOutput(createOut);
      const identifier = created.id || created.name || name;
  
      try {
        const infoOut = await runGarage(["key", "info", identifier]);
        const full = parseGarageKeyInfoOutput(infoOut);
  
        // preserve the one-time secret from the create output
        return {
          ...full,
          secretKey: created.secretKey,
        };
      } catch {
        // fall back to what we got from create, which includes secretKey
        return created;
      }
    } catch (e: any) {
      const msg = errorString(e);
      console.error("Failed to create Garage key:", name, msg);
      throw new Error(`Failed to create Garage key "${name}": ${msg}`);
    } finally {
      creatingKeys.delete(name);
    }
  }
      
  export async function deleteGarageKey(
     
    id: string
  ): Promise<void> {
    try {
      await runGarage( ["key", "delete", id, "--yes"]);
    } catch (e: any) {
      const msg = errorString(e);
      console.error("Failed to delete Garage key:", id, msg);
      throw new Error(`Failed to delete Garage key "${id}": ${msg}`);
    }
  }
    // UPDATE: stub for now – CLI doesn’t really support editing keys
    export async function updateGarageKey(
      idOrName: string,
      name?: string,
      canCreateBuckets?: boolean
    ): Promise<GarageKeyDetail> {
      try {
        // Get current state
        const currentInfoOut = await runGarage(["key", "info", idOrName]);
        const current = parseGarageKeyInfoOutput(currentInfoOut);
    
        let handle = idOrName;
    
        // 1) Rename if requested and changed
        const trimmedName = name?.trim();
        if (trimmedName && trimmedName !== current.name) {
          // use whatever identifier the CLI accepts (ID or name)
          await runGarage(["key", "rename", handle, trimmedName]);
          handle = trimmedName;
        }
    
        // 2) Update "can create buckets" if requested and changed
        if (typeof canCreateBuckets === "boolean" &&
            current.canCreateBuckets !== canCreateBuckets) {
          const args = canCreateBuckets
            ? ["key", "allow", "--create-buckets", handle]
            : ["key", "deny", "--create-buckets", handle];
    
          await runGarage(args);
        }
    
        // 3) Return fresh info
        const finalInfoOut = await runGarage(["key", "info", handle]);
        return parseGarageKeyInfoOutput(finalInfoOut);
      } catch (e: any) {
        const msg = errorString(e);
        console.error("Failed to update Garage key:", idOrName, msg);
        throw new Error(`Failed to update Garage key "${idOrName}": ${msg}`);
      }
    }
    

    export async function updateGarageBucket(
      garageId: string,
      opts: GarageBucketOptions,
    ): Promise<void> {
      // 1) QUOTAS: size + max-objects (both optional, can clear)
      if (opts.quota !== undefined || opts.maxObjects !== undefined) {
        const quotaArgs: string[] = ["bucket", "set-quotas", garageId];
    
        // size
        if (opts.quota !== undefined) {
          if (opts.quota === null) {
            quotaArgs.push("--max-size", "0");
          } else {
            quotaArgs.push("--max-size", String(opts.quota).trim());
          }
        }
    
        // max-objects
        if (opts.maxObjects !== undefined) {
          if (opts.maxObjects === null) {
            // clear max-objects
            quotaArgs.push("--max-objects", "0");
          } else {
            quotaArgs.push("--max-objects", String(opts.maxObjects));
          }
        }
    
        await runGarage(quotaArgs);
      }
    
      // 2) WEBSITE
      if (opts.website) {
        const args = ["bucket", "website"];
    
        if (opts.website.enable) {
          args.push("--allow");
    
          if (opts.website.indexDocument) {
            args.push("--index-document", opts.website.indexDocument);
          }
          if (opts.website.errorDocument) {
            args.push("--error-document", opts.website.errorDocument);
          }
        } else {
          args.push("--deny");
        }
    
        args.push(garageId);
        await runGarage(args);
      }
    
      // 3) ALIASES (naive add-only, as before)
      if (opts.aliases !== undefined && opts.aliases !== null) {
        for (const alias of opts.aliases) {
          await runGarage(["bucket", "alias", garageId, alias]);
        }
      }
    }
    

// Shared unit multipliers + helper (drop in near top of file, above functions)
const GARAGE_UNIT_MULTIPLIERS: Record<string, number> = {
  B: 1,
  KIB: 1024,
  MIB: 1024 ** 2,
  GIB: 1024 ** 3,
  TIB: 1024 ** 4,
  PIB: 1024 ** 5,

  KB: 1000,
  MB: 1000 ** 2,
  GB: 1000 ** 3,
  TB: 1000 ** 4,
  PB: 1000 ** 5,
};

function garageToBytes(numStr: string, unitStr?: string): number | undefined {
  const num = Number(numStr);
  if (!Number.isFinite(num)) return undefined;

  const unitRaw = (unitStr || "B").toUpperCase();
  const factor = GARAGE_UNIT_MULTIPLIERS[unitRaw] ?? 1;
  return Math.round(num * factor);
}

/**
 * Parse `garage bucket info` output into a typed stats object.
 * This is the single source of truth for bucket info parsing.
 */
function parseGarageBucketInfo(output: string): GarageBucketDashboardStats {
  const lines = output.split(/\r?\n/);

  let bucketId: string | undefined;
  let createdAt: string | undefined;

  let totalSizeBytes = 0;
  let objectCount = 0;

  let quotaBytes: number | undefined;
  let maxObjects: number | undefined;

  let websiteEnabled: boolean | undefined;

  const keys: GarageBucketKeyAccess[] = [];

  // Global aliases parsing (supports both inline and multi-line blocks)
  let globalAliases: string[] = [];
  let inGlobalAliasesBlock = false;

  // Keys table parsing
  let inKeysSection = false;
  let sawKeysHeader = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) continue;

    // If we enter a new section, end any previous "block" parsing
    if (t.startsWith("====")) {
      inGlobalAliasesBlock = false;

      if (t.startsWith("==== KEYS FOR THIS BUCKET")) {
        inKeysSection = true;
        sawKeysHeader = false;
        continue;
      }

      // Any other section header ends keys parsing
      inKeysSection = false;
      continue;
    }

    // If we are in the KEYS section, parse the table rows
    if (inKeysSection) {
      if (!sawKeysHeader) {
        // "Permissions  Access key    Local aliases"
        if (/^Permissions\s+Access key\s+Local aliases/i.test(t)) {
          sawKeysHeader = true;
        }
        continue;
      }

      // Data rows:
      // RW           GK3...  backups-user
      const parts = t.split(/\s+/);
      if (parts.length >= 2) {
        const permissions = parts[0];
        const accessKey = parts[1];
        const localAliases = parts.slice(2);
        keys.push({ permissions, accessKey, localAliases });
      }
      continue;
    }

    // Handle continuation lines for Global aliases block (multi-line listing)
    if (inGlobalAliasesBlock) {
      // A line that looks like a new field ends the aliases block
      if (/^[A-Z][a-z]+:/.test(t)) {
        inGlobalAliasesBlock = false;
        // fall through to parse the field normally
      } else {
        const alias = t.split(/\s+/)[0];
        if (alias) globalAliases.push(alias);
        continue;
      }
    }

    // Bucket: <id>
    {
      const m = /^Bucket:\s*(.+)$/i.exec(t);
      if (m) {
        bucketId = m[1].trim();
        continue;
      }
    }

    // Created: <timestamp>
    {
      const m = /^Created:\s*(.+)$/i.exec(t);
      if (m) {
        createdAt = m[1].trim();
        continue;
      }
    }

    // Size: 0 B (0 B)
    {
      const m = /^Size:\s*([\d.]+)\s*([A-Za-z]+)/i.exec(t);
      if (m) {
        const bytes = garageToBytes(m[1], m[2]);
        if (bytes !== undefined) totalSizeBytes = bytes;
        continue;
      }
    }

    // Objects: 0
    {
      const m = /^Objects:\s*(\d+)/i.exec(t);
      if (m) {
        objectCount = Number(m[1]);
        continue;
      }
    }

    // Website access: false
    {
      const m = /^Website access:\s*(\w+)/i.exec(t);
      if (m) {
        websiteEnabled = m[1].toLowerCase() === "true";
        continue;
      }
    }

    // maximum size:  50.0 GiB (53.7 GB)
    {
      const m = /maximum size:\s*([\d.]+)\s*([A-Za-z]+)\b/i.exec(t);
      if (m) {
        const bytes = garageToBytes(m[1], m[2]);
        if (bytes !== undefined) quotaBytes = bytes;
        continue;
      }
    }

    // maximum number of objects:  100
    {
      const m = /maximum (?:number of )?objects:\s*([\d,]+)/i.exec(t);
      if (m) {
        const n = Number(m[1].replace(/,/g, ""));
        if (Number.isFinite(n)) maxObjects = n;
        continue;
      }
    }

    // Global alias: foo
    {
      const m = /^Global alias:\s*(.*)$/i.exec(t);
      if (m) {
        const rest = m[1].trim();
        globalAliases = rest ? rest.split(/\s+/).filter(Boolean) : [];
        inGlobalAliasesBlock = true;
        continue;
      }
    }

    // Global aliases: foo bar
    {
      const m = /^Global aliases:\s*(.*)$/i.exec(t);
      if (m) {
        const rest = m[1].trim();
        globalAliases = rest ? rest.split(/\s+/).filter(Boolean) : [];
        inGlobalAliasesBlock = true;
        continue;
      }
    }
  }

  return {
    bucketId,
    createdAt,
    totalSizeBytes,
    objectCount,
    quotaBytes,
    maxObjects,
    websiteEnabled,
    globalAliases: globalAliases.length ? globalAliases : undefined,
    keys,
    raw: output,
  };
}

export async function getGarageBucketDashboardStats(
  bucketNameOrId: string
): Promise<GarageBucketDashboardStats> {
  const out = await runGarage(["bucket", "info", bucketNameOrId]);
  return parseGarageBucketInfo(out);
}

/**
 * Object-level stats is the same as bucket usage in Garage.
 */
export async function getBucketObjectStatsFromGarage(
  bucketNameOrId: string
): Promise<{ objectCount: number; sizeBytes: number }> {
  const info = await getGarageBucketDashboardStats(bucketNameOrId);
  return {
    objectCount: info.objectCount,
    sizeBytes: info.totalSizeBytes,
  };
}
