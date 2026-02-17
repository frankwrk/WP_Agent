"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillsRoutes = skillsRoutes;
const pg_1 = require("pg");
const config_1 = require("../config");
const ingest_github_1 = require("../services/skills/ingest.github");
const normalize_1 = require("../services/skills/normalize");
const store_1 = require("../services/skills/store");
const tool_registry_1 = require("../services/plans/tool.registry");
async function withTimeout(factory, timeoutMs, timeoutMessage) {
    let timer = null;
    try {
        return await Promise.race([
            factory(),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(timeoutMessage));
                }, timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}
let cachedPool = null;
function createStore(config) {
    (0, config_1.assertProductionDatabaseConfigured)(config);
    if (!config.databaseUrl) {
        return new store_1.MemorySkillStore();
    }
    if (!cachedPool) {
        cachedPool = new pg_1.Pool({ connectionString: config.databaseUrl });
    }
    return new store_1.PostgresSkillStore(cachedPool);
}
function isValidUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function getRequestInstallationId(request) {
    if (!request.installationId || !isValidUuid(request.installationId)) {
        return { error: "installation_id must be a valid UUID" };
    }
    return { value: request.installationId };
}
function errorResponse(code, message, details) {
    return {
        ok: false,
        data: null,
        error: {
            code,
            message,
            ...(details ?? {}),
        },
        meta: null,
    };
}
function toApiSkill(item) {
    return {
        skill_id: item.skillId,
        version: item.version,
        source: {
            repo: item.sourceRepo,
            commit_sha: item.sourceCommitSha,
            path: item.sourcePath,
        },
        name: item.name,
        description: item.description,
        tags: item.tags,
        inputs_schema: item.inputsSchema,
        outputs_schema: item.outputsSchema,
        tool_allowlist: item.toolAllowlist,
        caps: {
            max_pages: item.caps.maxPages,
            max_tool_calls: item.caps.maxToolCalls,
            max_steps: item.caps.maxSteps,
            max_cost_usd: item.caps.maxCostUsd,
        },
        safety_class: item.safetyClass,
        deprecated: item.deprecated,
    };
}
async function skillsRoutes(app, options = {}) {
    const config = options.config ?? (0, config_1.getConfig)();
    const store = options.store ?? createStore(config);
    const ingestSnapshot = options.ingestSnapshot ?? ingest_github_1.ingestPinnedSkillSnapshot;
    app.post("/skills/sync", async (request, reply) => {
        const startedAtMs = Date.now();
        const progress = [];
        const trackStage = async (stage, fn) => {
            const stageStarted = Date.now();
            const result = await fn();
            progress.push({ stage, duration_ms: Date.now() - stageStarted });
            return result;
        };
        const body = (request.body && typeof request.body === "object"
            ? request.body
            : {});
        const scope = getRequestInstallationId(request);
        if (!scope.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
        }
        const installationId = scope.value;
        const repoUrl = String(body.repo_url ?? config.skillSourceRepoUrl ?? "").trim();
        const commitSha = String(body.commit_sha ?? config.skillSourceCommitSha ?? "").trim();
        if (!repoUrl || !commitSha) {
            return reply.code(400).send(errorResponse("VALIDATION_ERROR", "repo_url and commit_sha are required (or configure defaults)"));
        }
        if (!(await store.isPairedInstallation(installationId))) {
            return reply
                .code(404)
                .send(errorResponse("INSTALLATION_NOT_PAIRED", "Installation is not paired"));
        }
        let ingestionId = null;
        try {
            const snapshot = await trackStage("ingest_snapshot", () => withTimeout(() => ingestSnapshot({ repoUrl, commitSha }), Math.max(500, config.skillsSyncTimeoutMs), "skills sync ingest timed out"));
            if (snapshot.documents.length > config.skillsSyncMaxDocuments) {
                return reply.code(400).send(errorResponse("SKILL_SYNC_CAP_EXCEEDED", `Skill document count exceeds cap (${config.skillsSyncMaxDocuments})`));
            }
            const specs = await trackStage("normalize_specs", async () => snapshot.documents.map((doc) => {
                const parsed = JSON.parse(doc.content);
                const normalized = (0, normalize_1.normalizeSkillSpec)(parsed, {
                    repoUrl: snapshot.repoUrl,
                    commitSha: snapshot.commitSha,
                    path: doc.path,
                });
                (0, tool_registry_1.assertKnownToolNames)(normalized.toolAllowlist);
                return normalized;
            }));
            const latest = await store.getLatestSuccessfulIngestion(installationId);
            if (latest && latest.ingestionHash === snapshot.ingestionHash) {
                const skillCount = await store.countActiveSkills(installationId);
                return reply.code(200).send({
                    ok: true,
                    data: {
                        ingestion_id: latest.ingestionId,
                        installation_id: installationId,
                        status: "unchanged",
                        repo_url: latest.repoUrl,
                        commit_sha: latest.commitSha,
                        ingestion_hash: latest.ingestionHash,
                        skill_count: skillCount,
                    },
                    error: null,
                    meta: {
                        progress,
                        elapsed_ms: Date.now() - startedAtMs,
                    },
                });
            }
            const ingestion = await trackStage("create_ingestion", () => store.createIngestion({
                installationId,
                repoUrl: snapshot.repoUrl,
                commitSha: snapshot.commitSha,
                ingestionHash: snapshot.ingestionHash,
            }));
            const createdIngestionId = ingestion.ingestionId;
            ingestionId = createdIngestionId;
            await trackStage("replace_skill_specs", () => store.replaceSkillSpecs({
                installationId,
                ingestionId: createdIngestionId,
                specs,
            }));
            await trackStage("mark_ingestion_succeeded", () => store.updateIngestionStatus({
                ingestionId: createdIngestionId,
                status: "succeeded",
            }));
            return reply.code(200).send({
                ok: true,
                data: {
                    ingestion_id: createdIngestionId,
                    installation_id: installationId,
                    status: "succeeded",
                    repo_url: snapshot.repoUrl,
                    commit_sha: snapshot.commitSha,
                    ingestion_hash: snapshot.ingestionHash,
                    skill_count: specs.length,
                },
                error: null,
                meta: {
                    progress,
                    elapsed_ms: Date.now() - startedAtMs,
                },
            });
        }
        catch (error) {
            if (ingestionId) {
                await store.updateIngestionStatus({
                    ingestionId,
                    status: "failed",
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }
            if (error instanceof ingest_github_1.SkillIngestError
                || error instanceof normalize_1.SkillNormalizationError
                || error instanceof tool_registry_1.ToolRegistryError) {
                return reply.code(400).send(errorResponse(error.code, error.message));
            }
            if (error instanceof Error && error.message === "skills sync ingest timed out") {
                return reply
                    .code(504)
                    .send(errorResponse("SKILL_SYNC_TIMEOUT", "Skills sync ingest timed out"));
            }
            request.log.error({ error }, "skills sync failed");
            return reply
                .code(500)
                .send(errorResponse("SKILL_SYNC_FAILED", "Failed to sync skills from source repository"));
        }
    });
    app.get("/skills", async (request, reply) => {
        const scope = getRequestInstallationId(request);
        if (!scope.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
        }
        const query = request.query;
        const installationId = scope.value;
        const limit = Math.max(1, Math.min(100, Number.parseInt(String(query.limit ?? "20"), 10) || 20));
        const offset = Math.max(0, Number.parseInt(String(query.offset ?? "0"), 10) || 0);
        const result = await store.listSkills({
            installationId,
            tag: String(query.tag ?? "").trim().toLowerCase() || undefined,
            safetyClass: String(query.safety_class ?? "").trim().toLowerCase() === "read"
                || String(query.safety_class ?? "").trim().toLowerCase() === "write_draft"
                || String(query.safety_class ?? "").trim().toLowerCase() === "write_publish"
                ? String(query.safety_class ?? "").trim().toLowerCase()
                : undefined,
            deprecated: String(query.deprecated ?? "") === "true"
                ? true
                : String(query.deprecated ?? "") === "false"
                    ? false
                    : undefined,
            search: String(query.search ?? "").trim() || undefined,
            limit,
            offset,
        });
        return reply.code(200).send({
            ok: true,
            data: {
                items: result.items.map((item) => ({
                    skill_id: item.skillId,
                    version: item.version,
                    name: item.name,
                    description: item.description,
                    tags: item.tags,
                    safety_class: item.safetyClass,
                    deprecated: item.deprecated,
                    source_repo: item.sourceRepo,
                    source_commit_sha: item.sourceCommitSha,
                    updated_at: item.updatedAt,
                })),
            },
            error: null,
            meta: {
                total: result.total,
                limit,
                offset,
            },
        });
    });
    app.get("/skills/:skillId", async (request, reply) => {
        const params = request.params;
        const scope = getRequestInstallationId(request);
        if (!scope.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
        }
        const installationId = scope.value;
        const skillId = String(params.skillId ?? "").trim();
        if (!skillId) {
            return reply.code(400).send(errorResponse("VALIDATION_ERROR", "skillId is required"));
        }
        const skill = await store.getSkill(installationId, skillId);
        if (!skill) {
            return reply
                .code(404)
                .send(errorResponse("SKILL_NOT_FOUND", "Skill was not found for this installation"));
        }
        return reply.code(200).send({
            ok: true,
            data: toApiSkill(skill),
            error: null,
            meta: null,
        });
    });
}
