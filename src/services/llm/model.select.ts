import type { ChatPolicy } from "../policy/policy.schema";

export function selectModelForPolicy(policy: ChatPolicy): string {
  return policy.model;
}
