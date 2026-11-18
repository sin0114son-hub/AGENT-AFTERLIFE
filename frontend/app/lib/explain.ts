/**
 * Plain-language explanations for audit events.
 *
 * Every sentence comes from one of two places: a field of the audit event itself, or a documented
 * rule of the policy engine (backend/policy/engine.py). Nothing here guesses what the event did not record.
 */
import type { AgentEvent, PolicyMode } from "./types";

/** What each recorded policy_reason_code means, taken from the gates in policy/engine.py. */
export const REASON_TEXT: Record<string, string> = {
  PERMITTED_USER_TOOL: "The tool is user tier and the source trust level was 1, so every gate passed.",
  PERMITTED_SERVICE_TOOL: "Every gate passed at trust level 2 (service).",
  PERMITTED_SYSTEM_ACTOR: "Every gate passed at trust level 3 (system).",
  ALLOW_WITH_FLAG_ADMIN_TIER: "An admin-tier tool at trust level 2 is allowed but flagged for audit.",
  UNTRUSTED_ACTOR: "Trust level 0 (untrusted) is denied for every tool.",
  TRUST_LEVEL_INSUFFICIENT: "Admin-tier tools need trust level 2 or higher (system-tier tools need 3).",
  INJECTION_FLAGGED: "The step carried injection flags, and the defended policy denies a call that has flags.",
  TOOL_NOT_IN_ALLOWLIST: "The tool is not on the policy's allowlist and is not an admin tool.",
  RUNTIME_LIMIT_EXCEEDED: "A runtime limit had already been exceeded.",
  UNDEFENDED_POLICY_NO_CHECK: "The undefended policy makes no trust, allowlist or injection check, so it allows every call.",
};

export const POLICY_TEXT: Record<string, string> = {
  policy_undefended_v1: "Undefended policy: no trust checks, no injection detection, no allowlist.",
  policy_defended_v1: "Defended policy: injection detection, trust-level checks, a tool allowlist, and admin tools need trust level 2 or higher.",
};

const TRUST_NAME = ["untrusted", "user", "service", "system"];

export function trustText(level: number | null | undefined): string {
  if (level === null || level === undefined) return "not recorded in this event";
  return `${level} (${TRUST_NAME[level] ?? "unknown"})`;
}

export function reasonText(code: string | null | undefined): string {
  if (!code) return "No policy reason was recorded for this event.";
  return REASON_TEXT[code] ?? "This reason code has no description in the app. Only the code was recorded.";
}

export function eventTitle(e: AgentEvent): string {
  return `#${e.sequence_number} ${e.event_type.replace(/_/g, " ")}${e.tool_name ? ` ${e.tool_name}` : ""}`;
}

export type DecisionFacts = {
  title: string;
  result: string;
  rows: [label: string, value: string][];
  why: string;
};

/** Facts about one tool-call decision event. All values are read from the event. */
export function decisionFacts(e: AgentEvent): DecisionFacts {
  const result = e.event_type === "TOOL_CALL_DENIED" ? "Denied" : e.event_type === "TOOL_CALL_EXECUTED" ? "Allowed (mock tool ran)" : e.event_type.replace(/_/g, " ").toLowerCase();
  return {
    title: eventTitle(e),
    result,
    rows: [
      ["Tool", e.tool_name ?? "none"],
      ["Policy outcome", e.policy_outcome ?? "none recorded"],
      ["Reason code", e.policy_reason_code ?? "none recorded"],
      ["Policy", e.policy_id],
      ["Source trust level", trustText(e.actor_trust_level)],
      ["Audit event", `sequence ${e.sequence_number}`],
    ],
    why: reasonText(e.policy_reason_code),
  };
}

type Side = { label: string; mode: PolicyMode; event: AgentEvent | null };

/** Describes the first event difference without assuming which side holds which kind of event. */
export function explainFirstDifference(a: Side, b: Side): string {
  if (!a.event && !b.event) return "The two runs have the same events.";
  const injection = [a, b].filter(s => s.event?.event_type === "INJECTION_DETECTED");
  if (injection.length === 1 && a.event && b.event) {
    const other = injection[0] === a ? b : a;
    return `${injection[0].label} (${injection[0].mode}) recorded INJECTION_DETECTED here. ${other.label} (${other.mode}) recorded ${other.event?.event_type} instead. `
      + "The scenario engine emits INJECTION_DETECTED only for the defended policy, which has injection detection; the undefended policy has none.";
  }
  const describe = (s: Side) => (s.event ? `${s.event.event_type}${s.event.tool_name ? ` ${s.event.tool_name}` : ""}${s.event.policy_outcome ? ` ${s.event.policy_outcome}` : ""}` : "no event");
  return `${a.label} (${a.mode}) recorded ${describe(a)}. ${b.label} (${b.mode}) recorded ${describe(b)}.`;
}

/** Says whether the first event difference is the same thing as the key decision. */
export function relateFirstDifferenceToKeyDecision(
  firstA: AgentEvent | null, firstB: AgentEvent | null, keyA: AgentEvent | null | undefined, keyB: AgentEvent | null | undefined,
): { same: boolean; text: string } {
  if (!keyA && !keyB) return { same: false, text: "Neither run reached the key decision, so there is nothing to relate." };
  const same = !!firstA && !!firstB && !!keyA && !!keyB && firstA.event_id === keyA.event_id && firstB.event_id === keyB.event_id;
  if (same) return { same, text: "The first event difference is the key decision." };
  const where = [keyA ? `#${keyA.sequence_number} in Run A` : null, keyB ? `#${keyB.sequence_number} in Run B` : null].filter(Boolean).join(" and ");
  return {
    same,
    text: `The first event difference comes earlier than the key decision (${where}). Key decision events are matched by tool name, not by row number, so their numbers can differ between runs.`,
  };
}

/** One sentence per run that says what the key decision was, from the event alone. */
export function keyDecisionSentence(e: AgentEvent | null | undefined, tool: string | undefined): string {
  if (!e) return `No allow or deny decision for ${tool ?? "the key tool"} is recorded in this run.`;
  const verb = e.event_type === "TOOL_CALL_DENIED" ? "denied" : "allowed";
  return `${e.tool_name} was ${verb} by ${e.policy_id}${e.policy_reason_code ? ` (${e.policy_reason_code})` : ""}.`;
}
