import type { NormalizedSkillSpec } from "../skills/normalize";
import type { PlanPolicyContext } from "./plan.validate";

export function buildPlannerMessages(options: {
  skill: NormalizedSkillSpec;
  goal: string;
  inputs: Record<string, unknown>;
  policy: PlanPolicyContext;
}): Array<{ role: "system" | "user"; content: string }> {
  const system = [
    "You are the WP Agent Planner.",
    "Return only one fenced json block with a single JSON object.",
    "Do not include prose before or after the JSON block.",
    "The JSON must include: plan_version, skill_id, goal, assumptions, inputs, steps.",
    "Each step must include: step_id, title, objective, tools, expected_output.",
    "Only use tools listed in the skill tool_allowlist.",
    `Plan must have <= ${options.policy.maxSteps} steps and <= ${options.policy.maxToolCalls} estimated tool calls.`,
  ].join("\n");

  const user = [
    `Skill ID: ${options.skill.skillId}`,
    `Skill Name: ${options.skill.name}`,
    `Skill Description: ${options.skill.description}`,
    `Allowed Tools: ${options.skill.toolAllowlist.join(", ")}`,
    `Skill Safety Class: ${options.skill.safetyClass}`,
    `Skill Caps: ${JSON.stringify(options.skill.caps)}`,
    `Goal: ${options.goal}`,
    `Inputs JSON: ${JSON.stringify(options.inputs)}`,
    "Build a deterministic plan for the goal.",
  ].join("\n");

  return [
    {
      role: "system",
      content: system,
    },
    {
      role: "user",
      content: user,
    },
  ];
}
