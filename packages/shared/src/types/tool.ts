export type ToolSafetyClass = "read" | "write_draft" | "write_publish";

export interface ToolDefinition {
  name: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST";
  readOnly: boolean;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  safetyClass?: ToolSafetyClass;
  costWeight?: number;
}

export interface ToolManifest {
  tools: ToolDefinition[];
  auth?: {
    signature_alg?: string;
    mode?: string;
  };
}
