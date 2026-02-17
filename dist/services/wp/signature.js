"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIGNATURE_ALGORITHM = void 0;
exports.canonicalizePath = canonicalizePath;
exports.canonicalizeQuery = canonicalizeQuery;
exports.canonicalBodyHash = canonicalBodyHash;
exports.buildCanonicalSignatureString = buildCanonicalSignatureString;
exports.derivePublicKeyFromPrivateKey = derivePublicKeyFromPrivateKey;
exports.signCanonicalString = signCanonicalString;
exports.verifyCanonicalStringSignature = verifyCanonicalStringSignature;
exports.createSignedRequestHeaders = createSignedRequestHeaders;
const node_crypto_1 = require("node:crypto");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const config_1 = require("../../config");
const canonical_json_1 = require("../../utils/canonical-json");
exports.SIGNATURE_ALGORITHM = "ed25519";
function canonicalizePath(path) {
    const trimmed = path.trim();
    if (!trimmed) {
        return "/";
    }
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
function decodeQueryComponent(value) {
    try {
        return decodeURIComponent(value.replace(/\+/g, "%20"));
    }
    catch {
        return value;
    }
}
function canonicalizeQuery(query) {
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
            return [decodeQueryComponent(segment), ""];
        }
        const key = segment.slice(0, separatorIndex);
        const value = segment.slice(separatorIndex + 1);
        return [decodeQueryComponent(key), decodeQueryComponent(value)];
    })
        .sort((a, b) => {
        if (a[0] !== b[0]) {
            return a[0].localeCompare(b[0]);
        }
        return a[1].localeCompare(b[1]);
    });
    return pairs
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
}
function canonicalBodyHash(body) {
    const canonicalBody = (0, canonical_json_1.canonicalJsonStringify)(body ?? {});
    return (0, node_crypto_1.createHash)("sha256").update(canonicalBody, "utf8").digest("hex");
}
function buildCanonicalSignatureString(input) {
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
function decodeBase64Bytes(value) {
    return new Uint8Array(Buffer.from(value, "base64"));
}
function ensureSecretKey(secretKeyBase64) {
    const decoded = decodeBase64Bytes(secretKeyBase64);
    if (decoded.byteLength !== tweetnacl_1.default.sign.secretKeyLength) {
        throw new Error("BACKEND_SIGNING_PRIVATE_KEY must be base64 encoded 64-byte Ed25519 secret key");
    }
    return decoded;
}
function derivePublicKeyFromPrivateKey(secretKeyBase64) {
    const secret = ensureSecretKey(secretKeyBase64);
    const keyPair = tweetnacl_1.default.sign.keyPair.fromSecretKey(secret);
    return Buffer.from(keyPair.publicKey).toString("base64");
}
function signCanonicalString(canonicalString, secretKeyBase64) {
    const secret = ensureSecretKey(secretKeyBase64);
    const signature = tweetnacl_1.default.sign.detached(new TextEncoder().encode(canonicalString), secret);
    return Buffer.from(signature).toString("base64");
}
function verifyCanonicalStringSignature(options) {
    const publicKey = decodeBase64Bytes(options.publicKeyBase64);
    const signature = decodeBase64Bytes(options.signatureBase64);
    if (publicKey.byteLength !== tweetnacl_1.default.sign.publicKeyLength) {
        return false;
    }
    if (signature.byteLength !== tweetnacl_1.default.sign.signatureLength) {
        return false;
    }
    return tweetnacl_1.default.sign.detached.verify(new TextEncoder().encode(options.canonicalString), signature, publicKey);
}
function createSignedRequestHeaders(options) {
    const config = (0, config_1.getConfig)();
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
    const ttlSeconds = options.ttlSeconds ?? config.signatureTtlSeconds;
    const toolCallId = options.toolCallId ?? (0, node_crypto_1.randomUUID)();
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
    const privateKey = options.signingPrivateKeyBase64 ?? config.backendSigningPrivateKey;
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
            "X-WP-Agent-SignatureAlg": exports.SIGNATURE_ALGORITHM,
        },
        canonicalString,
    };
}
