"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { api } from "../lib/api";
import { userMessage } from "../lib/errors";
import { useSimulation } from "../lib/useSimulation";
import { EVENT_LABEL } from "../lib/graphUtils";
import { eventTitle, keyDecisionSentence, reasonText, trustText } from "../lib/explain";
import type { ScenarioSummary, Report, PolicyMode } from "../lib/types";
import DecisionCard from "../components/DecisionCard";

// React Flow must be dynamically imported (no SSR) due to browser-only APIs
const ReactFlowGraph = dynamic(() => import("../components/ReactFlowGraph"), {
  ssr: false,
  loading: () => <div className="graph-loading">Loading graph…</div>,
});

const VERDICT_COLOR: Record<string, string> = {
  DEFENDED: "var(--defense)",
  VULNERABLE: "var(--attack)",
  ERROR: "var(--warning)",
  INCONCLUSIVE: "var(--text-muted)",
};

export default function AttackLabPage() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [mode, setMode] = useState<PolicyMode>("defended");
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // Completed runs of this page visit, so a defended and an undefended run can be compared with one click.
  const [completed, setCompleted] = useState<Record<string, string>>({});
  const started = useRef<{ scenario: string; mode: PolicyMode } | null>(null);

  const [sim, controls] = useSimulation();

  useEffect(() => {
    api
      .listScenarios()
      .then((list) => {
        setScenarios(list);
        if (list.length > 0) setSelectedScenario(list[0].scenario_id);
      })
      .catch((e: unknown) => setScenariosError(userMessage(e, "scenarios")));
  }, []);

  useEffect(() => {
    if (sim.status !== "COMPLETE" || !sim.runId) return;
    let active = true;
    const runId = sim.runId;
    if (started.current) {
      const key = `${started.current.scenario}:${started.current.mode}`;
      setCompleted((prev) => ({ ...prev, [key]: runId }));
    }
    api
      .getReport(runId)
      .then((value) => { if (active) setReport(value); })
      .catch((error: unknown) => { if (active) setReportError(userMessage(error, "report")); });
    return () => { active = false; };
  }, [sim.status, sim.runId]);

  const handleStart = useCallback(() => {
    if (!selectedScenario) return;
    setReport(null);
    setReportError(null);
    setCopyMessage("");
    setSelectedEventId(null);
    started.current = { scenario: selectedScenario, mode };
    controls.start(selectedScenario, mode);
  }, [selectedScenario, mode, controls]);

  async function copyRunId() {
    if (!sim.runId) return;
    try {
      await navigator.clipboard.writeText(sim.runId);
      setCopyMessage("Run ID copied.");
    } catch {
      setCopyMessage("Copy is not available here. Select the run ID text and copy it yourself.");
    }
  }

  const selectedEvent = sim.events.find((event) => event.event_id === selectedEventId);
  const currentScenario = scenarios.find((s) => s.scenario_id === selectedScenario);
  const undefendedId = completed[`${selectedScenario}:undefended`];
  const defendedId = completed[`${selectedScenario}:defended`];

  const reportLoading = sim.status === "COMPLETE" && !report && !reportError;
  const isRunning = sim.status === "RUNNING";
  const canStart = !isRunning && !!selectedScenario && !scenariosError;

  return (
    <div className="lab-page wide">
      <h1>Attack Lab</h1>
      <p className="lead">Choose a synthetic scenario and a policy, then follow the run as it unfolds.</p>

      <div className="panel input-row">
        <div className="field grow">
          <label htmlFor="scenario-select">Scenario</label>
          {scenariosError ? (
            <p role="alert" className="alert">{scenariosError}</p>
          ) : (
            <select id="scenario-select" aria-label="Select scenario" value={selectedScenario} onChange={(e) => setSelectedScenario(e.target.value)} disabled={isRunning}>
              {scenarios.map((s) => <option key={s.scenario_id} value={s.scenario_id}>{s.name}</option>)}
            </select>
          )}
        </div>

        <div className="field">
          <span className="label-text" id="mode-label">Policy mode</span>
          <div className="button-pair" role="group" aria-labelledby="mode-label">
            {(["defended", "undefended"] as PolicyMode[]).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} disabled={isRunning} aria-pressed={mode === m}
                className={`action toggle ${m}`}>
                {m === "defended" ? "Defended" : "Undefended"}
              </button>
            ))}
          </div>
        </div>

        <div className="button-pair">
          <button type="button" onClick={handleStart} disabled={!canStart} aria-label={isRunning ? "Running" : "Start simulation"} className="action primary">
            {isRunning ? "Running…" : "Start simulation"}
          </button>
          {isRunning && <button type="button" onClick={controls.abort} aria-label="Cancel simulation" className="action danger">Cancel</button>}
        </div>
      </div>

      {currentScenario && (
        <div className="panel meta">
          <span><span className="muted">ID: </span><code>{currentScenario.scenario_id}</code></span>
          <span><span className="muted">Attack: </span>{currentScenario.attack_category}</span>
          <span><span className="muted">Steps: </span>{currentScenario.step_count}</span>
          <span className="muted">{currentScenario.description}</span>
        </div>
      )}

      <div className="panel status-bar">
        {isRunning && <span className="pulse-dot dot" aria-hidden />}
        <span role="status">Status: <strong>{sim.status.toUpperCase()}</strong></span>
        <span>Events: {sim.events.length}</span>
        {sim.error && <span className="result-deny">{sim.error}</span>}
      </div>

      {sim.runId && (
        <section className="panel" aria-labelledby="run-id-title">
          <h2 id="run-id-title">Run ID</h2>
          <p><code className="run-id" data-testid="run-id">{sim.runId}</code></p>
          <div className="button-pair wrap">
            <button type="button" className="action" onClick={copyRunId}>Copy run ID</button>
            {sim.status === "COMPLETE" && <Link className="action" href={`/evidence?run_id=${encodeURIComponent(sim.runId)}`}>Open in Evidence</Link>}
            {undefendedId && defendedId && <Link className="action" href={`/time-machine?run_a=${encodeURIComponent(undefendedId)}&run_b=${encodeURIComponent(defendedId)}`}>Compare undefended and defended runs</Link>}
          </div>
          <p role="status" className="muted">{copyMessage}</p>
          {sim.status === "COMPLETE" && !(undefendedId && defendedId) && (
            <p className="muted">To compare, run this scenario once undefended and once defended. A Compare link then appears here.</p>
          )}
        </section>
      )}

      {reportError && <p role="alert" className="alert">Report unavailable. {reportError}</p>}
      {(reportLoading || report) && (
        <section className="panel" aria-labelledby="report-title" style={{ borderColor: report ? VERDICT_COLOR[report.verdict] ?? "var(--border)" : "var(--border)" }}>
          <h2 id="report-title">Result</h2>
          {reportLoading && <p className="muted">Loading report…</p>}
          {report && (
            <>
              <p className="verdict-word" style={{ color: VERDICT_COLOR[report.verdict] }}>{report.verdict}</p>
              <p>{report.verdict_evidence}</p>
              <h3>Key policy decision{report.critical_tool ? `: ${report.critical_tool}` : ""}</h3>
              <p>{keyDecisionSentence(report.key_decision, report.critical_tool)}</p>
              <div className="decision-grid">
                <DecisionCard heading="Recorded decision" event={report.key_decision} emptyText="This run did not reach the key decision." />
              </div>
              <ul className="facts">
                {([
                  ["Proposed", report.summary.tool_calls_proposed],
                  ["Allowed", report.summary.tool_calls_allowed],
                  ["Denied", report.summary.tool_calls_denied],
                  ["Injections", report.summary.injections_detected],
                  ["Trust violations", report.summary.trust_violations],
                ] as const).map(([label, val]) => <li key={label}><span className="muted">{label}: </span><strong>{val}</strong></li>)}
              </ul>
              <p className="note">Mode A: these results are fixture-driven synthetic simulations. They do not represent real AI model behavior.</p>
            </>
          )}
        </section>
      )}

      <div className="audit-workspace">
        <section className="panel timeline" aria-labelledby="timeline-title">
          <h2 id="timeline-title">Event timeline</h2>
          {sim.events.length === 0 ? (
            <p className="muted">{sim.status === "idle" ? "Start a simulation to see its audit events."
              : isRunning ? "Waiting for the first audit event…" : "No audit events were received."}</p>
          ) : (
            <ol className="timeline-list">
              {sim.events.map((ev) => {
                const denied = ev.event_type === "TOOL_CALL_DENIED";
                const executed = ev.event_type === "TOOL_CALL_EXECUTED";
                const isKey = report?.key_decision?.event_id === ev.event_id;
                return (
                  <li key={ev.event_id}>
                    <button type="button" className={`timeline-item${denied ? " deny" : executed ? " allow" : ""}`}
                      data-event-id={ev.event_id} aria-pressed={selectedEventId === ev.event_id}
                      aria-controls="audit-event-detail" onClick={() => setSelectedEventId(ev.event_id)}>
                      <span className="timeline-head">
                        <strong>#{ev.sequence_number} {executed ? "Mock tool executed" : EVENT_LABEL[ev.event_type]}</strong>
                        {ev.policy_outcome && <strong className={denied ? "result-deny" : "result-allow"}>{ev.policy_outcome}</strong>}
                      </span>
                      {ev.tool_name && <code>{ev.tool_name}</code>}
                      {ev.policy_reason_code && <span className="muted">{ev.policy_reason_code}</span>}
                      {isKey && <strong>Key policy decision</strong>}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <div className="audit-inspector">
          <section id="audit-event-detail" className="panel decision-card" aria-labelledby="audit-event-title">
            <h2 id="audit-event-title">Selected audit event</h2>
            {!selectedEvent ? <p className="muted">Select a timeline entry or a graph event to read its recorded details.</p> : (
              <>
                <h3>{eventTitle(selectedEvent)}</h3>
                <dl>
                  <div><dt>Tool</dt><dd>{selectedEvent.tool_name ?? "Not recorded"}</dd></div>
                  <div><dt>Policy outcome</dt><dd>{selectedEvent.policy_outcome ?? "Not recorded"}</dd></div>
                  <div><dt>Reason code</dt><dd>{selectedEvent.policy_reason_code ?? "Not recorded"}</dd></div>
                  <div><dt>Caller trust level</dt><dd>{trustText(selectedEvent.actor_trust_level)}</dd></div>
                  <div><dt>Input provenance</dt><dd>{selectedEvent.content_provenance ?? "Not recorded"}</dd></div>
                </dl>
                {selectedEvent.policy_reason_code && <p>{reasonText(selectedEvent.policy_reason_code)}</p>}
                {selectedEvent.error && <p className="result-deny">{selectedEvent.error}</p>}
                <p><Link href={{ pathname: "/evidence", query: { run_id: selectedEvent.run_id, event_id: selectedEvent.event_id } }} prefetch={false}>
                  Open audit event #{selectedEvent.sequence_number} in Evidence
                </Link></p>
              </>
            )}
          </section>

          <section className="panel graph-panel" aria-labelledby="graph-title">
            <details open>
              <summary><h2 id="graph-title">Event graph</h2></summary>
              <p className="muted">The dashed line shows scenario context. Numbered rows show audit order. A solid line links a policy decision and a mock execution recorded in the same event.</p>
              <div className="graph-frame">
                <ReactFlowGraph events={sim.events} selectedId={selectedEventId} onSelect={setSelectedEventId} />
              </div>
            </details>
          </section>
        </div>
      </div>
      <p className="note">These are synthetic scenarios using mock tools; no real agent actions occur.</p>
    </div>
  );
}
