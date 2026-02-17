import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getConfig } from "../../src/config";
import { buildPool } from "../../src/db/pool";

const ORIGINAL_ENV = process.env;

test("buildPool fails fast in production when SUPABASE_SSL_ROOT_CERT_PATH is missing", () => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/wp_agent",
    SUPABASE_SSL_ROOT_CERT_PATH: "",
  };

  const config = getConfig();
  assert.throws(
    () => buildPool(config),
    /SUPABASE_SSL_ROOT_CERT_PATH is required in production/,
  );
});

test("buildPool enables CA verification in production and strips sslmode from connection string", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-agent-pool-"));
  const certPath = path.join(tmpDir, "supabase-ca.pem");
  fs.writeFileSync(certPath, "test-ca", "utf8");

  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "production",
    DATABASE_URL:
      "postgresql://user:pass@localhost:5432/wp_agent?sslmode=no-verify",
    SUPABASE_SSL_ROOT_CERT_PATH: certPath,
  };

  const config = getConfig();
  const pool = buildPool(config);
  const options = (pool as unknown as { options: { ssl: unknown; connectionString: string } }).options;

  assert.deepEqual(options.ssl, { ca: "test-ca", rejectUnauthorized: true });
  assert.equal(options.connectionString.includes("sslmode="), false);
  await pool.end();
});

test("buildPool disables SSL by default outside production", async () => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/wp_agent",
    SUPABASE_SSL_ROOT_CERT_PATH: "",
  };

  const config = getConfig();
  const pool = buildPool(config);
  const options = (pool as unknown as { options: { ssl: unknown } }).options;

  assert.equal(options.ssl, false);
  await pool.end();
});

test("buildPool allows insecure SSL outside production when sslmode requires TLS", async () => {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/wp_agent?sslmode=require",
    SUPABASE_SSL_ROOT_CERT_PATH: "",
  };

  const config = getConfig();
  const pool = buildPool(config);
  const options = (pool as unknown as { options: { ssl: { rejectUnauthorized: boolean } } }).options;

  assert.deepEqual(options.ssl, { rejectUnauthorized: false });
  await pool.end();
});

test.after(() => {
  process.env = ORIGINAL_ENV;
});
