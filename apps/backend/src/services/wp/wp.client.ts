import { createSignedRequestHeaders } from "./signature";

export interface SignedWpRequestOptions {
  installationId: string;
  url: string;
  method: "GET" | "POST";
  body?: unknown;
}

export interface SignedWpJsonResponse<T> {
  data: T;
  toolCallId: string;
}

export async function signedWpJsonRequestWithMeta<T>(
  options: SignedWpRequestOptions,
): Promise<SignedWpJsonResponse<T>> {
  const signed = createSignedRequestHeaders({
    installationId: options.installationId,
    url: options.url,
    method: options.method,
    body: options.body,
  });

  const requestHeaders: Record<string, string> = {
    ...signed.headers,
    Accept: "application/json",
  };

  let payload: string | undefined;
  if (options.method !== "GET") {
    payload = JSON.stringify(options.body ?? {});
    requestHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(options.url, {
    method: options.method,
    headers: requestHeaders,
    body: payload,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Signed WP request failed (${response.status}): ${JSON.stringify(parsed)}`,
    );
  }

  return {
    data: parsed as T,
    toolCallId: signed.toolCallId,
  };
}

export async function signedWpJsonRequest<T>(
  options: SignedWpRequestOptions,
): Promise<T> {
  const response = await signedWpJsonRequestWithMeta<T>(options);
  return response.data;
}

export function buildWpUrlWithQuery(
  baseUrl: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!query) {
    return baseUrl;
  }

  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

export async function signedWpGetJsonWithMeta<T>(options: {
  installationId: string;
  url: string;
  query?: Record<string, string | number | boolean | null | undefined>;
}): Promise<SignedWpJsonResponse<T>> {
  const urlWithQuery = buildWpUrlWithQuery(options.url, options.query);
  return signedWpJsonRequestWithMeta<T>({
    installationId: options.installationId,
    method: "GET",
    url: urlWithQuery,
  });
}

export async function signedWpGetJson<T>(options: {
  installationId: string;
  url: string;
  query?: Record<string, string | number | boolean | null | undefined>;
}): Promise<T> {
  const response = await signedWpGetJsonWithMeta<T>(options);
  return response.data;
}
