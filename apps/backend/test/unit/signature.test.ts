import assert from "node:assert/strict";
import test from "node:test";
import nacl from "tweetnacl";
import {
  buildCanonicalSignatureString,
  canonicalizeQuery,
  createSignedRequestHeaders,
  verifyCanonicalStringSignature,
} from "../../src/services/wp/signature";

function generateSigningSecretBase64(): string {
  return Buffer.from(nacl.sign.keyPair().secretKey).toString("base64");
}

test("canonical query is sorted and percent-encoded deterministically", () => {
  const canonical = canonicalizeQuery("z=last&a=1&space=hello+world&a=0");
  assert.equal(canonical, "a=0&a=1&space=hello%20world&z=last");
});

test("signature binds to method/path/query/host/audience", () => {
  const secretKey = generateSigningSecretBase64();

  const signed = createSignedRequestHeaders({
    installationId: "a98ed86b-e661-4d5b-b0ea-b2628ea65298",
    method: "GET",
    url: "http://localhost:8080/wp-json/wp-agent/v1/manifest?b=2&a=1",
    body: {},
    timestamp: 1_777_777_777,
    ttlSeconds: 180,
    toolCallId: "f55d3529-0422-4150-985f-f476b0e703ca",
    signingPrivateKeyBase64: secretKey,
  });

  const signature = signed.headers["X-WP-Agent-Signature"];
  assert.equal(signed.headers["X-WP-Agent-Audience"], "wp-agent-runtime");
  const publicKey = Buffer.from(
    nacl.sign.keyPair.fromSecretKey(Buffer.from(secretKey, "base64")).publicKey,
  ).toString("base64");

  assert.equal(
    verifyCanonicalStringSignature({
      canonicalString: signed.canonicalString,
      signatureBase64: signature,
      publicKeyBase64: publicKey,
    }),
    true,
  );

  const tamperedCanonical = buildCanonicalSignatureString({
    installationId: "a98ed86b-e661-4d5b-b0ea-b2628ea65298",
    toolCallId: "f55d3529-0422-4150-985f-f476b0e703ca",
    timestamp: 1_777_777_777,
    ttlSeconds: 180,
    method: "GET",
    host: "localhost:8080",
    audience: "different-audience",
    path: "/wp-json/wp-agent/v1/other",
    query: "a=1&b=2",
    body: {},
  });

  assert.equal(
    verifyCanonicalStringSignature({
      canonicalString: tamperedCanonical,
      signatureBase64: signature,
      publicKeyBase64: publicKey,
    }),
    false,
  );
});
