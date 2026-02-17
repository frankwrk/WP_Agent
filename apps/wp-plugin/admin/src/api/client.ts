import type {
  ApiEnvelope,
  ChatMessage,
  ChatSession,
  ConnectStatus,
  PolicyPreset,
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
