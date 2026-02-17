export type PolicyPreset = "fast" | "balanced" | "quality" | "reasoning";

export interface ChatPolicy {
  preset: PolicyPreset;
  model: string;
  maxOutputTokens: number;
  maxInputChars: number;
  rateLimitPerMinute: number;
  dailyTokenCap: number;
}
