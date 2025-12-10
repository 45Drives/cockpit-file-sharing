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