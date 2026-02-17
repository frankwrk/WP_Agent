"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunExecutor = void 0;
const node_crypto_1 = require("node:crypto");
const wp_client_1 = require("../wp/wp.client");
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function parseEnvelope(raw) {
    const envelope = raw;
    if (!envelope || typeof envelope !== "object" || !envelope.ok) {
        throw new Error("WP tool call returned invalid envelope");
    }
    return envelope.data;
}
class RunExecutor {
    options;
    constructor(options) {
        this.options = options;
    }
    toolUrl(path) {
        return `${this.options.wpToolApiBase.replace(/\/$/, "")}${path}`;
    }
    logToolCall(payload) {
        this.options.logger?.info(payload, "wp tool call");
    }
    async invokePost(options) {
        if (this.options.invokePost) {
            return {
                data: await this.options.invokePost(options),
                toolCallId: (0, node_crypto_1.randomUUID)(),
            };
        }
        return (0, wp_client_1.signedWpJsonRequestWithMeta)({
            installationId: options.installationId,
            url: options.url,
            method: "POST",
            body: options.body,
        });
    }
    async invokeGet(options) {
        if (this.options.invokeGet) {
            return {
                data: await this.options.invokeGet(options),
                toolCallId: (0, node_crypto_1.randomUUID)(),
            };
        }
        return (0, wp_client_1.signedWpGetJsonWithMeta)({
            installationId: options.installationId,
            url: options.url,
        });
    }
    async executeRun(runId, installationId) {
        const run = await this.options.runStore.getRun(runId);
        if (!run) {
            return;
        }
        const input = run.inputPayload;
        const stepId = String(input.step_id ?? "").trim();
        const pages = Array.isArray(input.pages) ? input.pages : [];
        const mode = input.mode === "single" ? "single" : "bulk";
        if (!stepId || pages.length === 0) {
            await this.options.runStore.setRunStatus({
                runId,
                status: "failed",
                errorCode: "RUN_INVALID_INPUT",
                errorMessage: "Run input payload is invalid",
                finishedAt: new Date().toISOString(),
            });
            await this.options.runStore.appendRunEvent({
                runId,
                eventType: "run_failed",
                payload: {
                    code: "RUN_INVALID_INPUT",
                    message: "Run input payload is invalid",
                },
            });
            return;
        }
        await this.options.runStore.setRunStatus({
            runId,
            status: "running",
            startedAt: new Date().toISOString(),
        });
        await this.options.runStore.setRunStepStatus({
            runId,
            stepId,
            status: "running",
            startedAt: new Date().toISOString(),
        });
        await this.options.runStore.appendRunEvent({
            runId,
            eventType: "run_started",
            payload: {
                mode,
                page_count: pages.length,
            },
        });
        try {
            if (mode === "single") {
                const payload = {
                    run_id: runId,
                    step_id: stepId,
                    title: pages[0].title,
                    slug: pages[0].slug,
                    content: String(pages[0].content ?? ""),
                    excerpt: pages[0].excerpt,
                    meta: pages[0].meta ?? {},
                };
                const post = await this.invokePost({
                    installationId,
                    url: this.toolUrl("/content/create-page"),
                    body: payload,
                });
                this.logToolCall({
                    runId,
                    stepId,
                    installationId,
                    toolName: "content.create_page",
                    toolRequestId: post.toolCallId,
                });
                await this.options.runStore.appendRunEvent({
                    runId,
                    eventType: "tool_called",
                    payload: {
                        step_id: stepId,
                        tool_name: "content.create_page",
                        tool_request_id: post.toolCallId,
                    },
                });
                const result = parseEnvelope(post.data);
                const rollback = result.rollback_handle;
                if (rollback?.handle_id && rollback.kind) {
                    await this.options.runStore.addRunRollbacks({
                        runId,
                        handles: [
                            {
                                handleId: rollback.handle_id,
                                kind: rollback.kind,
                                payload: rollback.payload ?? {},
                            },
                        ],
                    });
                    await this.options.runStore.setRunRollbackAvailable(runId, true);
                }
                await this.options.runStore.setRunCounts({
                    runId,
                    actualToolCalls: 1,
                    actualPages: 1,
                });
                await this.options.runStore.setRunStepStatus({
                    runId,
                    stepId,
                    status: "completed",
                    actualToolCalls: 1,
                    actualPages: 1,
                    finishedAt: new Date().toISOString(),
                });
                await this.options.runStore.setRunStatus({
                    runId,
                    status: "completed",
                    finishedAt: new Date().toISOString(),
                });
                await this.options.runStore.appendRunEvent({
                    runId,
                    eventType: "run_completed",
                    payload: {
                        mode,
                        created_pages: 1,
                    },
                });
                return;
            }
            const bulkPost = await this.invokePost({
                installationId,
                url: this.toolUrl("/content/bulk-create"),
                body: {
                    run_id: runId,
                    step_id: stepId,
                    items: pages.map((page) => ({
                        title: page.title,
                        slug: page.slug,
                        content: String(page.content ?? ""),
                        excerpt: page.excerpt,
                        meta: page.meta ?? {},
                    })),
                },
            });
            this.logToolCall({
                runId,
                stepId,
                installationId,
                toolName: "content.bulk_create",
                toolRequestId: bulkPost.toolCallId,
            });
            await this.options.runStore.appendRunEvent({
                runId,
                eventType: "tool_called",
                payload: {
                    step_id: stepId,
                    tool_name: "content.bulk_create",
                    tool_request_id: bulkPost.toolCallId,
                },
            });
            const queued = parseEnvelope(bulkPost.data);
            const jobId = String(queued.job_id ?? "").trim();
            if (!jobId) {
                throw new Error("Bulk create response missing job_id");
            }
            await this.options.runStore.appendRunEvent({
                runId,
                eventType: "bulk_job_queued",
                payload: {
                    job_id: jobId,
                },
            });
            for (let attempt = 0; attempt < this.options.jobPollAttempts; attempt += 1) {
                await sleep(this.options.jobPollIntervalMs);
                const statusGet = await this.invokeGet({
                    installationId,
                    url: this.toolUrl(`/jobs/${encodeURIComponent(jobId)}`),
                });
                this.logToolCall({
                    runId,
                    stepId,
                    installationId,
                    toolName: "jobs.get_status",
                    toolRequestId: statusGet.toolCallId,
                    attempt: attempt + 1,
                });
                await this.options.runStore.appendRunEvent({
                    runId,
                    eventType: "tool_called",
                    payload: {
                        step_id: stepId,
                        tool_name: "jobs.get_status",
                        tool_request_id: statusGet.toolCallId,
                        attempt: attempt + 1,
                    },
                });
                const status = parseEnvelope(statusGet.data);
                await this.options.runStore.appendRunEvent({
                    runId,
                    eventType: "bulk_job_polled",
                    payload: {
                        job_id: jobId,
                        status: status.status,
                        attempt: attempt + 1,
                    },
                });
                if (status.status === "queued" || status.status === "running") {
                    continue;
                }
                const handles = Array.isArray(status.rollback_handles) ? status.rollback_handles : [];
                if (handles.length > 0) {
                    await this.options.runStore.addRunRollbacks({
                        runId,
                        handles: handles
                            .filter((item) => item.handle_id && item.kind)
                            .map((item) => ({
                            handleId: item.handle_id,
                            kind: item.kind,
                            payload: item.payload ?? {},
                        })),
                    });
                    await this.options.runStore.setRunRollbackAvailable(runId, true);
                }
                const createdPages = Number.parseInt(String(status.progress?.created_items ?? pages.length), 10);
                if (status.status === "completed") {
                    await this.options.runStore.setRunCounts({
                        runId,
                        actualToolCalls: 1,
                        actualPages: Number.isFinite(createdPages) ? createdPages : pages.length,
                    });
                    await this.options.runStore.setRunStepStatus({
                        runId,
                        stepId,
                        status: "completed",
                        actualToolCalls: 1,
                        actualPages: Number.isFinite(createdPages) ? createdPages : pages.length,
                        finishedAt: new Date().toISOString(),
                    });
                    await this.options.runStore.setRunStatus({
                        runId,
                        status: "completed",
                        finishedAt: new Date().toISOString(),
                    });
                    await this.options.runStore.appendRunEvent({
                        runId,
                        eventType: "run_completed",
                        payload: {
                            mode,
                            created_pages: Number.isFinite(createdPages) ? createdPages : pages.length,
                        },
                    });
                    return;
                }
                const firstError = Array.isArray(status.errors) ? status.errors[0]?.message : undefined;
                await this.options.runStore.setRunCounts({
                    runId,
                    actualToolCalls: 1,
                    actualPages: Math.max(0, Number.isFinite(createdPages) ? createdPages : 0),
                });
                await this.options.runStore.setRunStepStatus({
                    runId,
                    stepId,
                    status: "failed",
                    actualToolCalls: 1,
                    actualPages: Math.max(0, Number.isFinite(createdPages) ? createdPages : 0),
                    errorCode: "RUN_EXECUTION_FAILED",
                    errorMessage: firstError ?? "Bulk job failed",
                    finishedAt: new Date().toISOString(),
                });
                await this.options.runStore.setRunStatus({
                    runId,
                    status: "failed",
                    errorCode: "RUN_EXECUTION_FAILED",
                    errorMessage: firstError ?? "Bulk job failed",
                    finishedAt: new Date().toISOString(),
                });
                await this.options.runStore.appendRunEvent({
                    runId,
                    eventType: "run_failed",
                    payload: {
                        code: "RUN_EXECUTION_FAILED",
                        message: firstError ?? "Bulk job failed",
                        job_id: jobId,
                    },
                });
                return;
            }
            await this.options.runStore.setRunStepStatus({
                runId,
                stepId,
                status: "failed",
                errorCode: "RUN_EXECUTION_TIMEOUT",
                errorMessage: "Bulk job polling timed out",
                finishedAt: new Date().toISOString(),
            });
            await this.options.runStore.setRunStatus({
                runId,
                status: "failed",
                errorCode: "RUN_EXECUTION_TIMEOUT",
                errorMessage: "Bulk job polling timed out",
                finishedAt: new Date().toISOString(),
            });
            await this.options.runStore.appendRunEvent({
                runId,
                eventType: "run_failed",
                payload: {
                    code: "RUN_EXECUTION_TIMEOUT",
                    message: "Bulk job polling timed out",
                },
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Run execution failed";
            await this.options.runStore.setRunStepStatus({
                runId,
                stepId,
                status: "failed",
                errorCode: "RUN_EXECUTION_FAILED",
                errorMessage: message,
                finishedAt: new Date().toISOString(),
            });
            await this.options.runStore.setRunStatus({
                runId,
                status: "failed",
                errorCode: "RUN_EXECUTION_FAILED",
                errorMessage: message,
                finishedAt: new Date().toISOString(),
            });
            await this.options.runStore.appendRunEvent({
                runId,
                eventType: "run_failed",
                payload: {
                    code: "RUN_EXECUTION_FAILED",
                    message,
                },
            });
        }
    }
    async rollbackRun(runId, installationId) {
        const pending = await this.options.runStore.listPendingRollbacks(runId);
        if (pending.length === 0) {
            return { applied: 0, failed: 0 };
        }
        await this.options.runStore.setRunStatus({
            runId,
            status: "rolling_back",
        });
        await this.options.runStore.appendRunEvent({
            runId,
            eventType: "rollback_started",
            payload: {
                pending_handles: pending.length,
            },
        });
        try {
            const rollbackPost = await this.invokePost({
                installationId,
                url: this.toolUrl("/rollback/apply"),
                body: {
                    run_id: runId,
                },
            });
            this.logToolCall({
                runId,
                installationId,
                toolName: "rollback.apply",
                toolRequestId: rollbackPost.toolCallId,
            });
            await this.options.runStore.appendRunEvent({
                runId,
                eventType: "tool_called",
                payload: {
                    tool_name: "rollback.apply",
                    tool_request_id: rollbackPost.toolCallId,
                },
            });
            const response = parseEnvelope(rollbackPost.data);
            const results = Array.isArray(response.results) ? response.results : [];
            let applied = 0;
            let failed = 0;
            for (const result of results) {
                const handleId = String(result.handle_id ?? "").trim();
                if (!handleId) {
                    continue;
                }
                if (result.status === "applied") {
                    applied += 1;
                    await this.options.runStore.setRunRollbackStatus({
                        runId,
                        handleId,
                        status: "applied",
                        appliedAt: new Date().toISOString(),
                    });
                }
                else {
                    failed += 1;
                    await this.options.runStore.setRunRollbackStatus({
                        runId,
                        handleId,
                        status: "failed",
                        error: result.error ?? "Rollback apply failed",
                    });
                }
            }
            const status = failed > 0 ? "rollback_failed" : "rolled_back";
            await this.options.runStore.setRunStatus({
                runId,
                status,
                finishedAt: new Date().toISOString(),
            });
            await this.options.runStore.setRunRollbackAvailable(runId, failed > 0);
            await this.options.runStore.appendRunEvent({
                runId,
                eventType: "rollback_completed",
                payload: {
                    applied,
                    failed,
                    status,
                },
            });
            return { applied, failed };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Rollback failed";
            await this.options.runStore.setRunStatus({
                runId,
                status: "rollback_failed",
                errorCode: "RUN_ROLLBACK_FAILED",
                errorMessage: message,
                finishedAt: new Date().toISOString(),
            });
            await this.options.runStore.appendRunEvent({
                runId,
                eventType: "rollback_failed",
                payload: {
                    code: "RUN_ROLLBACK_FAILED",
                    message,
                },
            });
            throw error;
        }
    }
}
exports.RunExecutor = RunExecutor;
