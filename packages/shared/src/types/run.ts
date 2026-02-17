export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "rolling_back"
  | "rolled_back"
  | "rollback_failed";

export interface RunRecordV1 {
  run_id: string;
  installation_id: string;
  wp_user_id: number;
  plan_id: string;
  status: RunStatus;
  planned_steps: number;
  planned_tool_calls: number;
  planned_pages: number;
  actual_tool_calls: number;
  actual_pages: number;
  error_code: string | null;
  error_message: string | null;
  rollback_available: boolean;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface RunStepV1 {
  step_id: string;
  status: "queued" | "running" | "completed" | "failed";
  planned_tool_calls: number;
  planned_pages: number;
  actual_tool_calls: number;
  actual_pages: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface RunEventV1 {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface RunRollbackV1 {
  handle_id: string;
  kind: string;
  status: "pending" | "applied" | "failed";
  error: string | null;
  created_at: string;
  applied_at: string | null;
}

export interface RunDetailsV1 {
  run: RunRecordV1;
  steps: RunStepV1[];
  events: RunEventV1[];
  rollbacks: RunRollbackV1[];
}
