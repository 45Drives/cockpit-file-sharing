// backends/bucketUtils.ts

export function parseTags(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    text
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const [k, v] = pair.split("=");
        if (k && v) out[k.trim()] = v.trim();
      });
    return out;
  }
  
  export function parseList(text: string): string[] {
    return text
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  
  export const BINARY_MULTIPLIERS: Record<string, number> = {
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
    TiB: 1024 ** 4,
  };
  
  export const DECIMAL_MULTIPLIERS: Record<string, number> = {
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
  };

  export function parseQuotaSize(
    raw: string,
    unit: string,
    multipliers: Record<string, number>,
    fallbackUnit?: string,
  ): { bytes: number | null; sizeString: string | null } {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) {
      return { bytes: null, sizeString: null };
    }
  
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return { bytes: null, sizeString: null };
    }
  
    const resolvedUnit =
      multipliers[unit] !== undefined
        ? unit
        : fallbackUnit && multipliers[fallbackUnit] !== undefined
          ? fallbackUnit
          : unit;
  
    const factor = multipliers[resolvedUnit] ?? 1;
    const bytes = Math.round(numeric * factor);
    const sizeString = `${trimmed}${resolvedUnit}`;
  
    return { bytes, sizeString };
  }

  export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  
    const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
    let value = bytes;
    let idx = 0;
  
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
  
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[idx]}`;
  }
  export function splitBytesBinary(
    bytes?: number | null,
  ): { value: string; unit: "MiB" | "GiB" | "TiB" } {
    if (!Number.isFinite(bytes) || !bytes || bytes <= 0) {
      return { value: "", unit: "GiB" };
    }
  
    const MiB = 1024 ** 2;
    const GiB = 1024 ** 3;
    const TiB = 1024 ** 4;
  
    if (bytes % TiB === 0) return { value: String(bytes / TiB), unit: "TiB" };
    if (bytes % GiB === 0) return { value: String(bytes / GiB), unit: "GiB" };
    return { value: String(Math.round(bytes / MiB)), unit: "MiB" };
  }

  export function generateSecret(length = 32): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    const array = new Uint32Array(length);
  
    window.crypto.getRandomValues(array);
  
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[array[i]! % chars.length];
    }
    return result;
  }

  // datetime.ts
export function formatIsoLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(d);
}

export function tryFormatExpiryLocal(expiresAt?: string | null): string {
  if (!expiresAt) return "";
  return formatIsoLocal(expiresAt);
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
