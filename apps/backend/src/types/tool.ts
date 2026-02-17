export interface ToolDefinition {
  name: string;
  description: string;
  endpoint: string;
  method: "GET" | "POST";
  readOnly: boolean;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}
