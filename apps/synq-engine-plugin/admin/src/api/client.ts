import type {
  ApiEnvelope,
  ChatMessage,
  ChatSession,
  ConnectSettings,
  ConnectStatus,
  ConnectTestResult,
  PlanContractApi,
  PlanEvent,
  PolicyPreset,
  RunEventApi,
  RunRecordApi,
  RunRollbackApi,
  RunStepApi,
  SkillCatalogItem,
  SkillSpec,
} from "./types";

function getConfig() {
  const config = window.WP_AGENT_ADMIN_CONFIG;
  if (!config) {
    throw new Error("WP admin config is not available");
  }

  return config;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getConfig();
  const response = await fetch(`${config.restBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-WP-Nonce": config.nonce,
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.ok) {
    const message = payload?.error?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload.data;
}

export async function fetchConnectStatus(): Promise<ConnectStatus> {
  return apiRequest<ConnectStatus>("/connect/status");
}

export async function runPairing(): Promise<void> {
  await apiRequest<unknown>("/pair", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchConnectSettings(): Promise<ConnectSettings> {
  return apiRequest<ConnectSettings>("/connect/settings");
}

export async function saveConnectSettings(backendBaseUrl: string): Promise<ConnectStatus> {
  return apiRequest<ConnectStatus>("/connect/settings", {
    method: "POST",
    body: JSON.stringify({
      backend_base_url: backendBaseUrl,
    }),
  });
}

export async function testBackendConnection(backendBaseUrl: string): Promise<ConnectTestResult> {
  return apiRequest<ConnectTestResult>("/connect/test-connection", {
    method: "POST",
    body: JSON.stringify({
      backend_base_url: backendBaseUrl,
    }),
  });
}

export async function getCurrentSession(policyPreset: PolicyPreset): Promise<{
  session: ChatSession;
  messages: ChatMessage[];
}> {
  return apiRequest<{ session: ChatSession; messages: ChatMessage[] }>(
    `/chat/sessions/current?policy_preset=${encodeURIComponent(policyPreset)}`,
  );
}

export async function createOrResumeSession(policyPreset: PolicyPreset): Promise<{
  session: ChatSession;
  messages: ChatMessage[];
}> {
  return apiRequest<{ session: ChatSession; messages: ChatMessage[] }>("/chat/sessions", {
    method: "POST",
    body: JSON.stringify({
      policy_preset: policyPreset,
    }),
  });
}

export async function sendMessage(sessionId: string, content: string): Promise<{
  session: ChatSession;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}> {
  return apiRequest<{
    session: ChatSession;
    user_message: ChatMessage;
    assistant_message: ChatMessage;
  }>(`/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export interface SkillsListParams {
  tag?: string;
  safetyClass?: "read" | "write_draft" | "write_publish";
  deprecated?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function syncSkills(repoUrl: string, commitSha: string): Promise<{
  ingestion_id: string;
  status: string;
  skill_count: number;
}> {
  return apiRequest<{
    ingestion_id: string;
    status: string;
    skill_count: number;
  }>("/skills/sync", {
    method: "POST",
    body: JSON.stringify({
      repo_url: repoUrl,
      commit_sha: commitSha,
    }),
  });
}

export async function listSkills(params: SkillsListParams = {}): Promise<{
  items: SkillCatalogItem[];
}> {
  const query = new URLSearchParams();
  if (params.tag) {
    query.set("tag", params.tag);
  }
  if (params.safetyClass) {
    query.set("safety_class", params.safetyClass);
  }
  if (params.deprecated !== undefined) {
    query.set("deprecated", String(params.deprecated));
  }
  if (params.search) {
    query.set("search", params.search);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  if (params.offset) {
    query.set("offset", String(params.offset));
  }

  return apiRequest<{ items: SkillCatalogItem[] }>(`/skills?${query.toString()}`);
}

export async function getSkill(skillId: string): Promise<SkillSpec> {
  return apiRequest<SkillSpec>(`/skills/${encodeURIComponent(skillId)}`);
}

export async function draftPlan(payload: {
  policyPreset: PolicyPreset;
  skillId: string;
  goal: string;
  inputs: Record<string, unknown>;
}): Promise<{ plan: PlanContractApi; events: PlanEvent[] }> {
  return apiRequest<{ plan: PlanContractApi; events: PlanEvent[] }>("/plans/draft", {
    method: "POST",
    body: JSON.stringify({
      policy_preset: payload.policyPreset,
      skill_id: payload.skillId,
      goal: payload.goal,
      inputs: payload.inputs,
    }),
  });
}

export async function getPlan(planId: string): Promise<{ plan: PlanContractApi; events: PlanEvent[] }> {
  return apiRequest<{ plan: PlanContractApi; events: PlanEvent[] }>(`/plans/${encodeURIComponent(planId)}`);
}

export async function approvePlan(planId: string): Promise<{ plan: PlanContractApi; events: PlanEvent[] }> {
  return apiRequest<{ plan: PlanContractApi; events: PlanEvent[] }>(
    `/plans/${encodeURIComponent(planId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function createRun(planId: string): Promise<{
  run: RunRecordApi;
  steps: RunStepApi[];
  events: RunEventApi[];
  rollbacks: RunRollbackApi[];
}> {
  return apiRequest<{
    run: RunRecordApi;
    steps: RunStepApi[];
    events: RunEventApi[];
    rollbacks: RunRollbackApi[];
  }>("/runs", {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
    }),
  });
}

export async function getRun(runId: string): Promise<{
  run: RunRecordApi;
  steps: RunStepApi[];
  events: RunEventApi[];
  rollbacks: RunRollbackApi[];
}> {
  return apiRequest<{
    run: RunRecordApi;
    steps: RunStepApi[];
    events: RunEventApi[];
    rollbacks: RunRollbackApi[];
  }>(`/runs/${encodeURIComponent(runId)}`);
}

export async function rollbackRun(runId: string): Promise<{
  run: RunRecordApi;
  steps: RunStepApi[];
  events: RunEventApi[];
  rollbacks: RunRollbackApi[];
}> {
  return apiRequest<{
    run: RunRecordApi;
    steps: RunStepApi[];
    events: RunEventApi[];
    rollbacks: RunRollbackApi[];
  }>(`/runs/${encodeURIComponent(runId)}/rollback`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
