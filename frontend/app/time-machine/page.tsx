"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { userMessage } from "../lib/errors";
import { eventTitle, explainFirstDifference, keyDecisionSentence, relateFirstDifferenceToKeyDecision } from "../lib/explain";
import type { AgentEvent, AlignedStep, CompareResult } from "../lib/types";
import DecisionCard from "../components/DecisionCard";
import ScrollTable from "../components/ScrollTable";

const DIFF_LABEL: Record<AlignedStep["diff"], string> = {
  SAME: "Same",
  OUTCOME_DIFFERS: "Outcome differs",
  EVENT_MISSING_A: "Missing in Run A",
  EVENT_MISSING_B: "Missing in Run B",
};

function EventCell({ event }: { event: AgentEvent | null }) {
  if (!event) return <span className="muted">No event</span>;
  return <span>
    {event.event_type.replace(/_/g, " ")}
    {event.tool_name && <><br /><code>{event.tool_name}</code></>}
    {event.policy_outcome && <><br /><strong className={event.policy_outcome === "DENY" ? "result-deny" : "result-allow"}>{event.policy_outcome}</strong></>}
    {event.policy_reason_code && <><br /><span className="muted">{event.policy_reason_code}</span></>}
  </span>;
}

export default function TimeMachinePage() {
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async (a: string, b: string) => {
    if (!a.trim() || !b.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.compare(a.trim(), b.trim()));
    } catch (e) {
      setError(userMessage(e, "compare"));
    } finally {
      setLoading(false);
    }
  }, []);

  // Attack Lab links here with ?run_a=...&run_b=... so nobody has to paste two IDs.
  useEffect(() => {
    // Deferred so the state updates are not made synchronously inside the effect body.
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const a = params.get("run_a") ?? "", b = params.get("run_b") ?? "";
      if (a && b) {
        setRunA(a); setRunB(b);
        void compare(a, b);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [compare]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void compare(runA, runB);
  }

  const first = result && result.first_divergence_sequence != null;
  const sideA = result && { label: "Run A", mode: result.run_a.policy_mode, event: result.divergence_event_a };
  const sideB = result && { label: "Run B", mode: result.run_b.policy_mode, event: result.divergence_event_b };
  const relation = result && relateFirstDifferenceToKeyDecision(result.divergence_event_a, result.divergence_event_b, result.key_decision_a, result.key_decision_b);

  return (
    <div className="lab-page">
      <h1>Time Machine</h1>
      <p className="lead">Compare two runs of one scenario. See where the audit logs first differ, and which policy decision the scenario is about.</p>

      <form className="panel input-row" onSubmit={submit}>
        {[
          { id: "run-a", label: "Run A (e.g. undefended)", val: runA, set: setRunA },
          { id: "run-b", label: "Run B (e.g. defended)", val: runB, set: setRunB },
        ].map(({ id, label, val, set }) => (
          <div key={id} className="field">
            <label htmlFor={id}>{label}</label>
            <input id={id} type="text" value={val} onChange={(e) => set(e.target.value)} placeholder="run ID (UUID)" autoComplete="off" spellCheck={false} className="mono" />
          </div>
        ))}
        <button type="submit" className="action primary" disabled={loading || !runA.trim() || !runB.trim()}>{loading ? "Comparing…" : "Compare"}</button>
      </form>

      {error && <div role="alert" className="alert">{error}</div>}

      {result && sideA && sideB && relation && (
        <>
          <p role="status" className="muted">
            Scenario <code>{result.scenario_id}</code>. Run A was <strong>{result.run_a.policy_mode}</strong>, Run B was <strong>{result.run_b.policy_mode}</strong>.
          </p>

          <section className="panel" aria-labelledby="tm-first">
            <h2 id="tm-first">First event difference{first ? `: step #${result.first_divergence_sequence}` : ""}</h2>
            {first ? <>
              <p>{explainFirstDifference(sideA, sideB)}</p>
              <p className="muted">Rows are matched by position. This is the first row where the two logs stop matching. It may not be the scenario&apos;s main decision.</p>
              <div className="decision-grid">
                <div className="decision-card"><h3>Run A ({result.run_a.policy_mode})</h3><p>{result.divergence_event_a ? eventTitle(result.divergence_event_a) : "No event at this step"}</p></div>
                <div className="decision-card"><h3>Run B ({result.run_b.policy_mode})</h3><p>{result.divergence_event_b ? eventTitle(result.divergence_event_b) : "No event at this step"}</p></div>
              </div>
            </> : <p>The two runs recorded the same events at every step.</p>}
          </section>

          <section className="panel" aria-labelledby="tm-key">
            <h2 id="tm-key">Key policy decision{result.critical_tool ? `: ${result.critical_tool}` : ""}</h2>
            <p>This is the decision the scenario teaches. It is the first allow or deny event for that tool in each run, found by tool name.</p>
            <p data-testid="key-relation"><strong>{relation.text}</strong></p>
            <div className="decision-grid">
              <DecisionCard heading={`Run A (${result.run_a.policy_mode})`} event={result.key_decision_a} emptyText={keyDecisionSentence(null, result.critical_tool)} />
              <DecisionCard heading={`Run B (${result.run_b.policy_mode})`} event={result.key_decision_b} emptyText={keyDecisionSentence(null, result.critical_tool)} />
            </div>
          </section>

          <h2 className="table-title">All aligned events</h2>
          <ScrollTable label="Run comparison, all aligned events">
            <table>
              <caption className="sr-only">Events of both runs, aligned by position</caption>
              <thead>
                <tr><th scope="col">#</th><th scope="col">Run A ({result.run_a.policy_mode})</th><th scope="col">Run B ({result.run_b.policy_mode})</th><th scope="col">Diff</th></tr>
              </thead>
              <tbody>
                {result.aligned_steps.map((step) => {
                  const isDivergence = step.sequence === result.first_divergence_sequence;
                  const isKey = [result.key_decision_a, result.key_decision_b].some(k => k && (k.event_id === step.event_a?.event_id || k.event_id === step.event_b?.event_id));
                  return (
                    <tr key={step.sequence} className={isDivergence ? "row-first" : undefined}>
                      <th scope="row">{step.sequence}</th>
                      <td><EventCell event={step.event_a} /></td>
                      <td><EventCell event={step.event_b} /></td>
                      <td>
                        {DIFF_LABEL[step.diff]}
                        {isDivergence && <><br /><strong>First difference</strong></>}
                        {isKey && <><br /><strong>Key decision</strong></>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollTable>

          <p className="note">
            Guided scenarios use fixtures, not a real model. The reason and policy text above comes from the recorded events and the policy rules.
            Details the event did not record, such as which injection flags were set, are not shown.
          </p>
        </>
      )}

      {!result && !loading && !error && (
        <div className="empty">Run a scenario undefended and defended in Attack Lab. Its Compare link opens this page with both IDs filled in, or paste two run IDs above.</div>
      )}
    </div>
  );
}
