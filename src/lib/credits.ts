const CREDIT_KEY_PATTERN = /(credit|credits|point|points|balance|quota|coin|remainingCredits|remaining_credit)/i;
const IGNORED_KEY_PATTERN = /(id|account|phone|mobile|name|avatar|email|created|updated)/i;

export function extractCreditBalance(value: unknown, depth = 0): number | undefined {
  if (depth > 6 || !isRecord(value)) {
    return undefined;
  }

  for (const [key, child] of Object.entries(value)) {
    if (CREDIT_KEY_PATTERN.test(key) && !IGNORED_KEY_PATTERN.test(key)) {
      const parsed = parseCreditNumber(child);
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }

  for (const child of Object.values(value)) {
    if (isRecord(child) || Array.isArray(child)) {
      const nested = extractCreditBalance(child, depth + 1);
      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
}

function parseCreditNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string") {
    const normalized = value.replaceAll(",", "").trim();
    if (/^\d+(\.\d+)?$/.test(normalized)) {
      return Math.max(0, Math.floor(Number(normalized)));
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
