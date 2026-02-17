import type { ChatPolicy, PolicyPreset } from "../policy/policy.schema";
import {
  preferenceFromPolicyPreset,
  resolveModelCandidates,
  resolveModelPreference,
  taskClassFromPolicyPreset,
  type ModelPreference,
  type ModelTaskClass,
} from "./models";

export interface ModelSelectionResult {
  model: string;
  preference: ModelPreference;
  taskClass: ModelTaskClass;
  candidates: string[];
  routingReason: string;
}

export function selectModelForPolicy(options: {
  policy: ChatPolicy;
  policyPreset?: PolicyPreset;
  taskClass?: ModelTaskClass;
  explicitPreference?: ModelPreference | null;
  routeDefaultPreference?: ModelPreference;
  additionalCandidates?: string[];
}): ModelSelectionResult {
  const policyPreset = options.policyPreset ?? options.policy.preset;
  const taskClass = options.taskClass ?? taskClassFromPolicyPreset(policyPreset);
  const routeDefaultPreference =
    options.routeDefaultPreference ?? preferenceFromPolicyPreset(policyPreset);

  const preference = resolveModelPreference({
    explicitPreference: options.explicitPreference,
    routeDefaultPreference,
  });

  const candidates = resolveModelCandidates({
    taskClass,
    preference,
    additionalCandidates: [
      ...(options.additionalCandidates ?? []),
      options.policy.model,
    ],
  });

  const model = candidates[0] ?? "google/gemini-3-flash";
  const routingReason = `policy:${policyPreset} task:${taskClass} pref:${preference} candidates:[${candidates.join(",")}] => ${model}`;

  return {
    model,
    preference,
    taskClass,
    candidates,
    routingReason,
  };
}
