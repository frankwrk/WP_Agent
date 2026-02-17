import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { assertProductionDatabaseConfigured, getConfig, type AppConfig } from "../config";
import {
  derivePublicKeyFromPrivateKey,
  SIGNATURE_ALGORITHM,
} from "../services/wp/signature";

export interface PairInstallationPayload {
  installationId: string;
  siteUrl: string;
  publicKey: string;
  signatureAlg: string;
  pluginVersion: string;
}

export interface PairingUpsertResult {
  pairedAt: string;
  auditCode: string;
  rotated: boolean;
}

export interface PairingAuditEntry {
  installationId: string;
  siteUrl: string;
  outcomeCode: string;
  reason: string;
}

export interface InstallationStore {
  upsertPairing(payload: PairInstallationPayload): Promise<PairingUpsertResult>;
  insertAudit(entry: PairingAuditEntry): Promise<void>;
}

type StoredInstallation = Omit<PairInstallationPayload, "signatureAlg"> & {
  status: "paired";
  signatureAlg: "ed25519";
  pairedAt: string;
};

export class MemoryInstallationStore implements InstallationStore {
  public readonly installations = new Map<string, StoredInstallation>();

  public readonly audits: PairingAuditEntry[] = [];

  async upsertPairing(payload: PairInstallationPayload): Promise<PairingUpsertResult> {
    const now = new Date().toISOString();
    const existing = this.installations.get(payload.installationId);

    let auditCode = "PAIRED_NO_CHANGE";
    let rotated = false;

    if (!existing) {
      auditCode = "PAIRED_NEW";
    } else if (existing.publicKey !== payload.publicKey) {
      auditCode = "KEY_ROTATED_UNVERIFIED";
      rotated = true;
    }

    this.installations.set(payload.installationId, {
      installationId: payload.installationId,
      siteUrl: payload.siteUrl,
      publicKey: payload.publicKey,
      pluginVersion: payload.pluginVersion,
      status: "paired",
      signatureAlg: "ed25519",
      pairedAt: now,
    });

    this.audits.push({
      installationId: payload.installationId,
      siteUrl: payload.siteUrl,
      outcomeCode: auditCode,
      reason: rotated ? "wp_public_key_changed" : "pairing_success",
    });

    return {
      pairedAt: now,
      auditCode,
      rotated,
    };
  }

  async insertAudit(entry: PairingAuditEntry): Promise<void> {
    this.audits.push(entry);
  }
}

class PostgresInstallationStore implements InstallationStore {
  constructor(private readonly pool: Pool) {}

  async upsertPairing(payload: PairInstallationPayload): Promise<PairingUpsertResult> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query<{
        wp_public_key: string;
      }>(
        `
          SELECT wp_public_key
          FROM installations
          WHERE installation_id = $1
          LIMIT 1
        `,
        [payload.installationId],
      );

      let auditCode = "PAIRED_NO_CHANGE";
      let rotated = false;

      if (existing.rowCount === 0) {
        auditCode = "PAIRED_NEW";
        await client.query(
          `
            INSERT INTO installations (
              installation_id,
              site_url,
              wp_public_key,
              signature_alg,
              status,
              plugin_version
            )
            VALUES ($1, $2, $3, $4, 'paired', $5)
          `,
          [
            payload.installationId,
            payload.siteUrl,
            payload.publicKey,
            payload.signatureAlg,
            payload.pluginVersion,
          ],
        );
      } else {
        const previousKey = existing.rows[0].wp_public_key;
        if (previousKey !== payload.publicKey) {
          auditCode = "KEY_ROTATED_UNVERIFIED";
          rotated = true;
        }

        await client.query(
          `
            UPDATE installations
            SET
              site_url = $2,
              wp_public_key = $3,
              signature_alg = $4,
              status = 'paired',
              plugin_version = $5,
              paired_at = NOW(),
              updated_at = NOW()
            WHERE installation_id = $1
          `,
          [
            payload.installationId,
            payload.siteUrl,
            payload.publicKey,
            payload.signatureAlg,
            payload.pluginVersion,
          ],
        );
      }

      await client.query(
        `
          INSERT INTO pairing_audit (
            installation_id,
            site_url,
            outcome_code,
            reason
          )
          VALUES ($1, $2, $3, $4)
        `,
        [
          payload.installationId,
          payload.siteUrl,
          auditCode,
          rotated ? "wp_public_key_changed" : "pairing_success",
        ],
      );

      await client.query("COMMIT");

      return {
        pairedAt: new Date().toISOString(),
        auditCode,
        rotated,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async insertAudit(entry: PairingAuditEntry): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO pairing_audit (
          installation_id,
          site_url,
          outcome_code,
          reason
        )
        VALUES ($1, $2, $3, $4)
      `,
      [entry.installationId, entry.siteUrl, entry.outcomeCode, entry.reason],
    );
  }
}

class FixedWindowRateLimiter {
  private readonly counts = new Map<string, { count: number; expiresAt: number }>();

  public check(key: string, limit: number, windowSeconds: number): {
    allowed: boolean;
    retryAfter: number;
  } {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
    const bucketKey = `${key}:${windowStart}`;
    const existing = this.counts.get(bucketKey);

    const nextCount = (existing?.count ?? 0) + 1;
    this.counts.set(bucketKey, {
      count: nextCount,
      expiresAt: windowStart + windowSeconds,
    });

    if (this.counts.size > 2000) {
      for (const [mapKey, value] of this.counts.entries()) {
        if (value.expiresAt < now) {
          this.counts.delete(mapKey);
        }
      }
    }

    return {
      allowed: nextCount <= limit,
      retryAfter: windowStart + windowSeconds - now,
    };
  }
}

const ipPairingRateLimiter = new FixedWindowRateLimiter();
const installationPairingRateLimiter = new FixedWindowRateLimiter();

export interface InstallationsRouteOptions {
  store?: InstallationStore;
  config?: AppConfig;
}

let cachedPool: Pool | null = null;

function createStore(config: AppConfig): InstallationStore {
  assertProductionDatabaseConfigured(config);
  if (!config.databaseUrl) {
    return new MemoryInstallationStore();
  }

  if (!cachedPool) {
    cachedPool = new Pool({ connectionString: config.databaseUrl });
  }

  return new PostgresInstallationStore(cachedPool);
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function validatePayload(raw: unknown): { value?: PairInstallationPayload; error?: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "Payload must be a JSON object" };
  }

  const body = raw as Record<string, unknown>;
  const installationId = String(body.installation_id ?? "").trim();
  const siteUrl = String(body.site_url ?? "").trim();
  const publicKey = String(body.public_key ?? "").trim();
  const signatureAlg = String(body.signature_alg ?? "").trim().toLowerCase();
  const pluginVersion = String(body.plugin_version ?? "").trim();

  if (!isValidUuid(installationId)) {
    return { error: "installation_id must be a valid UUID" };
  }

  try {
    const parsed = new URL(siteUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      return { error: "site_url must use http or https" };
    }
  } catch {
    return { error: "site_url must be a valid URL" };
  }

  const decodedPublicKey = Buffer.from(publicKey, "base64");
  if (decodedPublicKey.length !== 32) {
    return { error: "public_key must be a base64 encoded 32-byte Ed25519 public key" };
  }

  if (signatureAlg !== SIGNATURE_ALGORITHM) {
    return { error: "signature_alg must be ed25519" };
  }

  if (!pluginVersion) {
    return { error: "plugin_version is required" };
  }

  return {
    value: {
      installationId,
      siteUrl,
      publicKey,
      signatureAlg,
      pluginVersion,
    },
  };
}

function errorResponse(code: string, message: string) {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
    },
    meta: null,
  };
}

export async function installationsRoutes(
  app: FastifyInstance,
  options: InstallationsRouteOptions,
) {
  const config = options.config ?? getConfig();
  const store = options.store ?? createStore(config);

  app.post("/installations/pair", async (request, reply) => {
    const bootstrap = request.headers["x-wp-agent-bootstrap"];
    const bootstrapHeader = Array.isArray(bootstrap)
      ? bootstrap[0] ?? ""
      : String(bootstrap ?? "");

    if (!config.pairingBootstrapSecret) {
      request.log.error({ reason: "PAIRING_SECRET_NOT_CONFIGURED" }, "pairing failed");
      return reply
        .code(500)
        .send(errorResponse("SERVER_CONFIG_ERROR", "Pairing bootstrap secret is not configured"));
    }

    const ipLimit = ipPairingRateLimiter.check(
      request.ip,
      config.pairingRateLimitPerMinuteIp,
      60,
    );
    if (!ipLimit.allowed) {
      request.log.warn({ reason: "PAIRING_RATE_LIMIT_IP", ip: request.ip }, "pairing rejected");
      return reply
        .code(429)
        .send(errorResponse("PAIRING_RATE_LIMITED", "Pairing rate limit exceeded for source IP"));
    }

    if (!bootstrapHeader || !constantTimeEqual(bootstrapHeader, config.pairingBootstrapSecret)) {
      request.log.warn({ reason: "PAIRING_BOOTSTRAP_AUTH_FAILED", ip: request.ip }, "pairing rejected");
      return reply
        .code(401)
        .send(errorResponse("PAIRING_AUTH_FAILED", "Invalid bootstrap authentication header"));
    }

    const validated = validatePayload(request.body);
    if (!validated.value) {
      request.log.warn(
        { reason: "PAIRING_VALIDATION_FAILED", detail: validated.error },
        "pairing rejected",
      );
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", validated.error ?? "Invalid payload"));
    }

    const installationLimit = installationPairingRateLimiter.check(
      validated.value.installationId,
      config.pairingRateLimitPerMinuteInstallation,
      60,
    );
    if (!installationLimit.allowed) {
      request.log.warn(
        {
          reason: "PAIRING_RATE_LIMIT_INSTALLATION",
          installationId: validated.value.installationId,
        },
        "pairing rejected",
      );
      return reply
        .code(429)
        .send(
          errorResponse(
            "PAIRING_RATE_LIMITED",
            "Pairing rate limit exceeded for installation",
          ),
        );
    }

    let backendPublicKey: string;
    const backendAudience = config.backendSigningAudience;
    const backendBaseUrl =
      config.backendPublicBaseUrl || `${request.protocol}://${request.host}`;
    try {
      backendPublicKey = derivePublicKeyFromPrivateKey(
        config.backendSigningPrivateKey,
      );
    } catch {
      request.log.error(
        { reason: "BACKEND_SIGNING_KEY_INVALID" },
        "pairing failed",
      );
      return reply
        .code(500)
        .send(errorResponse("SERVER_CONFIG_ERROR", "Backend signing key is not configured correctly"));
    }

    try {
      const result = await store.upsertPairing(validated.value);

      request.log.info(
        {
          reason: result.auditCode,
          installationId: validated.value.installationId,
          rotated: result.rotated,
        },
        "pairing accepted",
      );

      return reply.code(200).send({
        ok: true,
        data: {
          installation_id: validated.value.installationId,
          status: "paired",
          backend_public_key: backendPublicKey,
          backend_audience: backendAudience,
          backend_base_url: backendBaseUrl,
          signature_alg: SIGNATURE_ALGORITHM,
          paired_at: result.pairedAt,
        },
        error: null,
        meta: {
          audit_code: result.auditCode,
          pairing_id: randomUUID(),
        },
      });
    } catch (error) {
      request.log.error({ reason: "PAIRING_STORE_ERROR", error }, "pairing failed");
      return reply
        .code(500)
        .send(errorResponse("PAIRING_STORE_ERROR", "Failed to persist pairing details"));
    }
  });
}
