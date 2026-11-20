"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { userMessage } from "../lib/errors";
import { keyDecisionSentence, trustText } from "../lib/explain";
import type { Report } from "../lib/types";
import DecisionCard from "../components/DecisionCard";
import ScrollTable from "../components/ScrollTable";

const VERDICT_COLOR: Record<string, string> = {
  DEFENDED: "var(--defense)",
  VULNERABLE: "var(--attack)",
  ERROR: "var(--warning)",
  INCONCLUSIVE: "var(--text-muted)",
};

export default function EvidencePage() {
  const [runId, setRunId] = useState("");
  const [linkedEventId, setLinkedEventId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      setReport(await api.getReport(id.trim()));
    } catch (e) {
      setError(userMessage(e, "report"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("run_id");
      setLinkedEventId(params.get("event_id"));
      if (id) { setRunId(id); void fetchReport(id); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchReport]);

  const linkedEvent = report?.events.find((ev) => ev.event_id === linkedEventId && ev.run_id === report.run_id);

  useEffect(() => {
    if (linkedEvent) document.getElementById(`audit-${linkedEvent.event_id}`)?.focus();
  }, [linkedEvent]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const id = runId.trim();
    if (loading || !id) return;
    const url = new URL(window.location.href);
    url.searchParams.set("run_id", id);
    url.searchParams.delete("event_id");
    window.history.replaceState(null, "", url);
    setLinkedEventId(null);
    void fetchReport(id);
  }

  return (
    <div className="lab-page narrow">
      <h1>Evidence Report</h1>
      <p className="lead">Retrieve the recorded security evidence for a simulation run.</p>

      <form className="panel input-row" onSubmit={submit}>
        <div className="field">
          <label htmlFor="run-id">Run ID</label>
          <input id="run-id" type="text" value={runId} onChange={(e) => setRunId(e.target.value)} placeholder="Paste a run ID from Attack Lab" autoComplete="off" spellCheck={false} className="mono" />
        </div>
        <button type="submit" className="action primary" disabled={loading || !runId.trim()}>{loading ? "Loading…" : "Fetch"}</button>
      </form>

      {error && <div role="alert" className="alert">{error}</div>}

      {report && (
        <>
          <section className="panel verdict" style={{ borderColor: VERDICT_COLOR[report.verdict] ?? "var(--border)" }} aria-labelledby="ev-verdict">
            <h2 id="ev-verdict" style={{ color: VERDICT_COLOR[report.verdict] }}>{report.verdict}</h2>
            <p>{report.verdict_evidence}</p>
            <ul className="facts">
              {([
                ["Scenario", report.scenario_id],
                ["Mode", report.policy_mode],
                ["Total events", report.summary.total_events],
                ["Proposed", report.summary.tool_calls_proposed],
                ["Allowed", report.summary.tool_calls_allowed],
                ["Denied", report.summary.tool_calls_denied],
                ["Injections", report.summary.injections_detected],
              ] as const).map(([label, val]) => <li key={label}><span className="muted">{label}: </span><strong>{val}</strong></li>)}
            </ul>
          </section>

          <section className="panel" aria-labelledby="ev-key">
            <h2 id="ev-key">Key policy decision{report.critical_tool ? `: ${report.critical_tool}` : ""}</h2>
            <p>{keyDecisionSentence(report.key_decision, report.critical_tool)}</p>
            <div className="decision-grid">
              <DecisionCard heading="Recorded decision" event={report.key_decision} emptyText="This run never reached the key decision, so there is nothing to explain." />
            </div>
          </section>

          <h2 className="table-title">Audit log ({report.events.length} events)</h2>
          {linkedEventId && !linkedEvent && <p role="status" className="note">That event was not found in this run. The full audit log is below.</p>}
          <ScrollTable label="Audit log">
            <table>
              <caption className="sr-only">Audit events of this run in order</caption>
              <thead>
                <tr>{["#", "Type", "Tool", "Policy", "Reason", "Caller trust", "Input provenance"].map((h) => <th key={h} scope="col">{h}</th>)}</tr>
              </thead>
              <tbody>
                {report.events.map((ev) => {
                  const isDeny = ev.policy_outcome === "DENY";
                  const isKey = report.key_decision?.event_id === ev.event_id;
                  return (
                    <tr key={ev.event_id} id={`audit-${ev.event_id}`} tabIndex={linkedEvent === ev ? -1 : undefined}
                      className={linkedEvent === ev ? "audit-target" : isKey ? "row-first" : undefined}>
                      <th scope="row">{ev.sequence_number}</th>
                      <td className={isDeny ? "result-deny" : ev.event_type === "TOOL_CALL_EXECUTED" ? "result-allow" : undefined}>
                        {ev.event_type.replace(/_/g, " ")}{isKey && <><br /><strong>Key decision</strong></>}
                      </td>
                      <td>{ev.tool_name ? <code>{ev.tool_name}</code> : <span className="muted">None</span>}</td>
                      <td>{ev.policy_outcome ? <strong className={isDeny ? "result-deny" : "result-allow"}>{ev.policy_outcome}</strong> : <span className="muted">None</span>}</td>
                      <td>{ev.policy_reason_code ?? "None"}</td>
                      <td>{trustText(ev.actor_trust_level)}</td>
                      <td>{ev.content_provenance ?? "None"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollTable>

          <p className="note">
            Mode A: this evidence log is generated from deterministic synthetic fixtures. It does not represent real AI model behavior or real network activity.
          </p>
        </>
      )}

      {!report && !loading && !error && (
        <div className="empty">Run a simulation in Attack Lab, then use its Evidence link or paste the run ID here.</div>
      )}
    </div>
  );
}
