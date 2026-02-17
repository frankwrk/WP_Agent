import { getConfig } from "../../config";
import { signedWpJsonRequest } from "./wp.client";

export interface ToolDefinition {
  name: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST";
  readOnly: boolean;
  safetyClass?: "read" | "write_draft" | "write_publish";
  costWeight?: number;
  internalOnly?: boolean;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface ToolManifestResponse {
  ok: boolean;
  data: {
    tools: ToolDefinition[];
    auth?: {
      signature_alg?: string;
      mode?: string;
    };
  };
  error: unknown;
  meta: Record<string, unknown>;
}

const REQUIRED_READ_TOOLS = [
  "site.get_environment",
  "content.inventory",
  "seo.get_config",
] as const;

function parseToolDefinition(input: unknown): ToolDefinition | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const name = String(candidate.name ?? "").trim();
  const description = String(candidate.description ?? "").trim();
  const endpoint = String(candidate.endpoint ?? "").trim();
  const method = String(candidate.method ?? "").toUpperCase();
  const readOnly = Boolean(candidate.readOnly);

  if (!name || !description || !endpoint) {
    return null;
  }

  if (method !== "GET" && method !== "POST") {
    return null;
  }

  return {
    name,
    description,
    endpoint,
    method,
    readOnly,
    safetyClass:
      candidate.safetyClass === "read"
      || candidate.safetyClass === "write_draft"
      || candidate.safetyClass === "write_publish"
        ? (candidate.safetyClass as "read" | "write_draft" | "write_publish")
        : undefined,
    costWeight: Number.isFinite(Number(candidate.costWeight))
      ? Number(candidate.costWeight)
      : undefined,
    internalOnly: candidate.internalOnly === undefined ? undefined : Boolean(candidate.internalOnly),
    inputSchema:
      candidate.inputSchema && typeof candidate.inputSchema === "object"
        ? (candidate.inputSchema as Record<string, unknown>)
        : undefined,
    outputSchema:
      candidate.outputSchema && typeof candidate.outputSchema === "object"
        ? (candidate.outputSchema as Record<string, unknown>)
        : undefined,
  };
}

export function validateToolManifest(input: unknown): ToolManifestResponse {
  if (!input || typeof input !== "object") {
    throw new Error("Tool manifest response must be an object");
  }

  const response = input as Record<string, unknown>;
  const ok = Boolean(response.ok);
  const data = response.data;
  if (!ok || !data || typeof data !== "object") {
    throw new Error("Tool manifest response is not successful");
  }

  const dataRecord = data as Record<string, unknown>;
  const rawTools = Array.isArray(dataRecord.tools) ? dataRecord.tools : [];
  const tools = rawTools
    .map((tool) => parseToolDefinition(tool))
    .filter((tool): tool is ToolDefinition => tool !== null);

  return {
    ok: true,
    data: {
      tools,
      auth:
        dataRecord.auth && typeof dataRecord.auth === "object"
          ? (dataRecord.auth as ToolManifestResponse["data"]["auth"])
          : undefined,
    },
    error: response.error ?? null,
    meta:
      response.meta && typeof response.meta === "object"
        ? (response.meta as Record<string, unknown>)
        : {},
  };
}

export function assertRequiredReadTools(manifest: ToolManifestResponse): void {
  const names = new Set(manifest.data.tools.map((tool) => tool.name));
  for (const required of REQUIRED_READ_TOOLS) {
    if (!names.has(required)) {
      throw new Error(`Required read tool is missing from manifest: ${required}`);
    }
  }
}

export async function fetchToolManifest(
  installationId: string,
  wpToolApiBase = getConfig().wpToolApiBase,
): Promise<ToolManifestResponse> {
  if (!wpToolApiBase) {
    throw new Error("WP_TOOL_API_BASE is required to fetch WP tool manifest");
  }

  const manifestUrl = `${wpToolApiBase.replace(/\/$/, "")}/manifest`;

  const response = await signedWpJsonRequest<unknown>({
    installationId,
    url: manifestUrl,
    method: "GET",
  });

  return validateToolManifest(response);
}
