import type { AgentEvent } from "../lib/types";
import { POLICY_TEXT, decisionFacts } from "../lib/explain";

/** One tool-call decision, shown from its audit event. Missing values say "not recorded". */
export default function DecisionCard({ heading, event, emptyText, showPolicyDescription = true }: { heading: string; event: AgentEvent | null | undefined; emptyText: string; showPolicyDescription?: boolean }) {
  if (!event) {
    return <div className="decision-card"><h3>{heading}</h3><p>{emptyText}</p></div>;
  }
  const facts = decisionFacts(event);
  const denied = event.event_type === "TOOL_CALL_DENIED";
  return <div className="decision-card" data-testid="decision-card">
    <h3>{heading}</h3>
    <p className={denied ? "result-deny" : "result-allow"}><strong>{facts.result}</strong></p>
    <dl>{facts.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p><strong>Rule behind this reason:</strong> {facts.why}</p>
    {showPolicyDescription && <p className="muted">{POLICY_TEXT[event.policy_id] ?? `Policy ${event.policy_id}`}</p>}
  </div>;
}
