/** What the user was doing when a request failed. Used only to choose helpful wording. */
export type ApiContext = "scenarios" | "start" | "run" | "events" | "report" | "compare";

/** Error with a message that is safe to show: no URL, no response body, no stack. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Status 0 means the request never got an answer (server down, offline, blocked). */
export function describeApiError(status: number, context: ApiContext): string {
  if (status === 0) {
    return "The server could not be reached. Check your connection and that the backend is running, then try again.";
  }
  if (status === 401 || status === 403) {
    return `The server refused the request (HTTP ${status}). Reload the page. If it keeps happening, the deployment's access settings need an operator.`;
  }
  if (status === 404) {
    return context === "scenarios" || context === "start"
      ? "That scenario was not found. Reload the page and choose a scenario from the list."
      : "No run was found for that ID. Copy the run ID from Attack Lab and paste it again. Runs from an older or different server are not available.";
  }
  if (status === 400 && context === "compare") {
    return "These two runs cannot be compared. Use two completed runs of the same scenario, one defended and one undefended, from the same policy revision. Run the pair again in Attack Lab.";
  }
  if (status === 422) return `The request was not accepted (HTTP ${status}). Check the run ID and try again.`;
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return `The server had a problem (HTTP ${status}). Try again in a moment. If it persists, restart the backend.`;
  return `The request failed (HTTP ${status}). Try again.`;
}

/** Message for any caught value. ApiError messages pass through. Everything else gets a generic message. */
export function userMessage(error: unknown, context: ApiContext = "run"): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return describeApiError(0, context);
  if (error instanceof Error && /^(Stream|Connection|Incomplete|Missing|Invalid|Mixed)/.test(error.message)) {
    return "The live event stream was interrupted or malformed. The run may still exist on the server. Run it again, or look it up in Evidence by its run ID.";
  }
  return "Something went wrong. Try again.";
}
