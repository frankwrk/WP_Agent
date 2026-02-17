export interface PlanContract {
  id: string;
  title: string;
  steps: Array<{ id: string; action: string }>;
}
