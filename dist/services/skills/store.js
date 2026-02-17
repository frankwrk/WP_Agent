"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresSkillStore = exports.MemorySkillStore = void 0;
const node_crypto_1 = require("node:crypto");
class MemorySkillStore {
    pairedInstallations = new Set();
    ingestions = new Map();
    specsByInstallation = new Map();
    async isPairedInstallation(installationId) {
        return this.pairedInstallations.has(installationId);
    }
    async createIngestion(input) {
        const now = new Date().toISOString();
        const ingestion = {
            ingestionId: (0, node_crypto_1.randomUUID)(),
            installationId: input.installationId,
            repoUrl: input.repoUrl,
            commitSha: input.commitSha,
            ingestionHash: input.ingestionHash,
            status: "running",
            error: null,
            createdAt: now,
            updatedAt: now,
        };
        this.ingestions.set(ingestion.ingestionId, ingestion);
        return ingestion;
    }
    async updateIngestionStatus(input) {
        const existing = this.ingestions.get(input.ingestionId);
        if (!existing) {
            return;
        }
        this.ingestions.set(input.ingestionId, {
            ...existing,
            status: input.status,
            error: input.error ?? null,
            updatedAt: new Date().toISOString(),
        });
    }
    async getLatestSuccessfulIngestion(installationId) {
        const matches = [...this.ingestions.values()]
            .filter((ingestion) => ingestion.installationId === installationId && ingestion.status === "succeeded")
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return matches[0] ?? null;
    }
    async countActiveSkills(installationId) {
        const records = this.specsByInstallation.get(installationId) ?? [];
        return records.length;
    }
    async replaceSkillSpecs(input) {
        const now = new Date().toISOString();
        const records = input.specs.map((spec) => ({
            ...spec,
            ingestionId: input.ingestionId,
            updatedAt: now,
        }));
        this.specsByInstallation.set(input.installationId, records);
    }
    async listSkills(query) {
        const records = this.specsByInstallation.get(query.installationId) ?? [];
        const latestBySkill = new Map();
        for (const record of records) {
            const existing = latestBySkill.get(record.skillId);
            if (!existing || existing.updatedAt < record.updatedAt) {
                latestBySkill.set(record.skillId, record);
            }
        }
        let list = [...latestBySkill.values()];
        if (query.tag) {
            const tag = query.tag.toLowerCase();
            list = list.filter((item) => item.tags.includes(tag));
        }
        if (query.safetyClass) {
            list = list.filter((item) => item.safetyClass === query.safetyClass);
        }
        if (query.deprecated !== undefined) {
            list = list.filter((item) => item.deprecated === query.deprecated);
        }
        if (query.search) {
            const search = query.search.toLowerCase();
            list = list.filter((item) => {
                return item.skillId.toLowerCase().includes(search)
                    || item.name.toLowerCase().includes(search)
                    || item.description.toLowerCase().includes(search);
            });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        const total = list.length;
        const start = Math.max(0, query.offset);
        const end = start + Math.max(1, query.limit);
        return {
            total,
            items: list.slice(start, end).map((item) => ({
                skillId: item.skillId,
                version: item.version,
                name: item.name,
                description: item.description,
                tags: item.tags,
                safetyClass: item.safetyClass,
                deprecated: item.deprecated,
                sourceRepo: item.sourceRepo,
                sourceCommitSha: item.sourceCommitSha,
                updatedAt: item.updatedAt,
            })),
        };
    }
    async getSkill(installationId, skillId) {
        const records = this.specsByInstallation.get(installationId) ?? [];
        const match = records
            .filter((record) => record.skillId === skillId)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (!match) {
            return null;
        }
        return {
            skillId: match.skillId,
            version: match.version,
            sourceRepo: match.sourceRepo,
            sourceCommitSha: match.sourceCommitSha,
            sourcePath: match.sourcePath,
            name: match.name,
            description: match.description,
            tags: match.tags,
            inputsSchema: match.inputsSchema,
            outputsSchema: match.outputsSchema,
            toolAllowlist: match.toolAllowlist,
            caps: match.caps,
            safetyClass: match.safetyClass,
            deprecated: match.deprecated,
        };
    }
}
exports.MemorySkillStore = MemorySkillStore;
class PostgresSkillStore {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async isPairedInstallation(installationId) {
        const result = await this.pool.query(`
        SELECT EXISTS(
          SELECT 1
          FROM installations
          WHERE installation_id = $1
            AND status = 'paired'
        ) AS exists
      `, [installationId]);
        return Boolean(result.rows[0]?.exists);
    }
    async createIngestion(input) {
        const ingestionId = (0, node_crypto_1.randomUUID)();
        const result = await this.pool.query(`
        INSERT INTO skill_ingestions (
          ingestion_id,
          installation_id,
          repo_url,
          commit_sha,
          ingestion_hash,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'running')
        RETURNING
          ingestion_id,
          installation_id,
          repo_url,
          commit_sha,
          ingestion_hash,
          status,
          error,
          created_at,
          updated_at
      `, [
            ingestionId,
            input.installationId,
            input.repoUrl,
            input.commitSha,
            input.ingestionHash,
        ]);
        const row = result.rows[0];
        return {
            ingestionId: row.ingestion_id,
            installationId: row.installation_id,
            repoUrl: row.repo_url,
            commitSha: row.commit_sha,
            ingestionHash: row.ingestion_hash,
            status: row.status,
            error: row.error,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    async updateIngestionStatus(input) {
        await this.pool.query(`
        UPDATE skill_ingestions
        SET
          status = $2,
          error = $3,
          updated_at = NOW()
        WHERE ingestion_id = $1
      `, [input.ingestionId, input.status, input.error ?? null]);
    }
    async getLatestSuccessfulIngestion(installationId) {
        const result = await this.pool.query(`
        SELECT
          ingestion_id,
          installation_id,
          repo_url,
          commit_sha,
          ingestion_hash,
          status,
          error,
          created_at,
          updated_at
        FROM skill_ingestions
        WHERE installation_id = $1
          AND status = 'succeeded'
        ORDER BY created_at DESC
        LIMIT 1
      `, [installationId]);
        if (!result.rowCount) {
            return null;
        }
        const row = result.rows[0];
        return {
            ingestionId: row.ingestion_id,
            installationId: row.installation_id,
            repoUrl: row.repo_url,
            commitSha: row.commit_sha,
            ingestionHash: row.ingestion_hash,
            status: row.status,
            error: row.error,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    async countActiveSkills(installationId) {
        const result = await this.pool.query(`
        SELECT COUNT(*)::text AS total
        FROM skill_specs
        WHERE installation_id = $1
      `, [installationId]);
        return Number.parseInt(result.rows[0]?.total ?? "0", 10) || 0;
    }
    async replaceSkillSpecs(input) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(`
          DELETE FROM skill_specs
          WHERE installation_id = $1
        `, [input.installationId]);
            for (const spec of input.specs) {
                await client.query(`
            INSERT INTO skill_specs (
              installation_id,
              skill_id,
              version,
              source_repo,
              source_commit_sha,
              source_path,
              name,
              description,
              tags,
              inputs_schema,
              outputs_schema,
              tool_allowlist,
              caps,
              safety_class,
              deprecated,
              ingestion_id
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9::jsonb, $10::jsonb,
              $11::jsonb, $12::jsonb, $13::jsonb,
              $14, $15, $16
            )
          `, [
                    input.installationId,
                    spec.skillId,
                    spec.version,
                    spec.sourceRepo,
                    spec.sourceCommitSha,
                    spec.sourcePath,
                    spec.name,
                    spec.description,
                    JSON.stringify(spec.tags),
                    JSON.stringify(spec.inputsSchema),
                    JSON.stringify(spec.outputsSchema),
                    JSON.stringify(spec.toolAllowlist),
                    JSON.stringify({
                        max_pages: spec.caps.maxPages,
                        max_tool_calls: spec.caps.maxToolCalls,
                        max_steps: spec.caps.maxSteps,
                        max_cost_usd: spec.caps.maxCostUsd,
                    }),
                    spec.safetyClass,
                    spec.deprecated,
                    input.ingestionId,
                ]);
            }
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async listSkills(query) {
        const clauses = ["installation_id = $1"];
        const params = [query.installationId];
        if (query.tag) {
            params.push(JSON.stringify([query.tag.toLowerCase()]));
            clauses.push(`tags @> $${params.length}::jsonb`);
        }
        if (query.safetyClass) {
            params.push(query.safetyClass);
            clauses.push(`safety_class = $${params.length}`);
        }
        if (query.deprecated !== undefined) {
            params.push(query.deprecated);
            clauses.push(`deprecated = $${params.length}`);
        }
        if (query.search) {
            params.push(`%${query.search.toLowerCase()}%`);
            clauses.push(`(
        LOWER(skill_id) LIKE $${params.length}
        OR LOWER(name) LIKE $${params.length}
        OR LOWER(description) LIKE $${params.length}
      )`);
        }
        const whereClause = clauses.join(" AND ");
        const totalResult = await this.pool.query(`
        SELECT COUNT(*)::text AS total
        FROM skill_specs
        WHERE ${whereClause}
      `, params);
        params.push(Math.max(1, query.limit));
        params.push(Math.max(0, query.offset));
        const rows = await this.pool.query(`
        SELECT
          skill_id,
          version,
          name,
          description,
          tags,
          safety_class,
          deprecated,
          source_repo,
          source_commit_sha,
          updated_at
        FROM skill_specs
        WHERE ${whereClause}
        ORDER BY name ASC, updated_at DESC
        LIMIT $${params.length - 1}
        OFFSET $${params.length}
      `, params);
        return {
            total: Number.parseInt(totalResult.rows[0]?.total ?? "0", 10) || 0,
            items: rows.rows.map((row) => ({
                skillId: row.skill_id,
                version: row.version,
                name: row.name,
                description: row.description,
                tags: row.tags ?? [],
                safetyClass: row.safety_class,
                deprecated: row.deprecated,
                sourceRepo: row.source_repo,
                sourceCommitSha: row.source_commit_sha,
                updatedAt: row.updated_at,
            })),
        };
    }
    async getSkill(installationId, skillId) {
        const result = await this.pool.query(`
        SELECT
          skill_id,
          version,
          source_repo,
          source_commit_sha,
          source_path,
          name,
          description,
          tags,
          inputs_schema,
          outputs_schema,
          tool_allowlist,
          caps,
          safety_class,
          deprecated
        FROM skill_specs
        WHERE installation_id = $1
          AND skill_id = $2
        ORDER BY updated_at DESC
        LIMIT 1
      `, [installationId, skillId]);
        if (!result.rowCount) {
            return null;
        }
        const row = result.rows[0];
        return {
            skillId: row.skill_id,
            version: row.version,
            sourceRepo: row.source_repo,
            sourceCommitSha: row.source_commit_sha,
            sourcePath: row.source_path,
            name: row.name,
            description: row.description,
            tags: row.tags ?? [],
            inputsSchema: row.inputs_schema ?? {},
            outputsSchema: row.outputs_schema ?? {},
            toolAllowlist: row.tool_allowlist ?? [],
            caps: {
                maxPages: Number.parseInt(String(row.caps?.max_pages ?? ""), 10) || undefined,
                maxToolCalls: Number.parseInt(String(row.caps?.max_tool_calls ?? ""), 10) || undefined,
                maxSteps: Number.parseInt(String(row.caps?.max_steps ?? ""), 10) || undefined,
                maxCostUsd: Number.parseFloat(String(row.caps?.max_cost_usd ?? "")) || undefined,
            },
            safetyClass: row.safety_class,
            deprecated: row.deprecated,
        };
    }
}
exports.PostgresSkillStore = PostgresSkillStore;
