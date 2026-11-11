# Agent Afterlife — Defense Architecture

## Principle
Every defense layer is independently verifiable.
No single layer is assumed to be sufficient.
An error or timeout is never counted as a successful defense.

---

## Layer 1 — Input and Context Provenance

Every piece of content entering the agent context is tagged at ingestion:

```
{
  "content_id": "uuid",
  "source_type": "user_input" | "tool_output" | "system_fixture" | "memory",
  "trust_level": 0 | 1 | 2 | 3,  // 0=untrusted, 3=system
  "origin_label": "web_search_mock" | "user" | "system",
  "ingested_at": "iso8601",
  "content_hash": "sha256"
}
```

**Rule:** Untrusted content (trust_level < 2) MUST NOT be promoted to instruction context without explicit policy approval.

**Failure mode:** Label forgery. Mitigated by: labels are set server-side at ingestion; client cannot override.

---

## Layer 2 — Detection and Classification

Two sub-mechanisms (both required; neither alone is sufficient):

### 2a. Structural Anomaly Detection
Checks for instruction-shaped content in untrusted sources:
- Imperative verbs at sentence start in tool output
- Phrases matching known injection patterns (keyword list as secondary signal only)
- Structural mismatch between expected tool output schema and actual content

### 2b. Trust Boundary Violation Check
Before any tool output enters the agent reasoning loop:
- Compare `source_type` of content against expected context role
- Flag: tool output containing `role: system` or `role: assistant` structure
- Flag: content length disproportionate to task (resource exhaustion signal)

**Outputs:**
- `INJECTION_SUSPECTED` (requires policy decision)
- `CLEAN` (passes to next layer)
- `ANOMALY_LOGGED` (passes but flagged in audit)

**Known limitation:** Semantic-level injection (content that is structurally valid but semantically adversarial) requires Mode B with LLM-based classifier.

---

## Layer 3 — Policy Enforcement (Core)

The policy engine is a **pure function** evaluated server-side:

```
PolicyEngine.evaluate(
  actor: AgentIdentity,
  action: ToolCallProposal,
  context: ExecutionContext,
  policy: PolicyConfig
) -> PolicyDecision
```

```
PolicyDecision = {
  outcome: "ALLOW" | "DENY" | "ALLOW_WITH_FLAG" | "REQUIRE_APPROVAL",
  reason_code: string,
  evidence_ref: string,
  evaluated_at: iso8601
}
```

### Trust Level Matrix

| Actor Trust | Tool Tier | Decision |
|---|---|---|
| 0 (untrusted) | any | DENY |
| 1 (user) | user-tier | ALLOW |
| 1 (user) | admin-tier | DENY → `TRUST_CHECK_FAILED` |
| 2 (service) | user-tier | ALLOW |
| 2 (service) | admin-tier | ALLOW_WITH_FLAG |
| 3 (system) | any | ALLOW |

### Policy Configurations
- `policy_undefended.json` — no trust checks, no injection detection (vulnerable baseline)
- `policy_defended.json` — full Layer 2 + Layer 3 enforcement

**Critical rule:** The LLM (Mode B) is NEVER the sole authority for allow/deny. Policy engine runs independently on the server.

---

## Layer 4 — Tool Execution Isolation

All tools in MVP are mock implementations:

```python
class MockTool:
    name: str
    tier: Literal["user", "admin", "system"]
    fixture_response: dict  # static — no I/O
    side_effects: list[str]  # recorded, not executed
```

**Prohibited:**
- `subprocess`, `os.system`, `eval`, `exec`
- Real file writes outside `fixtures/`
- Real network calls
- Real secret access

**Verification:** `grep -r "subprocess\|os.system\|eval\|exec" backend/` must return 0 matches in tool files.

---

## Layer 5 — Output Validation

All agent outputs are validated before rendering:

- Structured tool call arguments validated against Pydantic schema
- Output size limit: 10KB per event
- No raw HTML rendering in Evidence Report (escaped)
- Sensitive fixture fields (marked `sensitive: true`) shown as `[REDACTED]` in UI

---

## Layer 6 — Runtime Controls

Defined per scenario run:

```python
RuntimeLimits = {
  "max_tool_calls": 10,
  "max_execution_depth": 5,
  "timeout_seconds": 30,
  "max_events": 100,
  "max_input_bytes": 4096,  # Mode B only
  "mode": "guided" | "live"
}
```

If any limit is hit: run terminates with `EXECUTION_LIMIT_REACHED` event. This is NOT a successful defense — it is a timeout.

---

## Layer 7 — Evidence and Audit Log

Every run produces an append-only event log:

```json
{
  "event_id": "uuid-v4",
  "run_id": "uuid-v4",
  "scenario_id": "string",
  "policy_id": "string",
  "sequence_number": "integer",
  "timestamp": "iso8601",
  "actor": "agent_id | system | mock_tool_name",
  "event_type": "TOOL_CALL_PROPOSED | TOOL_CALL_DENIED | TOOL_CALL_EXECUTED | INJECTION_DETECTED | TRUST_CHECK_FAILED | EXECUTION_LIMIT_REACHED | RUN_COMPLETE | RUN_ERROR",
  "tool_name": "string | null",
  "tool_args_hash": "sha256 | null",
  "policy_outcome": "ALLOW | DENY | ALLOW_WITH_FLAG | null",
  "policy_reason_code": "string | null",
  "content_provenance": "content_id | null",
  "mock_result": "object | null",
  "error": "string | null"
}
```

**Invariants:**
- `sequence_number` monotonically increasing within a `run_id`
- `event_id` globally unique
- Log is never modified after `RUN_COMPLETE`

---

## Security Outcome Semantics

The 9 distinguishable outcomes (never collapse to generic SUCCESS/FAIL):

| Code | Meaning |
|---|---|
| `ATTACK_NOT_ATTEMPTED` | Scenario ran; attack payload not reached |
| `ATTACK_ATTEMPTED` | Injection/escalation payload processed |
| `MODEL_REFUSED` | LLM declined (Mode B only) |
| `INJECTION_DETECTED` | Layer 2 flagged suspicious content |
| `UNAUTHORIZED_ACTION_PROPOSED` | Agent proposed denied tool call |
| `UNAUTHORIZED_ACTION_DENIED` | Policy engine blocked tool call |
| `UNAUTHORIZED_ACTION_EXECUTED` | Tool call succeeded (vulnerable mode) |
| `EXECUTION_LIMIT_REACHED` | Timeout/budget — NOT a defense |
| `RUN_ERROR` | System error — NOT a defense |
