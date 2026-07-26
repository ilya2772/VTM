import "server-only";

export const SESSION_COOKIE_NAME = "axiom_session";
const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function getSessionTtlSeconds() {
  const configured = Number.parseInt(process.env.SESSION_TTL_SECONDS ?? "", 10);

  if (
    Number.isInteger(configured) &&
    configured >= 300 &&
    configured <= 2_592_000
  ) {
    return configured;
  }

  return DEFAULT_SESSION_TTL_SECONDS;
}
