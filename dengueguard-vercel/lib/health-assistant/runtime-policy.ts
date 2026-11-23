export interface HealthAssistantRuntimeEnvironment {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  HEALTH_ASSISTANT_PAUSED?: string;
  HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS?: string;
}

/**
 * AI-generated answers remain paused by default.
 * Re-enabling them requires BOTH an explicit unpause and the existing draft flag.
 * Production remains evidence-only until a separate approved release.
 */
export function isDraftAnswersEnabled(env: HealthAssistantRuntimeEnvironment): boolean {
  if (env.HEALTH_ASSISTANT_PAUSED !== "false") return false;
  if (env.HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS !== "true") return false;
  return env.NODE_ENV !== "production" || env.VERCEL_ENV === "preview";
}
