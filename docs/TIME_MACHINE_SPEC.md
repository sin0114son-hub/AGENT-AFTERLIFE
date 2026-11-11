# Agent Afterlife — Time Machine Specification

## Purpose
The Time Machine is not a replay animation. It is an evidence-based causal comparison interface that lets a user understand *exactly why* two runs produced different outcomes.

---

## Core Requirement: Same Scenario, Different Policy

A valid Time Machine comparison requires:
- `run_a.scenario_id == run_b.scenario_id`
- `run_a.policy_mode != run_b.policy_mode` (typically: undefended vs defended)
- Both runs: status = `COMPLETE`
- Both runs: same scenario version/fixture hash

If these conditions are not met, comparison is refused with a clear error.

---

## Event Alignment Algorithm

**Mode A (Guided, Deterministic):**

Since both runs are deterministic over the same fixture, event alignment is by `sequence_number`:

```
aligned_steps = []
for i in 1..max(len(events_a), len(events_b)):
  event_a = events_a[i] if i <= len(events_a) else None
  event_b = events_b[i] if i <= len(events_b) else None
  diff = compute_diff(event_a, event_b)
  aligned_steps.append({ sequence: i, event_a, event_b, diff })
```

`compute_diff`:
- `SAME`: event_type, actor, tool_name identical
- `OUTCOME_DIFFERS`: event_type differs or policy_outcome differs
- `EVENT_MISSING_A`: event_b exists but event_a does not
- `EVENT_MISSING_B`: event_a exists but event_b does not

**First divergence:** first aligned step where diff != `SAME`.

---

**Mode B (Live LLM — P1):**

LLM runs are non-deterministic. Alignment is semantic, not positional:

1. Group events by `event_type` and `tool_name`
2. Find the earliest step where `policy_outcome` differs
3. Mark all subsequent steps as potentially causally affected
4. Display uncertainty notice: "Model behavior is not guaranteed identical between runs."

---

## Causal Explanation Generation

The causal explanation is **generated from structured data**, not inferred by an LLM:

```python
def generate_causal_explanation(divergence_step, run_a, run_b) -> str:
    tool = divergence_step.event_a.tool_name
    outcome_a = divergence_step.event_a.policy_outcome  # e.g. ALLOW
    outcome_b = divergence_step.event_b.policy_outcome  # e.g. DENY
    reason = divergence_step.event_b.policy_reason_code # e.g. TRUST_CHECK_FAILED
    
    return (
        f"At step {divergence_step.sequence}, both runs proposed calling `{tool}`. "
        f"In {run_a.policy_mode} mode, the call was {outcome_a}. "
        f"In {run_b.policy_mode} mode, the policy engine returned {outcome_b} "
        f"(reason: {reason})."
    )
```

This text is template-generated. No hallucination risk. The claim is backed by the event data the user can inspect.

---

## What the Time Machine Does NOT Claim

- It does NOT claim the LLM "understood" the injection (Mode A has no LLM)
- It does NOT claim the defense is complete or sufficient
- It does NOT attribute every behavioral difference to the policy (Mode B)
- It does NOT show raw tool arguments (only hashes, to avoid secret leakage)
- It does NOT invent model reasoning

---

## Uncertainty Display Rules

| Condition | Display |
|---|---|
| Mode A, both runs deterministic | No uncertainty notice |
| Mode B, runs use same model/config | Amber notice: "LLM non-determinism possible" |
| Mode B, runs use different model/config | Red notice: "Runs are not directly comparable — model or config differs" |
| Either run ended in ERROR/TIMEOUT | "⚠ This run ended with an error. The comparison may be incomplete." |

---

## UI Interaction States

| State | Description |
|---|---|
| No runs selected | "Select two runs to compare" prompt |
| One run selected | "Select a second run with the same scenario" |
| Runs have different scenario_id | Error: "These runs use different scenarios and cannot be compared" |
| Comparison ready | Show aligned steps, scrubber, divergence marker |
| Step expanded | Show full event JSON + causal explanation + policy detail |
| Export | Download `comparison_{run_a_id}_vs_{run_b_id}.json` |

---

## Export Format

```json
{
  "comparison_id": "uuid",
  "generated_at": "iso8601",
  "run_a": { "run_id": "...", "policy_mode": "undefended", "scenario_id": "..." },
  "run_b": { "run_id": "...", "policy_mode": "defended",   "scenario_id": "..." },
  "first_divergence_sequence": 4,
  "causal_explanation": "At step 4...",
  "uncertainty_level": "none" | "nondeterminism_possible" | "not_comparable",
  "aligned_steps": [ ... ]
}
```
