# Agent Afterlife — API Contract

## Base URL
Development: `http://localhost:8000/api`

## Content-Type
All requests/responses: `application/json`
SSE streams: `text/event-stream`

---

## Shared Types

### Event (canonical — Pydantic source of truth)

```typescript
// frontend/lib/types.ts mirrors this exactly
type EventType =
  | "TOOL_CALL_PROPOSED"
  | "TOOL_CALL_EXECUTED"
  | "TOOL_CALL_DENIED"
  | "INJECTION_DETECTED"
  | "TRUST_CHECK_FAILED"
  | "EXECUTION_LIMIT_REACHED"
  | "RUN_COMPLETE"
  | "RUN_ERROR";

type PolicyOutcome = "ALLOW" | "DENY" | "ALLOW_WITH_FLAG" | "REQUIRE_APPROVAL";

interface AgentEvent {
  event_id: string;         // uuid-v4
  run_id: string;           // uuid-v4
  scenario_id: string;
  policy_id: string;
  sequence_number: number;  // monotonically increasing
  timestamp: string;        // ISO 8601
  actor: string;            // agent_id | "system" | tool_name
  event_type: EventType;
  tool_name: string | null;
  tool_args_hash: string | null;  // sha256, NOT raw args
  policy_outcome: PolicyOutcome | null;
  policy_reason_code: string | null;
  content_provenance: string | null;
  mock_result: Record<string, unknown> | null;
  error: string | null;
}
```

### RunStatus

```typescript
type RunStatus = "CREATED" | "RUNNING" | "COMPLETE" | "ERROR" | "TIMEOUT" | "CANCELLED";
```

---

## Endpoints

### GET /api/scenarios

Returns available scenarios.

**Response 200:**
```json
{
  "scenarios": [
    {
      "scenario_id": "scenario_01_prompt_injection",
      "name": "Prompt Injection via Tool Output",
      "description": "...",
      "attack_category": "AT-01",
      "supported_modes": ["guided"],
      "step_count": 6
    },
    {
      "scenario_id": "scenario_02_trust_escalation",
      "name": "Trust Boundary Escalation",
      "description": "...",
      "attack_category": "AT-02",
      "supported_modes": ["guided"],
      "step_count": 5
    }
  ]
}
```

---

### POST /api/run

Start a guided scenario run.

**Request:**
```json
{
  "scenario_id": "scenario_01_prompt_injection",
  "policy_mode": "defended"
}
```

**Validation:**
- `scenario_id`: must exist in registry
- `policy_mode`: must be `"defended"` or `"undefended"`

**Response 200 (SSE stream):**
```
Content-Type: text/event-stream

data: {"event_id": "...", "run_id": "...", "event_type": "TOOL_CALL_PROPOSED", ...}

data: {"event_id": "...", "run_id": "...", "event_type": "TOOL_CALL_DENIED", ...}

data: {"event_id": "...", "run_id": "...", "event_type": "RUN_COMPLETE", ...}
```

Each `data:` line is a single JSON-serialized `AgentEvent`.
Stream ends after `RUN_COMPLETE` or `RUN_ERROR`.

**Response 404:**
```json
{ "detail": "Scenario not found", "scenario_id": "..." }
```

**Response 422:**
```json
{ "detail": [{ "loc": ["body", "policy_mode"], "msg": "value is not a valid enum member", "type": "enum" }] }
```

---

### POST /api/run/live  *(P1 — Mode B)*

Start a live LLM run with custom prompt.

**Request:**
```json
{
  "prompt": "Research the top 5 AI security risks.",
  "scenario_template": "research_agent",
  "policy_mode": "defended"
}
```

**Validation:**
- `prompt`: max 4096 bytes, non-empty
- `scenario_template`: must exist
- Rate limit: 5 live runs per session per 10 minutes

**Response:** SSE stream (same schema as guided run)
Additional fields in events: `model_id`, `prompt_hash`

**Response 429:**
```json
{ "detail": "Rate limit exceeded", "retry_after_seconds": 300 }
```

---

### GET /api/run/{run_id}

Get run metadata.

**Response 200:**
```json
{
  "run_id": "...",
  "scenario_id": "...",
  "policy_mode": "defended",
  "mode": "guided",
  "status": "COMPLETE",
  "created_at": "2026-11-11T12:00:00Z",
  "completed_at": "2026-11-11T12:00:03Z",
  "event_count": 8
}
```

**Response 404:**
```json
{ "detail": "Run not found" }
```

---

### GET /api/run/{run_id}/events

Get all events for a completed run (for Time Machine).

**Response 200:**
```json
{
  "run_id": "...",
  "events": [ /* AgentEvent[] ordered by sequence_number */ ]
}
```

---

### GET /api/report/{run_id}

Generate evidence report.

**Response 200:**
```json
{
  "report_id": "...",
  "run_id": "...",
  "scenario_id": "...",
  "policy_mode": "defended",
  "generated_at": "...",
  "summary": {
    "total_events": 8,
    "tool_calls_proposed": 3,
    "tool_calls_allowed": 2,
    "tool_calls_denied": 1,
    "injections_detected": 1,
    "trust_violations": 0,
    "execution_errors": 0,
    "timeouts": 0
  },
  "verdict": "DEFENDED" | "VULNERABLE" | "INCONCLUSIVE" | "ERROR",
  "verdict_evidence": "data_exfiltrate call was proposed and DENIED at sequence_number=4",
  "events": [ /* AgentEvent[] */ ]
}
```

**Verdict rules:**
- `DEFENDED`: scenario-specific success condition met (see scenario fixture)
- `VULNERABLE`: attack succeeded (unauthorized action executed)
- `INCONCLUSIVE`: scenario did not reach the critical decision point
- `ERROR`: run ended in ERROR or TIMEOUT — NEVER reported as DEFENDED

---

### GET /api/compare

Compare two runs (Time Machine).

**Query params:** `run_a={run_id}&run_b={run_id}`

**Validation:** Both runs must share the same `scenario_id`.

**Response 200:**
```json
{
  "run_a": { "run_id": "...", "policy_mode": "undefended" },
  "run_b": { "run_id": "...", "policy_mode": "defended" },
  "scenario_id": "...",
  "first_divergence_sequence": 4,
  "divergence_event_a": { /* AgentEvent */ },
  "divergence_event_b": { /* AgentEvent */ },
  "aligned_steps": [
    {
      "sequence": 1,
      "event_a": { /* AgentEvent */ },
      "event_b": { /* AgentEvent */ },
      "diff": "SAME" | "OUTCOME_DIFFERS" | "EVENT_MISSING_A" | "EVENT_MISSING_B"
    }
  ]
}
```

---

## Error Envelope

All 4xx/5xx responses:
```json
{
  "detail": "Human-readable message",
  "error_code": "SCENARIO_NOT_FOUND | INVALID_POLICY_MODE | RATE_LIMIT | INTERNAL_ERROR | ...",
  "timestamp": "ISO 8601"
}
```

---

## TypeScript / Pydantic Sync Rule

`frontend/lib/types.ts` MUST be generated from or manually kept in sync with `backend/models.py`.
Any schema change requires updating both files in the same commit.


## Local frontend proxy and deployment notes (2026-11-12)
The Next server rewrites /api/* to API_ORIGIN (default http://127.0.0.1:8000); browser requests are same-origin. Set API_ORIGIN at Next build/config time to the reachable backend origin and use HTTPS at the public edge; hosting and streaming proxy behavior must be verified in the target environment. The backend default SQLite path is backend/agent_afterlife.db and must be writable and placed on persistent storage; local test used an isolated writable database. Independent instances with separate local SQLite files do not share runs; concurrent and distributed deployments require an explicit storage strategy. Restart persistence and target filesystem permissions have not been verified in deployment.
