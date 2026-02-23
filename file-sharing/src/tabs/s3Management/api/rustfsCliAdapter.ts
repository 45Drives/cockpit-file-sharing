import type { BucketVersioningStatus, McAliasCandidate, RustfsBucket } from "../types/types";
import pLimit from "p-limit";
import { server, Command, unwrap } from "@45drives/houston-common-lib";

const bucketLimit = pLimit(6);

let RUSTFS_ALIAS = process.env.RUSTFS_RC_ALIAS || "local";

export function setRustfsAlias(alias: string): void {
  const trimmed = String(alias ?? "").trim();
  if (!trimmed) return;
  RUSTFS_ALIAS = trimmed;
}

export function getRustfsAlias(): string {
  return RUSTFS_ALIAS;
}

type RunRcResult = {
  stdout: string;
  stderr: string;
  exitStatus: number;
};

async function runRc(args: string[], allowFailure = false): Promise<RunRcResult> {
  const cmd = new Command(["rc", ...args], { superuser: "require" });
  const proc = await unwrap(server.execute(cmd, false));
  const res: RunRcResult = {
    stdout: proc.getStdout(),
    stderr: proc.getStderr(),
    exitStatus: proc.exitStatus,
  };
  const { stdout, stderr, exitStatus } = res;

  if (exitStatus !== 0 && !allowFailure) {
    const msg = stderr.trim() || stdout.trim() || `rc exited with status ${exitStatus}`;
    const e = new Error(msg) as any;
    e.stdout = stdout;
    e.stderr = stderr;
    e.exitStatus = exitStatus;
    e.cause = res;
    throw e;
  }

  return { stdout, stderr, exitStatus };
}

async function runRcWithFallback(argVariants: string[][]): Promise<RunRcResult> {
  let lastErr: unknown;
  for (const args of argVariants) {
    try {
      return await runRc(args);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("RustFS command failed");
}

function parseJsonLines(text: string): any[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Prefer parsing as one full JSON payload first (rc often returns pretty JSON).
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Fallback: JSONL parsing for commands that emit one JSON object per line.
  }

  return trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function rcJsonLinesWithFallback(subArgsList: string[][]): Promise<any[]> {
  let lastErr: unknown;
  for (const subArgs of subArgsList) {
    try {
      const { stdout } = await runRc(["--json", ...subArgs]);
      return parseJsonLines(stdout);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("RustFS command failed");
}

async function rcJsonSingleWithFallback(subArgsList: string[][]): Promise<any> {
  const list = await rcJsonLinesWithFallback(subArgsList);
  return list[0] ?? {};
}

export async function listRustfsAliasCandidates(): Promise<McAliasCandidate[]> {
  const { stdout } = await runRc(["--json", "alias", "list"]);
  const rows = parseJsonLines(stdout);

  const candidates: McAliasCandidate[] = [];
  const pushAlias = (value: unknown) => {
    const alias = String(value ?? "").trim();
    if (!alias) return;
    if (candidates.some((c) => c.alias === alias)) return;
    candidates.push({ alias });
  };

  for (const r of rows) {
    // rc may return a single JSON object with { aliases: [...] }
    const nested = (r as any)?.aliases;
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        pushAlias((entry as any)?.alias ?? (entry as any)?.name);
      }
      continue;
    }

    pushAlias((r as any)?.alias ?? (r as any)?.name);
  }

  return candidates;
}

export async function isRustfsAvailable(): Promise<boolean> {
  try {
    await runRc(["--json", "alias", "list"]);
    return true;
  } catch (e: any) {
    console.warn("RustFS availability check failed (rc --json alias list):", {
      message: e?.message,
      stderr: e?.stderr,
      stdout: e?.stdout,
      exitStatus: e?.exitStatus,
    });
    return false;
  }
}

export async function getRustfsBucketStats(bucketName: string): Promise<{
  createdAt?: string;
  region?: string;
  objectCount: number;
  sizeBytes: number;
  versionsCount?: number;
  versioningStatus?: BucketVersioningStatus;
  objectLockEnabled?: boolean;
  tagsFromStat?: Record<string, string>;
}> {
  const bucketPath = `${RUSTFS_ALIAS}/${bucketName}`;
  try {
    const objects = await rcJsonLinesWithFallback([
      ["find", bucketPath],
    ]);

    const payload = objects[0] as any;
    const derivedCount = Number(payload?.total_count) || 0;
    const derivedSize = Number(payload?.total_size_bytes) || 0;

    return {
      createdAt: undefined,
      region: undefined,
      objectCount: derivedCount,
      sizeBytes: derivedSize,
      versionsCount: undefined,
      versioningStatus: undefined,
      objectLockEnabled: undefined,
      tagsFromStat: undefined,
    };
  } catch {
    // Keep zero values if find is unavailable or returns unexpected format.
    return {
      createdAt: undefined,
      region: undefined,
      objectCount: 0,
      sizeBytes: 0,
      versionsCount: undefined,
      versioningStatus: undefined,
      objectLockEnabled: undefined,
      tagsFromStat: undefined,
    };
  }
}

export async function getRustfsBucketQuotaBytes(bucketName: string): Promise<number | undefined> {
  try {
    const entry = await rcJsonSingleWithFallback([
      ["quota", "info", `${RUSTFS_ALIAS}/${bucketName}`],
    ]);

    const quota = (entry as any).quota;
    return typeof quota === "number" ? quota : undefined;
  } catch {
    return undefined;
  }
}

export async function listBucketsFromRustfs(): Promise<RustfsBucket[]> {
  const entriesRaw = await rcJsonLinesWithFallback([
    ["ls", RUSTFS_ALIAS],
  ]);

  const entries =
    entriesRaw.length === 1 && Array.isArray((entriesRaw[0] as any)?.items)
      ? ((entriesRaw[0] as any).items as any[])
      : entriesRaw;

  const bucketEntries = entries.filter((e) => {
    if ((e as any).is_dir === true) return true;
    if (e.type === "folder" || e.type === "bucket") return true;
    return false;
  });

  const detailed = await Promise.all(
    bucketEntries.map((entry) =>
      bucketLimit(async () => {
        const rawName: string =
          entry.key || entry.name || entry.bucket || entry.target || "";
        const bucketName = String(rawName).replace(/\/$/, "");

        if (!bucketName) return undefined;

        const [stats, quotaBytes] = await Promise.all([
          getRustfsBucketStats(bucketName),
          getRustfsBucketQuotaBytes(bucketName),
        ]);

        const { createdAt, region, objectCount, sizeBytes, versionsCount, versioningStatus, objectLockEnabled, tagsFromStat } = stats;
        const tags = tagsFromStat;
        const owner: string | undefined =
          (tags && (tags.owner || tags.Owner || tags.bucketOwner)) || undefined;

        const inferredVersioning: BucketVersioningStatus | undefined =
          versioningStatus ??
          (versionsCount && versionsCount > 0 ? "Enabled" : "Suspended");

        const bucket: RustfsBucket = {
          backendKind: "rustfs",
          name: bucketName,
          createdAt,
          region: region || "rustfs-default-region",
          owner,
          policy: undefined,
          objectCount,
          sizeBytes,
          quotaBytes,
          versioning: inferredVersioning,
          tags: tags || undefined,
          objectLockEnabled,
        };

        return bucket;
      })
    )
  );

  return detailed.filter((b): b is RustfsBucket => Boolean(b));
}

export interface CreateBucketInRustfsOptions {
  region?: string;
  withLock?: boolean;
  withVersioning?: boolean;
  quotaSize?: string;
}

export async function createBucketFromRustfs(
  bucketName: string,
  options: CreateBucketInRustfsOptions = {}
): Promise<void> {
  if (!bucketName) {
    throw new Error("createBucketFromRustfs: bucketName is required");
  }

  const bucketPath = `${RUSTFS_ALIAS}/${bucketName}`;
  await runRc(["mb", bucketPath]);

  if (options.withVersioning) {
    await runRcWithFallback([
      ["version", "enable", bucketPath],
      ["version", "set", "enabled", bucketPath],
    ]);
  }

  if (options.quotaSize && options.quotaSize.trim()) {
    await runRcWithFallback([
      ["quota", "set", bucketPath, "--size", options.quotaSize.trim()],
      ["quota", "set", "--size", options.quotaSize.trim(), bucketPath],
    ]);
  }
}

export async function deleteBucketFromRustfs(
  bucketName: string,
  options?: { force?: boolean }
): Promise<void> {
  if (!bucketName) {
    throw new Error("deleteBucketFromRustfs: bucketName is required");
  }

  const bucketPath = `${RUSTFS_ALIAS}/${bucketName}`;
  if (options?.force ?? true) {
    await runRcWithFallback([
      ["rb", bucketPath, "--force", "--dangerous"],
      ["rb", bucketPath, "--force"],
      ["rb", bucketPath],
    ]);
    return;
  }

  await runRc(["rb", bucketPath]);
}

export interface UpdateRustfsBucketOptions {
  versioning?: boolean;
  quotaSize?: string | null;
  tags?: Record<string, string> | null;
}

export async function updateRustfsBucket(
  bucketName: string,
  options: UpdateRustfsBucketOptions,
): Promise<void> {
  if (!bucketName) {
    throw new Error("updateRustfsBucket: bucketName is required");
  }

  const bucketPath = `${RUSTFS_ALIAS}/${bucketName}`;

  if (typeof options.versioning === "boolean") {
    if (options.versioning) {
      await runRcWithFallback([
        ["version", "enable", bucketPath],
        ["version", "set", "enabled", bucketPath],
      ]);
    } else {
      await runRcWithFallback([
        ["version", "suspend", bucketPath],
        ["version", "disable", bucketPath],
        ["version", "set", "disabled", bucketPath],
      ]);
    }
  }

  if (options.quotaSize !== undefined) {
    if (options.quotaSize === null || options.quotaSize.trim() === "") {
      await runRcWithFallback([
        ["quota", "clear", bucketPath],
        ["quota", "set", bucketPath, "--size", "0"],
      ]);
    } else {
      await runRcWithFallback([
        ["quota", "set", bucketPath, "--size", options.quotaSize.trim()],
        ["quota", "set", "--size", options.quotaSize.trim(), bucketPath],
      ]);
    }
  }

  if ("tags" in options) {
    const { tags } = options;

    if (tags === null || !tags || Object.keys(tags).length === 0) {
      await runRcWithFallback([
        ["tag", "remove", bucketPath],
        ["tag", "clear", bucketPath],
      ]);
    } else {
      const tagStr = Object.entries(tags)
        .map(([k, v]) => `${k}=${v}`)
        .join("&");

      await runRcWithFallback([
        ["tag", "set", bucketPath, tagStr],
        ["tag", "set", bucketPath, "--tags", tagStr],
      ]);
    }
  }
}
