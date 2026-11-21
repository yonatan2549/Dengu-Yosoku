export interface HealthAssistantRuntimeEnvironment {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS?: string;
}

/**
 * AI-generated answers are permitted only in local development or explicitly
 * enabled Vercel Preview deployments. Production deployments always remain
 * evidence-only until clinical governance is approved in a separate release.
 */
export function isDraftAnswersEnabled(env: HealthAssistantRuntimeEnvironment): boolean {
  if (env.HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS !== "true") return false;
  return env.NODE_ENV !== "production" || env.VERCEL_ENV === "preview";
}
