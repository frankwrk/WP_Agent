function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : normalizeCanonicalValue(item),
    );
  }

  if (isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item !== undefined) {
        normalized[key] = normalizeCanonicalValue(item);
      }
    }
    return normalized;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

export function canonicalJsonStringify(value: unknown): string {
  const normalized = normalizeCanonicalValue(value ?? {});
  const json = JSON.stringify(normalized);
  return json === undefined ? "{}" : json;
}
