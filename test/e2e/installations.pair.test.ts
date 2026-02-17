import assert from "node:assert/strict";
import test from "node:test";
import nacl from "tweetnacl";
import { buildServer } from "../../src/server";
import {
  MemoryInstallationStore,
  type InstallationsRouteOptions,
} from "../../src/routes/installations";
import type { AppConfig } from "../../src/config";

function generateSecretKeyBase64(): string {
  const keyPair = nacl.sign.keyPair();
  return Buffer.from(keyPair.secretKey).toString("base64");
}

function generatePublicKeyBase64(): string {
  const keyPair = nacl.sign.keyPair();
  return Buffer.from(keyPair.publicKey).toString("base64");
}

function buildInstallationsOptions(
  store: MemoryInstallationStore,
): InstallationsRouteOptions {
  const signingPrivateKey = generateSecretKeyBase64();

  const config: AppConfig = {
    port: 3001,
    databaseUrl: "",
    openrouterApiKey: "test-key",
    openrouterBaseUrl: "https://openrouter.test/api/v1",
    pairingBootstrapSecret: "test-bootstrap-secret",
    signatureTtlSeconds: 180,
    signatureMaxSkewSeconds: 300,
    backendSigningPrivateKey: signingPrivateKey,
    backendSigningAudience: "wp-agent-runtime-test",
    backendPublicBaseUrl: "http://backend.test",
    wpToolApiBase: "http://localhost:8080/wp-json/wp-agent/v1",
    pairingRateLimitPerMinuteIp: 100,
    pairingRateLimitPerMinuteInstallation: 20,
    chatModelFast: "gpt-4.1-mini",
    chatModelBalanced: "gpt-4.1",
    chatModelQuality: "anthropic/claude-sonnet-4",
    chatModelReasoning: "o3",
    chatRateLimitPerMinute: 20,
    chatDailyTokenCap: 10000,
    chatMaxPromptMessages: 12,
    chatMaxInputChars: 4000,
    chatSessionRetentionDays: 30,
  };

  return {
    store,
    config,
  };
}

test("POST /api/v1/installations/pair rejects missing bootstrap header", async () => {
  const store = new MemoryInstallationStore();
  const app = await buildServer({
    installations: buildInstallationsOptions(store),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/installations/pair",
    payload: {
      installation_id: "4fb8467a-3b7b-4305-a7dd-988b024f82b5",
      site_url: "http://localhost:8080",
      public_key: generatePublicKeyBase64(),
      signature_alg: "ed25519",
      plugin_version: "0.1.0",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "PAIRING_AUTH_FAILED");

  await app.close();
});

test("POST /api/v1/installations/pair stores first pair and allows key update", async () => {
  const store = new MemoryInstallationStore();
  const app = await buildServer({
    installations: buildInstallationsOptions(store),
  });

  const installationId = "5f6dd388-574e-43dd-a5d9-68843809f6d6";
  const firstPublicKey = generatePublicKeyBase64();

  const firstResponse = await app.inject({
    method: "POST",
    url: "/api/v1/installations/pair",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: installationId,
      site_url: "http://localhost:8080",
      public_key: firstPublicKey,
      signature_alg: "ed25519",
      plugin_version: "0.1.0",
    },
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(firstResponse.json().meta.audit_code, "PAIRED_NEW");
  assert.equal(
    firstResponse.json().data.backend_audience,
    "wp-agent-runtime-test",
  );
  assert.equal(firstResponse.json().data.backend_base_url, "http://backend.test");
  assert.equal(store.installations.get(installationId)?.publicKey, firstPublicKey);

  const secondPublicKey = generatePublicKeyBase64();
  const secondResponse = await app.inject({
    method: "POST",
    url: "/api/v1/installations/pair",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: installationId,
      site_url: "http://localhost:8080",
      public_key: secondPublicKey,
      signature_alg: "ed25519",
      plugin_version: "0.1.1",
    },
  });

  assert.equal(secondResponse.statusCode, 200);
  assert.equal(
    secondResponse.json().meta.audit_code,
    "KEY_ROTATED_UNVERIFIED",
  );
  assert.equal(store.installations.get(installationId)?.publicKey, secondPublicKey);

  const rotatedAudit = store.audits.find(
    (entry) => entry.outcomeCode === "KEY_ROTATED_UNVERIFIED",
  );
  assert.ok(rotatedAudit);

  await app.close();
});
