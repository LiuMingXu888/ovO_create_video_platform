const SECRET_KEY_PATTERN = /(cookie|authorization|token|secret|session|signature|credential|password)/i;
const SIGNED_URL_QUERY_PATTERN = /(token|signature|expires|security|credential|policy)/i;

export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && SECRET_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return redactSignedUrl(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey)
      ])
    );
  }

  return value;
}

function redactSignedUrl(value: string) {
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SIGNED_URL_QUERY_PATTERN.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString().replaceAll("%5BREDACTED%5D", "[REDACTED]");
  } catch {
    return value;
  }
}
