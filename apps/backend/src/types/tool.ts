export type ToolSafetyClass = "read" | "write_draft" | "write_publish";

export interface ToolDefinition {
  name: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST";
  readOnly: boolean;
  safetyClass?: ToolSafetyClass;
  costWeight?: number;
  internalOnly?: boolean;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}
