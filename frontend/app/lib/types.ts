/**
 * Frontend type definitions — kept in sync with backend/models.py.
 * These types mirror the Pydantic models exactly.
 */

export type PolicyMode = "defended" | "undefended";

export type EventType =
  | "TOOL_CALL_PROPOSED"
  | "TOOL_CALL_EXECUTED"
  | "TOOL_CALL_DENIED"
  | "INJECTION_DETECTED"
  | "TRUST_CHECK_FAILED"
  | "EXECUTION_LIMIT_REACHED"
  | "RUN_COMPLETE"
  | "RUN_ERROR";

export type PolicyOutcome =
  | "ALLOW"
  | "DENY"
  | "ALLOW_WITH_FLAG"
  | "REQUIRE_APPROVAL";

export type RunStatus =
  | "CREATED"
  | "RUNNING"
  | "COMPLETE"
  | "ERROR"
  | "TIMEOUT"
  | "CANCELLED";

export type VerdictCode = "DEFENDED" | "VULNERABLE" | "INCONCLUSIVE" | "ERROR";

export interface AgentEvent {
  event_id: string;
  run_id: string;
  scenario_id: string;
  policy_id: string;
  sequence_number: number;
  timestamp: string;
  actor: string;
  event_type: EventType;
  tool_name?: string | null;
  tool_args_hash?: string | null;
  policy_outcome?: PolicyOutcome | null;
  policy_reason_code?: string | null;
  content_provenance?: string | null;
  mock_result?: Record<string, unknown> | null;
  error?: string | null;
  /** Trust level the policy used for a tool-call decision. Absent or null on older events and on non-tool events. */
  actor_trust_level?: number | null;
}

export interface ScenarioSummary {
  scenario_id: string;
  name: string;
  description: string;
  attack_category: string;
  supported_modes: string[];
  step_count: number;
}

export interface RunInfo {
  run_id: string;
  scenario_id: string;
  policy_mode: PolicyMode;
  status: RunStatus;
  created_at: string;
  completed_at: string | null;
  mode: string;
  event_count: number;
}

export interface ReportSummary {
  total_events: number;
  tool_calls_proposed: number;
  tool_calls_allowed: number;
  tool_calls_denied: number;
  injections_detected: number;
  trust_violations: number;
  execution_errors: number;
  timeouts: number;
}

export interface Report {
  report_id: string;
  run_id: string;
  scenario_id: string;
  policy_mode: PolicyMode;
  generated_at: string;
  summary: ReportSummary;
  verdict: VerdictCode;
  verdict_evidence: string;
  /** Tool whose allow or deny decision is the point of the scenario. */
  critical_tool?: string;
  /** First executed or denied event of that tool, or null when the run never reached it. */
  key_decision?: AgentEvent | null;
  events: AgentEvent[];
}

export interface AlignedStep {
  sequence: number;
  event_a: AgentEvent | null;
  event_b: AgentEvent | null;
  diff: "SAME" | "OUTCOME_DIFFERS" | "EVENT_MISSING_A" | "EVENT_MISSING_B";
}

export interface CompareResult {
  run_a: { run_id: string; policy_mode: PolicyMode };
  run_b: { run_id: string; policy_mode: PolicyMode };
  scenario_id: string;
  critical_tool?: string;
  key_decision_a?: AgentEvent | null;
  key_decision_b?: AgentEvent | null;
  first_divergence_sequence: number | null;
  divergence_event_a: AgentEvent | null;
  divergence_event_b: AgentEvent | null;
  aligned_steps: AlignedStep[];
}
