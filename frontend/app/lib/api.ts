import type { ScenarioSummary, RunInfo, AgentEvent, Report, CompareResult, PolicyMode } from "./types";
import { ApiError, describeApiError, type ApiContext } from "./errors.ts";

async function get<T>(path: string, context: ApiContext): Promise<T> {
  let res: Response;
  try { res = await fetch(path, { cache: "no-store" }); }
  catch { throw new ApiError(0, describeApiError(0, context)); }
  // The body is deliberately not read: it can hold internal URLs or raw JSON.
  if (!res.ok) throw new ApiError(res.status, describeApiError(res.status, context));
  return res.json() as Promise<T>;
}

export const api = {
  async listScenarios(): Promise<ScenarioSummary[]> {
    return (await get<{scenarios: ScenarioSummary[]}>("/api/scenarios", "scenarios")).scenarios;
  },
  getRun(runId: string): Promise<RunInfo> {
    return get(`/api/run/${encodeURIComponent(runId)}`, "run");
  },
  async getRunEvents(runId: string): Promise<AgentEvent[]> {
    return (await get<{events: AgentEvent[]}>(`/api/run/${encodeURIComponent(runId)}/events`, "events")).events;
  },
  getReport(runId: string): Promise<Report> {
    return get(`/api/report/${encodeURIComponent(runId)}`, "report");
  },
  compare(a: string, b: string): Promise<CompareResult> {
    return get(`/api/compare?run_a=${encodeURIComponent(a)}&run_b=${encodeURIComponent(b)}`, "compare");
  },
  async startRun(scenarioId: string, mode: PolicyMode, signal: AbortSignal,
    onEvent: (event: AgentEvent) => void): Promise<{run: RunInfo; events: AgentEvent[]}> {
    let res: Response;
    try {
      res = await fetch("/api/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario_id: scenarioId, policy_mode: mode }), signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ApiError(0, describeApiError(0, "start"));
    }
    if (!res.ok) throw new ApiError(res.status, describeApiError(res.status, "start"));
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Missing event stream");
    const decoder = new TextDecoder();
    let buffer = "", runId = "", terminal = "";
    const seen = new Set<string>();
    const consume = (frame: string) => {
      const lines = frame.split(/\r\n|\r|\n/).filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).replace(/^ /, ""));
      if (!lines.length) return;
      const event = JSON.parse(lines.join("\n")) as AgentEvent;
      if (!event.event_id || !event.run_id || !event.event_type) throw new Error("Invalid event");
      if (runId && runId !== event.run_id) throw new Error("Mixed run IDs");
      runId = event.run_id;
      if (seen.has(event.event_id)) return;
      seen.add(event.event_id);
      terminal = event.event_type;
      onEvent(event);
    };
    while (true) {
      const {done, value} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream: true});
      let match: RegExpExecArray | null;
      while ((match = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
        consume(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (done) break;
    }
    if (buffer.trim()) throw new Error("Incomplete event frame");
    if (!runId) throw new Error("Stream ended without a run ID");
    const [run, events] = await Promise.all([api.getRun(runId), api.getRunEvents(runId)]);
    if (events.length !== seen.size || events.some(e => !seen.has(e.event_id)))
      throw new Error("Stream and stored events differ");
    if (run.status === "COMPLETE" && terminal !== "RUN_COMPLETE")
      throw new Error("Connection ended before completion event");
    if (run.status === "CREATED" || run.status === "RUNNING") throw new Error("Connection ended before server completion");
    return {run, events};
  },
};
