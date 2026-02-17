export const POLICY_PRESETS = ["fast", "balanced", "quality", "reasoning"] as const;

export type PolicyPreset = (typeof POLICY_PRESETS)[number];

export interface ChatPolicy {
  preset: PolicyPreset;
  model: string;
  maxOutputTokens: number;
  maxInputChars: number;
  rateLimitPerMinute: number;
  dailyTokenCap: number;
}

export function isPolicyPreset(value: string): value is PolicyPreset {
  return (POLICY_PRESETS as readonly string[]).includes(value);
}
