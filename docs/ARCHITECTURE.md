# Agent Afterlife — System Architecture

## Overview

```
Browser (Next.js 15)
  │
  │  HTTP + SSE
  ▼
FastAPI (Python 3.14)
  ├── Scenario Engine (deterministic / Mode A)
  ├── Policy Engine (pure function, server-side)
  ├── Mock Tool Registry
  ├── Audit Logger (SQLite)
  └── [Mode B] LLM Adapter (optional, rate-limited)
```

---

## Directory Structure

```
C:\AgentAfterlife\
├── frontend/                   # Next.js 15 App Router
│   ├── app/
│   │   ├── page.tsx            # Immersive Homepage
│   │   ├── lab/page.tsx        # Attack Lab
│   │   ├── time-machine/page.tsx
│   │   └── report/[runId]/page.tsx
│   ├── components/
│   │   ├── AgentGraph.tsx      # React Flow node graph
│   │   ├── EventStream.tsx     # Live event list
│   │   ├── TimeMachineViewer.tsx
│   │   └── EvidenceReport.tsx
│   ├── lib/
│   │   ├── api.ts              # Typed API client
│   │   └── types.ts            # Shared TypeScript types (mirror of Pydantic)
│   └── public/
├── backend/
│   ├── main.py                 # FastAPI app entry
│   ├── scenarios/
│   │   ├── registry.py         # Scenario loader
│   │   ├── engine.py           # Deterministic execution engine
│   │   └── fixtures/
│   │       ├── scenario_01.json
│   │       └── scenario_02.json
│   ├── policy/
│   │   ├── engine.py           # Pure policy function
│   │   ├── policy_undefended.json
│   │   └── policy_defended.json
│   ├── tools/
│   │   ├── registry.py         # Mock tool registry
│   │   ├── mock_web_search.py
│   │   ├── mock_data_exfiltrate.py
│   │   └── mock_config_write.py
│   ├── audit/
│   │   ├── logger.py           # Append-only audit log
│   │   └── db.py               # SQLite connection
│   ├── api/
│   │   ├── routes_scenarios.py
│   │   ├── routes_run.py
│   │   └── routes_report.py
│   ├── models.py               # Pydantic models (source of truth for schema)
│   └── tests/
│       ├── test_policy.py
│       ├── test_scenarios.py
│       └── test_api.py
├── docs/
├── PROJECT_STATE.md
├── NEXT_TASK.md
├── DECISIONS.md
├── TEST_BASELINE.md
├── CHANGELOG.md
└── .kiro/
    └── steering/
```

---

## Data Flow: Mode A (Guided Simulation)

```
1. User selects scenario + policy_mode (defended | undefended)
2. POST /api/run  →  RunRequest { scenario_id, policy_mode }
3. Backend creates run_id, loads scenario fixture
4. ScenarioEngine iterates fixture steps:
   For each step:
     a. Emit TOOL_CALL_PROPOSED event (SSE)
     b. PolicyEngine.evaluate(actor, tool_call, context, policy)
     c. Emit policy outcome event (SSE)
     d. If ALLOW: MockTool.execute() → emit TOOL_CALL_EXECUTED
     e. If DENY: emit TOOL_CALL_DENIED
     f. Write event to SQLite audit log
5. Emit RUN_COMPLETE event (SSE)
6. Frontend renders node graph + event stream in real time
```

---

## Data Flow: Mode B (Live Playground) — P1

```
1. User enters custom prompt
2. POST /api/run/live  →  LiveRunRequest { prompt, scenario_template, policy_mode }
3. Backend validates: input size ≤ 4096 bytes, rate limit not exceeded
4. LLMAdapter calls configured provider (OpenAI-compatible)
   - Tool schema injected: mock tools only
   - System prompt: scenario template
5. For each LLM tool call proposal:
   - PolicyEngine.evaluate() runs BEFORE forwarding to mock tool
   - Emit events same as Mode A
6. Max 10 tool calls, 30s timeout enforced server-side
7. All events recorded with model_id, prompt_hash, timestamp
```

---

## API Boundary Rules

- Frontend NEVER calls mock tools directly
- Policy engine runs ONLY on the backend
- Frontend renders events; it does NOT make security decisions
- SSE stream is one-way: backend → frontend
- No WebSocket for MVP (SSE is sufficient and simpler)

---

## State Machine: Run Lifecycle

```
CREATED → RUNNING → COMPLETE
                  → ERROR
                  → TIMEOUT
                  → CANCELLED
```

A run in ERROR or TIMEOUT state is never reported as a successful defense.

---

## Persistence

SQLite schema (single file: `backend/agent_afterlife.db`):

```sql
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  policy_mode TEXT NOT NULL,  -- 'defended' | 'undefended'
  mode TEXT NOT NULL,          -- 'guided' | 'live'
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  model_id TEXT,               -- Mode B only
  prompt_hash TEXT             -- Mode B only, sha256 of input
);

CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT,
  tool_name TEXT,
  tool_args_hash TEXT,
  policy_outcome TEXT,
  policy_reason_code TEXT,
  content_provenance TEXT,
  mock_result TEXT,  -- JSON string
  error TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(run_id)
);

CREATE UNIQUE INDEX idx_events_run_seq ON events(run_id, sequence_number);
```

---

## Technology Decisions (Confirmed)

| Component | Choice | Verified available |
|---|---|---|
| Frontend framework | Next.js 15 (App Router) | npx create-next-app@16.4.6 ✅ |
| Node.js | v24.21.0 | ✅ |
| Backend framework | FastAPI 0.136.1 | pip installed ✅ |
| Backend runtime | Python 3.14.5 + Uvicorn 0.47.0 | ✅ |
| Node graph | React Flow (@xyflow/react) | npm installable ✅ |
| Persistence | SQLite (stdlib) | ✅ |
| Styling | Tailwind CSS v4 | npm installable ✅ |
| Testing (backend) | pytest + hypothesis | pip installable |
| Testing (frontend) | Vitest | npm installable |

---

## Windows-Specific Notes

- All `npm` commands via `cmd /c npm ...` (PowerShell execution policy blocks npm.ps1)
- Path separators in fixtures: use forward slashes in JSON
- Dev server ports: frontend=3000, backend=8000, both on localhost only
- CORS: backend allows `http://localhost:3000` only
