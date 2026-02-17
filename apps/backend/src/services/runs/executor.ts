import { randomUUID } from "node:crypto";
import {
  signedWpGetJsonWithMeta,
  signedWpJsonRequestWithMeta,
  type SignedWpJsonResponse,
} from "../wp/wp.client";
import type { RunStore } from "./store";

interface WpEnvelope<T> {
  ok: boolean;
  data: T;
  error?: {
    code?: string;
    message?: string;
  } | null;
}

interface CreatePageResult {
  item?: {
    id: number;
  };
  rollback_handle?: {
    handle_id: string;
    kind: string;
    payload?: Record<string, unknown>;
  };
}

interface BulkCreateResult {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
}

interface JobStatusResult {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress?: {
    total_items?: number;
    processed_items?: number;
    created_items?: number;
    failed_items?: number;
  };
  rollback_handles?: Array<{
    handle_id: string;
    kind: string;
    payload?: Record<string, unknown>;
  }>;
  errors?: Array<{ message?: string }>;
}

interface RollbackApplyResult {
  run_id: string;
  summary?: {
    total?: number;
    applied?: number;
    failed?: number;
  };
  results?: Array<{
    handle_id: string;
    status: "applied" | "failed";
    error?: string;
  }>;
}

interface LoggerLike {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
  error?: (obj: Record<string, unknown>, msg?: string) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseEnvelope<T>(raw: unknown): T {
  const envelope = raw as WpEnvelope<T>;
  if (!envelope || typeof envelope !== "object" || !envelope.ok) {
    throw new Error("WP tool call returned invalid envelope");
  }

  return envelope.data;
}

export interface RunExecutorOptions {
  runStore: RunStore;
  wpToolApiBase: string;
  jobPollIntervalMs: number;
  jobPollAttempts: number;
  logger?: LoggerLike;
  invokePost?: (options: {
    installationId: string;
    url: string;
    body: unknown;
  }) => Promise<unknown>;
  invokeGet?: (options: {
    installationId: string;
    url: string;
  }) => Promise<unknown>;
}

export class RunExecutor {
  constructor(private readonly options: RunExecutorOptions) {}

  private toolUrl(path: string): string {
    return `${this.options.wpToolApiBase.replace(/\/$/, "")}${path}`;
  }

  private logToolCall(payload: Record<string, unknown>) {
    this.options.logger?.info(payload, "wp tool call");
  }

  private async invokePost(options: {
    installationId: string;
    url: string;
    body: unknown;
  }): Promise<SignedWpJsonResponse<unknown>> {
    if (this.options.invokePost) {
      return {
        data: await this.options.invokePost(options),
        toolCallId: randomUUID(),
      };
    }

    return signedWpJsonRequestWithMeta<unknown>({
      installationId: options.installationId,
      url: options.url,
      method: "POST",
      body: options.body,
    });
  }

  private async invokeGet(options: {
    installationId: string;
    url: string;
  }): Promise<SignedWpJsonResponse<unknown>> {
    if (this.options.invokeGet) {
      return {
        data: await this.options.invokeGet(options),
        toolCallId: randomUUID(),
      };
    }

    return signedWpGetJsonWithMeta<unknown>({
      installationId: options.installationId,
      url: options.url,
    });
  }

  async executeRun(runId: string, installationId: string): Promise<void> {
    const run = await this.options.runStore.getRun(runId);
    if (!run) {
      return;
    }

    const input = run.inputPayload as {
      mode?: "single" | "bulk";
      step_id?: string;
      pages?: Array<{
        title: string;
        slug?: string;
        content?: string;
        excerpt?: string;
        meta?: Record<string, unknown>;
      }>;
    };

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

        const result = parseEnvelope<CreatePageResult>(post.data);
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

      const queued = parseEnvelope<BulkCreateResult>(bulkPost.data);
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

        const status = parseEnvelope<JobStatusResult>(statusGet.data);
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

        const createdPages = Number.parseInt(
          String(status.progress?.created_items ?? pages.length),
          10,
        );

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
    } catch (error) {
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

  async rollbackRun(runId: string, installationId: string): Promise<{
    applied: number;
    failed: number;
  }> {
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

      const response = parseEnvelope<RollbackApplyResult>(rollbackPost.data);
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
        } else {
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
    } catch (error) {
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
