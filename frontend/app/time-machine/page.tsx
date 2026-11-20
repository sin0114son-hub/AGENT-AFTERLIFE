"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { userMessage } from "../lib/errors";
import { eventTitle, explainFirstDifference, keyDecisionSentence, relateFirstDifferenceToKeyDecision } from "../lib/explain";
import type { AgentEvent, AlignedStep, CompareResult } from "../lib/types";
import DecisionCard from "../components/DecisionCard";
import ScrollTable from "../components/ScrollTable";

const DIFF_LABEL: Record<AlignedStep["diff"], string> = {
  SAME: "Compared fields match",
  OUTCOME_DIFFERS: "Compared fields differ",
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
    if (loading || !runA.trim() || !runB.trim()) return;
    const url = new URL(window.location.href);
    url.searchParams.set("run_a", runA.trim());
    url.searchParams.set("run_b", runB.trim());
    window.history.replaceState(null, "", url);
    void compare(runA, runB);
  }

  const first = result && result.first_divergence_sequence != null;
  const sideA = result && { label: "Run A", mode: result.run_a.policy_mode, event: result.divergence_event_a };
  const sideB = result && { label: "Run B", mode: result.run_b.policy_mode, event: result.divergence_event_b };
  const relation = result && relateFirstDifferenceToKeyDecision(result.divergence_event_a, result.divergence_event_b, result.key_decision_a, result.key_decision_b);

  const sides = result ? [
    { slot: "event_a" as const, label: "Run A", run: result.run_a, key: result.key_decision_a, first: result.divergence_event_a },
    { slot: "event_b" as const, label: "Run B", run: result.run_b, key: result.key_decision_b, first: result.divergence_event_b },
  ] : [];
  if (sides[0]?.run.policy_mode === "defended") sides.reverse();

  return (
    <div className="lab-page time-machine">
      <h1>Time Machine</h1>
      <p className="lead">Compare the same mock action with and without its defense policy.</p>

      <form className="panel input-row" onSubmit={submit}>
        {[
          { id: "run-a", label: "Run A", val: runA, set: setRunA },
          { id: "run-b", label: "Run B", val: runB, set: setRunB },
        ].map(({ id, label, val, set }) => (
          <div key={id} className="field">
            <label htmlFor={id}>{label}</label>
            <input id={id} type="text" value={val} onChange={(e) => set(e.target.value)} placeholder="run ID (UUID)" autoComplete="off" spellCheck={false} className="mono" />
          </div>
        ))}
        <button type="submit" className="action primary" disabled={!runA.trim() || !runB.trim()} aria-disabled={loading || !runA.trim() || !runB.trim()}>{loading ? "Comparing…" : "Compare"}</button>
      </form>

      <span role="status" className="sr-only">{loading ? "Comparing runs…" : result ? "Comparison complete." : ""}</span>
      {error && <div role="alert" className="alert">{error}</div>}

      {result && sideA && sideB && relation && (
        <>
          <p className="muted">
            Scenario <code>{result.scenario_id}</code>. Run A was <strong>{result.run_a.policy_mode}</strong>, Run B was <strong>{result.run_b.policy_mode}</strong>.
          </p>

          <section className="panel tm-decision" aria-labelledby="tm-key">
            <h2 id="tm-key">Key policy decision · <code>{result.critical_tool ?? "Tool not recorded"}</code></h2>
            {result.critical_tool && result.aligned_steps.some(({ event_a }) => event_a?.event_type === "TOOL_CALL_PROPOSED" && event_a.tool_name === result.critical_tool)
              && result.aligned_steps.some(({ event_b }) => event_b?.event_type === "TOOL_CALL_PROPOSED" && event_b.tool_name === result.critical_tool)
              && <p>Both runs proposed this mock action. {first && <a href="#tm-first">First difference #{result.first_divergence_sequence}{result.key_decision_a && result.key_decision_b && (relation.same ? " is the key decision" : " differs from the key decision")}</a>}</p>}
            <div className="decision-grid">
              {sides.map(({ label, run, key }) => (
                <div className="tm-side" data-decision={key?.event_type} key={run.run_id}>
                  <DecisionCard heading={`${run.policy_mode === "defended" ? "Defended" : "Undefended"} · ${label}`}
                    event={key} showPolicyDescription={false} emptyText={keyDecisionSentence(null, result.critical_tool)} />
                  {key && <Link className="tm-evidence" href={{ pathname: "/evidence", query: { run_id: run.run_id, event_id: key.event_id } }}>
                    {run.policy_mode === "defended" ? "Defended" : "Undefended"} evidence · event #{key.sequence_number}
                  </Link>}
                </div>
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="tm-first">
            <h2 id="tm-first">First event difference{first ? `: step #${result.first_divergence_sequence}` : ""}</h2>
            <p data-testid="key-relation"><strong>{first ? relation.text : "All aligned positions match on the compared fields."}</strong></p>
            {first && <>
              <p>{explainFirstDifference(sideA, sideB)}</p>
              <div className="decision-grid">
                {sides.map(({ label, run, first: event }) => (
                  <div key={run.run_id}>
                    <h3>{label} ({run.policy_mode})</h3>
                    {event ? <Link href={{ pathname: "/evidence", query: { run_id: run.run_id, event_id: event.event_id } }}>{eventTitle(event)}</Link> : "No event at this step"}
                  </div>
                ))}
              </div>
            </>}
          </section>

          <h2 className="table-title">All aligned events</h2>
          <p className="muted">Rows align by position and compare event type, actor, tool and policy outcome.</p>
          <ScrollTable label="Run comparison, all aligned events">
            <table>
              <caption className="sr-only">Events of both runs, aligned by position</caption>
              <thead>
                <tr><th scope="col">#</th>{sides.map(({ run, label }) => <th key={run.run_id} scope="col">{run.policy_mode} · {label}</th>)}<th scope="col">Diff</th></tr>
              </thead>
              <tbody>
                {result.aligned_steps.map((step) => {
                  const isDivergence = step.sequence === result.first_divergence_sequence;
                  const isKey = [result.key_decision_a, result.key_decision_b].some(k => k && (k.event_id === step.event_a?.event_id || k.event_id === step.event_b?.event_id));
                  return (
                    <tr key={step.sequence} className={isDivergence ? "row-first" : undefined}>
                      <th scope="row">{step.sequence}</th>
                      {sides.map(({ run, slot }) => <td key={run.run_id}><EventCell event={step[slot]} /></td>)}

                      <td>
                        {DIFF_LABEL[step.diff]}
                        {step.diff === "SAME" && step.event_a?.policy_reason_code !== step.event_b?.policy_reason_code && <><br /><strong>Reasons differ</strong></>}
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
