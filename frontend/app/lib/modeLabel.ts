export const NEUTRAL_LABEL = "AGENT AFTERLIFE";

const GUIDED_ROUTES = ["/attack-lab", "/time-machine", "/evidence"];

/** Global badge. Says GUIDED only on routes that run the guided scenarios. */
export function navModeLabel(pathname: string | null | undefined): string {
  if (!pathname) return NEUTRAL_LABEL;
  if (pathname === "/playground" || pathname.startsWith("/playground/")) return "EXPERIMENT";
  if (GUIDED_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"))) return "MODE A · GUIDED";
  return NEUTRAL_LABEL;
}

/** In-page badge on /playground. Unknown or missing mode gives the neutral label. */
export function experimentModeLabel(mode: unknown): string {
  if (mode === "simulated") return "SIMULATED · no model is called";
  if (mode === "gemini") return "GEMINI LIVE · input is sent to Google";
  return NEUTRAL_LABEL;
}
