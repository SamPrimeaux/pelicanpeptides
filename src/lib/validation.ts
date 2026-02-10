export function parsePositiveInt(n: unknown, { min = 1, max = 999 }: { min?: number; max?: number } = {}) {
  const v = typeof n === "string" && n.trim() !== "" ? Number(n) : Number(n);
  if (!Number.isInteger(v) || v < min || v > max) return null;
  return v;
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

