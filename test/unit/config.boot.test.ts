import assert from "node:assert/strict";
import test from "node:test";
import { getConfig, validateProductionBootConfig } from "../../src/config";

const ORIGINAL_ENV = process.env;

test("validateProductionBootConfig throws in production when DATABASE_URL is missing", () => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "production",
    DATABASE_URL: "",
    PAIRING_BOOTSTRAP_SECRET: "test-bootstrap-secret",
    BACKEND_SIGNING_PRIVATE_KEY: "test-signing-key",
    BACKEND_SIGNING_AUDIENCE: "wp-agent-runtime",
    SIGNATURE_TTL_SECONDS: "180",
    SIGNATURE_MAX_SKEW_SECONDS: "300",
  };

  const config = getConfig();
  assert.throws(
    () => validateProductionBootConfig(config),
    /DATABASE_URL/,
  );
});

test("validateProductionBootConfig throws in production when signing secrets are missing", () => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "production",
    DATABASE_URL: "postgres://user:pass@localhost:5432/wp_agent",
    PAIRING_BOOTSTRAP_SECRET: "",
    BACKEND_SIGNING_PRIVATE_KEY: "",
    BACKEND_SIGNING_AUDIENCE: "",
    SIGNATURE_TTL_SECONDS: "",
    SIGNATURE_MAX_SKEW_SECONDS: "",
  };

  const config = getConfig();
  assert.throws(
    () => validateProductionBootConfig(config),
    /PAIRING_BOOTSTRAP_SECRET, BACKEND_SIGNING_PRIVATE_KEY, BACKEND_SIGNING_AUDIENCE, SIGNATURE_TTL_SECONDS, SIGNATURE_MAX_SKEW_SECONDS/,
  );
});

test("validateProductionBootConfig does not throw outside production", () => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "development",
    DATABASE_URL: "",
    PAIRING_BOOTSTRAP_SECRET: "",
    BACKEND_SIGNING_PRIVATE_KEY: "",
    BACKEND_SIGNING_AUDIENCE: "",
    SIGNATURE_TTL_SECONDS: "",
    SIGNATURE_MAX_SKEW_SECONDS: "",
  };

  const config = getConfig();
  assert.doesNotThrow(() => validateProductionBootConfig(config));
});

test.after(() => {
  process.env = ORIGINAL_ENV;
});
