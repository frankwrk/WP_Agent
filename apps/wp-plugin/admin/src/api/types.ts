export type PolicyPreset = "fast" | "balanced" | "quality" | "reasoning";

export interface AdminConfig {
  restBase: string;
  nonce: string;
  initialPage: "connect" | "chat";
  siteUrl: string;
}

export interface ConnectStatus {
  installation_id: string;
  paired: boolean;
  paired_at: string;
  backend_base_url: string;
  backend_audience: string;
  signature_alg: string;
}

export interface ChatSession {
  session_id: string;
  installation_id: string;
  wp_user_id: number;
  policy_preset: PolicyPreset;
  context_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface ChatMessage {
  session_id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  usage_tokens: number;
  created_at: string;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error: { code: string; message: string } | null;
  meta: unknown;
}

declare global {
  interface Window {
    WP_AGENT_ADMIN_CONFIG?: AdminConfig;
  }
}
