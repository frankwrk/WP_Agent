import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolConfig } from "pg";
import type { AppConfig } from "../config";

interface PoolLogger {
  info(payload: Record<string, unknown>, message: string): void;
}

const SSL_REQUIRED_MODES = new Set([
  "require",
  "verify-ca",
  "verify-full",
  "no-verify",
]);
let hasLoggedSslMode = false;

function normalizeConnectionString(raw: string): {
  connectionString: string;
  sslMode?: string;
} {
  const parsed = new URL(raw);
  const sslMode =
    parsed.searchParams.get("sslmode")?.trim().toLowerCase() ?? undefined;
  parsed.searchParams.delete("sslmode");
  return {
    connectionString: parsed.toString(),
    sslMode,
  };
}

function logSslMode(
  logger: PoolLogger | undefined,
  mode: "ca_verify" | "insecure_ssl" | "disabled",
  sslMode?: string,
): void {
  if (!logger || hasLoggedSslMode) {
    return;
  }

  hasLoggedSslMode = true;
  logger.info(
    {
      dbSslMode: mode,
      databaseUrlSslmodeParam: sslMode ?? null,
    },
    "database pool SSL mode configured",
  );
}

export function buildPool(config: AppConfig, logger?: PoolLogger): Pool {
  if (!config.databaseUrl) {
    throw new Error(
      "DATABASE_URL is required to create a Postgres connection pool.",
    );
  }

  const { connectionString, sslMode } = normalizeConnectionString(
    config.databaseUrl,
  );
  if (process.env.NODE_ENV === "production" && sslMode === "no-verify") {
    throw new Error(
      "Fatal config error: DATABASE_URL must not use sslmode=no-verify in production. Remove the sslmode param and rely on SUPABASE_SSL_ROOT_CERT_PATH CA verification.",
    );
  }
  const poolConfig: PoolConfig = { connectionString };

  const isProduction = process.env.NODE_ENV === "production";

  // In production we REQUIRE CA verification.
  if (isProduction && !config.supabaseSslRootCertPath.trim()) {
    throw new Error(
      "Fatal config error: SUPABASE_SSL_ROOT_CERT_PATH is required in production for Postgres TLS CA verification.",
    );
  }

  // Enable CA-verified TLS whenever a CA path is provided.
  // This ensures deploy-time migrations (which may run without NODE_ENV=production)
  // still use encrypted connections.
  const certPath = config.supabaseSslRootCertPath.trim();
  if (certPath) {
    if (!path.isAbsolute(certPath)) {
      throw new Error(
        `Fatal config error: SUPABASE_SSL_ROOT_CERT_PATH must be an absolute path (received: ${certPath}).`,
      );
    }

    const ca = fs.readFileSync(certPath, "utf8");
    poolConfig.ssl = {
      ca,
      rejectUnauthorized: true,
    };

    logSslMode(logger, "ca_verify", sslMode);
    return new Pool(poolConfig);
  }

  // Non-production without a CA path: respect sslmode, but do not silently enable insecure SSL.
  if (sslMode && SSL_REQUIRED_MODES.has(sslMode)) {
    poolConfig.ssl = {
      rejectUnauthorized: false,
    };
    logSslMode(logger, "insecure_ssl", sslMode);
  } else {
    poolConfig.ssl = false;
    logSslMode(logger, "disabled", sslMode);
  }

  return new Pool(poolConfig);
}
