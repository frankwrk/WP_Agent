import { createHash, randomUUID } from "node:crypto";
import nacl from "tweetnacl";
import { getConfig } from "../../config";
import { canonicalJsonStringify } from "../../utils/canonical-json";

export const SIGNATURE_ALGORITHM = "ed25519";

export interface CanonicalSignatureInput {
  installationId: string;
  toolCallId: string;
  timestamp: number;
  ttlSeconds: number;
  method: string;
  host: string;
  audience: string;
  path: string;
  query: string;
  body: unknown;
}

export interface SignedRequestOptions {
  installationId: string;
  method: string;
  url: string;
  audience?: string;
  body?: unknown;
  ttlSeconds?: number;
  timestamp?: number;
  toolCallId?: string;
  signingPrivateKeyBase64?: string;
}

export function canonicalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    return value;
  }
}

export function canonicalizeQuery(query: string): string {
  const raw = query.startsWith("?") ? query.slice(1) : query;
  if (!raw) {
    return "";
  }

  const pairs = raw
    .split("&")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const separatorIndex = segment.indexOf("=");
      if (separatorIndex === -1) {
        return [decodeQueryComponent(segment), ""] as const;
      }

      const key = segment.slice(0, separatorIndex);
      const value = segment.slice(separatorIndex + 1);
      return [decodeQueryComponent(key), decodeQueryComponent(value)] as const;
    })
    .sort((a, b) => {
      if (a[0] !== b[0]) {
        return a[0].localeCompare(b[0]);
      }
      return a[1].localeCompare(b[1]);
    });

  return pairs
    .map(
      ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

export function canonicalBodyHash(body: unknown): string {
  const canonicalBody = canonicalJsonStringify(body ?? {});
  return createHash("sha256").update(canonicalBody, "utf8").digest("hex");
}

export function buildCanonicalSignatureString(
  input: CanonicalSignatureInput,
): string {
  return [
    input.installationId,
    input.toolCallId,
    String(input.timestamp),
    String(input.ttlSeconds),
    input.method.toUpperCase(),
    input.host.toLowerCase(),
    input.audience,
    canonicalizePath(input.path),
    canonicalizeQuery(input.query),
    canonicalBodyHash(input.body),
  ].join("\n");
}

function decodeBase64Bytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function ensureSecretKey(secretKeyBase64: string): Uint8Array {
  const decoded = decodeBase64Bytes(secretKeyBase64);
  if (decoded.byteLength !== nacl.sign.secretKeyLength) {
    throw new Error("BACKEND_SIGNING_PRIVATE_KEY must be base64 encoded 64-byte Ed25519 secret key");
  }
  return decoded;
}

export function derivePublicKeyFromPrivateKey(secretKeyBase64: string): string {
  const secret = ensureSecretKey(secretKeyBase64);
  const keyPair = nacl.sign.keyPair.fromSecretKey(secret);
  return Buffer.from(keyPair.publicKey).toString("base64");
}

export function signCanonicalString(
  canonicalString: string,
  secretKeyBase64: string,
): string {
  const secret = ensureSecretKey(secretKeyBase64);
  const signature = nacl.sign.detached(
    new TextEncoder().encode(canonicalString),
    secret,
  );

  return Buffer.from(signature).toString("base64");
}

export function verifyCanonicalStringSignature(options: {
  canonicalString: string;
  signatureBase64: string;
  publicKeyBase64: string;
}): boolean {
  const publicKey = decodeBase64Bytes(options.publicKeyBase64);
  const signature = decodeBase64Bytes(options.signatureBase64);

  if (publicKey.byteLength !== nacl.sign.publicKeyLength) {
    return false;
  }

  if (signature.byteLength !== nacl.sign.signatureLength) {
    return false;
  }

  return nacl.sign.detached.verify(
    new TextEncoder().encode(options.canonicalString),
    signature,
    publicKey,
  );
}

export function createSignedRequestHeaders(options: SignedRequestOptions): {
  headers: Record<string, string>;
  canonicalString: string;
  toolCallId: string;
} {
  const config = getConfig();
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = options.ttlSeconds ?? config.signatureTtlSeconds;
  const toolCallId = options.toolCallId ?? randomUUID();
  const audience = options.audience ?? config.backendSigningAudience;
  const url = new URL(options.url);

  const canonicalString = buildCanonicalSignatureString({
    installationId: options.installationId,
    toolCallId,
    timestamp,
    ttlSeconds,
    method: options.method,
    host: url.host,
    audience,
    path: url.pathname,
    query: url.search,
    body: options.body ?? {},
  });

  const privateKey =
    options.signingPrivateKeyBase64 ?? config.backendSigningPrivateKey;
  if (!privateKey) {
    throw new Error("BACKEND_SIGNING_PRIVATE_KEY is required for signed WP requests");
  }

  const signature = signCanonicalString(canonicalString, privateKey);

  return {
    headers: {
      "X-WP-Agent-Installation": options.installationId,
      "X-WP-Agent-Timestamp": String(timestamp),
      "X-WP-Agent-TTL": String(ttlSeconds),
      "X-WP-Agent-ToolCallId": toolCallId,
      "X-WP-Agent-Audience": audience,
      "X-WP-Agent-Signature": signature,
      "X-WP-Agent-SignatureAlg": SIGNATURE_ALGORITHM,
    },
    canonicalString,
    toolCallId,
  };
}
