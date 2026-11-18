# Agent Afterlife — Changelog

## [Guided evidence explanations] 2026-11-18 (not committed)

See `.kiro/specs/guided-evidence-explanations/`.
- Time Machine, Evidence and Attack Lab show the first event difference and the key policy decision separately, from audit events.
- `AgentEvent.actor_trust_level` (optional; older stored events still load). `/api/compare` and `/api/report` add `critical_tool` and key decision fields.
- Defended policy allowlist includes `mock_read_config`, so scenario 02 matches its fixture text.
- Gemini: observation runs on the displayed text; truncation is reported; access code is checked before the ledger is opened; server requires `external_send_consent`.
- Attack Lab: copy run ID, Evidence and Compare links, result-first reading order. Tables show a scroll hint. API errors no longer show URLs or raw JSON. Playground clears the old result on blank input.
## [Phase 2A] 2026-11-12 — Backend Foundation COMPLETE_VERIFIED

### Added
- `backend/models.py` — Pydantic models: RunRequest, AgentEvent, ToolCallRequest, PolicyContext, PolicyDecision, ScenarioDefinition, SecurityOutcome (271 lines)
- `backend/policy/engine.py` — Pure function policy engine: evaluate(), PolicyConfig, POLICY_DEFENDED, POLICY_UNDEFENDED, ReasonCode (220 lines)
- `backend/scenarios/fixtures/scenario_01.json` — AT-01 Indirect Prompt Injection scenario fixture
- `backend/scenarios/fixtures/scenario_02.json` — AT-02 Trust Boundary Escalation scenario fixture
- `backend/tests/test_policy.py` — 27 unit tests covering T-U-01..04 + INV-02, INV-08, INV-13
- `backend/requirements.txt` — minimal dependency set
- `pytest.ini` — test runner configuration
- `.venv/` — project-local Python virtual environment (not committed)

### Test Results
- Command: `.venv\Scripts\python.exe -m pytest backend/tests/test_policy.py -v`
- Result: **27 passed, 0 failed** in 0.40s
- Python: 3.14.5 / pytest: 8.3.5

### Security Invariants Verified
- INV-02: PolicyEngine.evaluate() is deterministic (pure function)
- INV-08: ERROR/TIMEOUT outcome cannot produce DEFENDED verdict (Pydantic validator)
- INV-13: trust_level=0 → DENY for any tool, any tier

## [Unreleased]

### 2026-11-11 — Phase 1 Deep Architecture Review (STAGE A+B)
- Critical findings F-01..F-10 identified and resolved
- docs/PRD.md corrected (determinism language, Mode A/B added)
- docs/ATTACK_TAXONOMY.md created (AT-01..AT-10, OWASP LLM 2025 mapped)
- docs/DEFENSE_ARCHITECTURE.md created (7 layers, 9 outcome types, INV-01..16)
- docs/ARCHITECTURE.md created (full directory structure, data flow, SQLite schema)
- docs/API_CONTRACT.md created (all endpoints, SSE schema, TypeScript types)
- docs/UX_SPEC.md created (design tokens, all screens, accessibility)
- docs/SECURITY_INVARIANTS.md created (16 invariants, property-based test targets)
- docs/TIME_MACHINE_SPEC.md created (alignment algorithm, causal explanation)
- docs/EDGE_CASES.md created (39 edge cases)
- docs/TEST_STRATEGY.md created (6 test layers)
- docs/INNOVATION_REVIEW.md created (competitor analysis, 3 differentiators)
- docs/KIRO_USAGE.md created (operations log)

## 2026-11-12 Phase 2B work (incomplete)

Added guided registry and policy-driven synthetic execution, SQLite append-only event storage, FastAPI SSE and lookup/report/compare endpoints, and integration/property tests. Preserved existing policy and fixtures. The defended allowlist conflicts with the scenario 02 description; existing policy remains authoritative. Specific endpoint error examples take precedence over the general error envelope. Events commit before SSE per INV-04. Verified 45 passing tests with a separate Python 3.12 environment; original `.venv` is broken. Actual timeout and disconnect handling remain outstanding, so Phase 2B is not marked verified.


## 2026-11-12 Phase 3 integration (Codex)
- Connected existing frontend to API scenario envelope, policy_mode, SSE event IDs, server status, stored events, report failures, and same-origin Next rewrite.
- Added SSE/API regression tests and narrow Attack Lab navigation handling. Remaining verification and deployment limitations are in PROJECT_STATE.md and NEXT_TASK.md.
