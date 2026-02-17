"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPool = buildPool;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const pg_1 = require("pg");
const SSL_REQUIRED_MODES = new Set(["require", "verify-ca", "verify-full", "no-verify"]);
let hasLoggedSslMode = false;
function normalizeConnectionString(raw) {
    const parsed = new URL(raw);
    const sslMode = parsed.searchParams.get("sslmode")?.trim().toLowerCase() ?? undefined;
    parsed.searchParams.delete("sslmode");
    return {
        connectionString: parsed.toString(),
        sslMode,
    };
}
function logSslMode(logger, mode, sslMode) {
    if (!logger || hasLoggedSslMode) {
        return;
    }
    hasLoggedSslMode = true;
    logger.info({
        dbSslMode: mode,
        databaseUrlSslmodeParam: sslMode ?? null,
    }, "database pool SSL mode configured");
}
function buildPool(config, logger) {
    if (!config.databaseUrl) {
        throw new Error("DATABASE_URL is required to create a Postgres connection pool.");
    }
    const { connectionString, sslMode } = normalizeConnectionString(config.databaseUrl);
    const poolConfig = { connectionString };
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
        const certPath = config.supabaseSslRootCertPath.trim();
        if (!certPath) {
            throw new Error("Fatal config error: SUPABASE_SSL_ROOT_CERT_PATH is required in production for Postgres TLS CA verification.");
        }
        if (!node_path_1.default.isAbsolute(certPath)) {
            throw new Error(`Fatal config error: SUPABASE_SSL_ROOT_CERT_PATH must be an absolute path (received: ${certPath}).`);
        }
        const ca = node_fs_1.default.readFileSync(certPath, "utf8");
        poolConfig.ssl = {
            ca,
            rejectUnauthorized: true,
        };
        logSslMode(logger, "ca_verify", sslMode);
        return new pg_1.Pool(poolConfig);
    }
    if (sslMode && SSL_REQUIRED_MODES.has(sslMode)) {
        poolConfig.ssl = {
            rejectUnauthorized: false,
        };
        logSslMode(logger, "insecure_ssl", sslMode);
    }
    else {
        poolConfig.ssl = false;
        logSslMode(logger, "disabled", sslMode);
    }
    return new pg_1.Pool(poolConfig);
}
