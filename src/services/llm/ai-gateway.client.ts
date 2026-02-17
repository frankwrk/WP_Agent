import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getConfig } from "../../config";

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  requestId?: string;
  model: string;
  messages: ChatCompletionMessage[];
  maxTokens: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usageTokens: number;
  requestId?: string;
  providerRequestId?: string;
}

export interface LlmClient {
  completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
}

function normalizeProviderError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    error
    && typeof error === "object"
    && "cause" in error
    && (error as { cause?: unknown }).cause instanceof Error
    && (error as { cause: Error }).cause.message.trim()
  ) {
    return (error as { cause: Error }).cause.message;
  }

  return "LLM request failed";
}

function headerValue(headers: Headers, key: string): string | undefined {
  const value = headers.get(key);
  return value ? value : undefined;
}

export function extractProviderRequestId(response: unknown): string | undefined {
  if (!response || typeof response !== "object") {
    return undefined;
  }

  const candidate = response as {
    id?: unknown;
    requestId?: unknown;
    request_id?: unknown;
    headers?: unknown;
    response?: { headers?: unknown };
    providerMetadata?: Record<string, unknown>;
  };

  const direct = [candidate.requestId, candidate.request_id, candidate.id]
    .map((value) => String(value ?? "").trim())
    .find((value) => value.length > 0);

  if (direct) {
    return direct;
  }

  const possibleHeaders = [candidate.headers, candidate.response?.headers];
  for (const possible of possibleHeaders) {
    if (possible instanceof Headers) {
      return (
        headerValue(possible, "x-request-id")
        ?? headerValue(possible, "request-id")
        ?? headerValue(possible, "openai-request-id")
      );
    }
  }

  if (candidate.providerMetadata && typeof candidate.providerMetadata === "object") {
    for (const value of Object.values(candidate.providerMetadata)) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const raw = value as Record<string, unknown>;
      const providerId = [raw.requestId, raw.request_id, raw.id]
        .map((item) => String(item ?? "").trim())
        .find((item) => item.length > 0);

      if (providerId) {
        return providerId;
      }
    }
  }

  return undefined;
}

export class AiGatewayClient implements LlmClient {
  private readonly provider;

  constructor(
    private readonly apiKey = getConfig().aiGatewayApiKey,
    private readonly baseUrl = getConfig().aiGatewayBaseUrl,
  ) {
    this.provider = createOpenAICompatible({
      name: "vercel-ai-gateway",
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
  }

  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    if (!this.apiKey) {
      throw new Error("AI_GATEWAY_API_KEY is required for chat runtime");
    }

    try {
      const result = await generateText({
        model: this.provider(request.model),
        messages: request.messages,
        maxOutputTokens: request.maxTokens,
      });

      const content = result.text.trim();
      if (!content) {
        throw new Error("LLM returned an empty response");
      }

      const usageTokens = (
        result.usage.totalTokens
        ?? ((result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0))
      ) || Math.max(1, Math.ceil(content.length / 4));

      return {
        content,
        model: result.response.modelId ?? request.model,
        usageTokens,
        requestId: request.requestId,
        providerRequestId: extractProviderRequestId(result.response),
      };
    } catch (error) {
      throw new Error(normalizeProviderError(error));
    }
  }
}
