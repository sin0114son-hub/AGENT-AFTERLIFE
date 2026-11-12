import type { ScenarioSummary, RunInfo, AgentEvent, Report, CompareResult, PolicyMode } from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  async listScenarios(): Promise<ScenarioSummary[]> {
    return (await get<{scenarios: ScenarioSummary[]}>("/api/scenarios")).scenarios;
  },
  getRun(runId: string): Promise<RunInfo> {
    return get(`/api/run/${encodeURIComponent(runId)}`);
  },
  async getRunEvents(runId: string): Promise<AgentEvent[]> {
    return (await get<{events: AgentEvent[]}>(`/api/run/${encodeURIComponent(runId)}/events`)).events;
  },
  getReport(runId: string): Promise<Report> {
    return get(`/api/report/${encodeURIComponent(runId)}`);
  },
  compare(a: string, b: string): Promise<CompareResult> {
    return get(`/api/compare?run_a=${encodeURIComponent(a)}&run_b=${encodeURIComponent(b)}`);
  },
  async startRun(scenarioId: string, mode: PolicyMode, signal: AbortSignal,
    onEvent: (event: AgentEvent) => void): Promise<{run: RunInfo; events: AgentEvent[]}> {
    const res = await fetch("/api/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_id: scenarioId, policy_mode: mode }), signal,
    });
    if (!res.ok) throw new Error(`POST /api/run: ${res.status} ${await res.text()}`);
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
