# Agent Afterlife — Next Task

## ✅ Phase 2B COMPLETE_VERIFIED (2026-11-12, 56/56 tests)

- engine.py: `time.monotonic()` timeout, DEFAULT=30s, MAX=300s
- main.py: `GeneratorExit` → CANCELLED; CANCELLED verdict → ERROR
- `.venv` restored: httpx2 + hypothesis installed
- Verified command: `.venv\Scripts\python.exe -m pytest backend/tests/ -v`

## Current: Phase 3 — Next.js Frontend

1. Scaffold: `cmd /c "npx create-next-app@latest frontend --typescript --tailwind --app --no-git"`
2. React Flow: `cmd /c "cd frontend && npm install @xyflow/react"`
3. Pages: homepage, /attack-lab, /time-machine, /evidence-report
4. API client for: GET /api/scenarios, POST /api/run (SSE), GET /api/report/{id}, GET /api/compare

Verification: `cmd /c "cd frontend && npm run build"` exits 0.

---

### Phase 2B Tasks (순서대로)

1. **backend/scenarios/engine.py**
   - ScenarioEngine class: loads fixture, iterates steps, calls PolicyEngine.evaluate()
   - Emits AgentEvent objects in sequence
   - Respects RuntimeLimits (max_tool_calls, timeout)
   - Mode A only (guided)

2. **backend/scenarios/registry.py**
   - Loads scenario_01.json, scenario_02.json at startup
   - Validates with ScenarioDefinition Pydantic model
   - Provides get_scenario(scenario_id) → ScenarioDefinition

3. **backend/audit/db.py + logger.py**
   - SQLite schema creation (runs + events tables)
   - Append-only write (INV-04, INV-07)
   - Sequence number generation (INV-05)

4. **backend/main.py** (FastAPI app entry)
   - GET /api/scenarios
   - POST /api/run (SSE stream)
   - GET /api/run/{run_id}
   - GET /api/run/{run_id}/events
   - GET /api/report/{run_id}
   - GET /api/compare

5. **backend/tests/test_scenarios.py**
   - T-I-01: GET /scenarios → 2 results
   - T-I-02: POST /run → SSE events
   - T-I-03: POST /run invalid id → 404
   - T-I-04: GET /report/{run_id} → valid JSON

### Verification command
```
.venv\Scripts\python.exe -m pytest backend/tests/ -v
```

### Acceptance gate for Phase 2B
- [ ] All scenario engine tests pass
- [ ] API integration tests T-I-01..T-I-04 pass
- [ ] Audit log written to agent_afterlife.db (verified with sqlite3 query)
- [ ] INV-04 verified: event in DB before SSE emit
- [ ] INV-05 verified: sequence_numbers 1..N no gaps

## 2026-11-12 remaining Phase 2B work

Restore or replace the broken original `.venv` with appropriate user authorization and rerun the exact required command. Implement and verify actual elapsed-time timeout and SSE disconnect cancellation. Review the documented `mock_read_config` allowlist disagreement before changing policy. Verify production deployment and OS-level isolation separately if later requested; they are outside this phase.


## Next priority: Phase 3 verification
Verify actual ASGI stream disconnect/cancellation and its persisted status (the existing disconnect test reconstructs a separate generator). Exercise cancellation, loading and error states in a browser, including report failures, and validate other pages on narrow screens. Decide scenario 02 read-config intent before changing policy. Confirm hosting, persistent SQLite storage, API_ORIGIN and HTTPS before deployment.
