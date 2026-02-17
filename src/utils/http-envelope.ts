export interface ApiErrorShape {
  code: string;
  message: string;
  [key: string]: unknown;
}

export interface ApiEnvelope<T = unknown> {
  ok: boolean;
  data: T | null;
  error: ApiErrorShape | null;
  meta: Record<string, unknown> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isApiEnvelope(value: unknown): value is ApiEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.ok === "boolean"
    && "data" in value
    && "error" in value
    && "meta" in value
  );
}

export function withRequestMeta<T>(
  payload: T,
  requestId: string,
): T {
  if (!isApiEnvelope(payload)) {
    return payload;
  }

  const existingMeta = payload.meta && isRecord(payload.meta) ? payload.meta : {};
  return {
    ...payload,
    meta: {
      ...existingMeta,
      request_id: requestId,
    },
  } as T;
}
