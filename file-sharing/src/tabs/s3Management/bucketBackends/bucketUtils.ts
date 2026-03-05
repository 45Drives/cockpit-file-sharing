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

  export function generateAccessKey(length = 20): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const alphabetLength = alphabet.length;
    const hasWebCrypto =
      typeof window !== "undefined" &&
      !!window.crypto &&
      typeof window.crypto.getRandomValues === "function";

    if (hasWebCrypto) {
      const maxUnbiasedByte = Math.floor(256 / alphabetLength) * alphabetLength;
      const randomBytes = new Uint8Array(length * 2);
      let out = "";
      let i = 0;

      while (i < length) {
        window.crypto.getRandomValues(randomBytes);
        for (let j = 0; j < randomBytes.length && i < length; j += 1) {
          const byte = randomBytes[j]!;
          if (byte >= maxUnbiasedByte) continue;
          out += alphabet[byte % alphabetLength];
          i += 1;
        }
      }
      return out;
    }

    let out = "";
    for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(Math.random() * alphabetLength)];
    return out;
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

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
