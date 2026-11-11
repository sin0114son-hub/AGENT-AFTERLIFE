# Agent Afterlife — Project State

## Status
Phase: 2B COMPLETE_VERIFIED
Last Updated: 2026-11-12

## Completed
- [x] Phase 0: Environment Audit — CLEARED
- [x] Phase 1: PRD v1 — docs/PRD.md
- [x] Phase 1 HARDENED: Deep architecture + security review (all 13 docs)
- [x] Phase 2A: Backend foundation — COMPLETE_VERIFIED
  - [x] backend/models.py — Pydantic models (RunRequest, AgentEvent, ToolCallRequest, PolicyContext, PolicyDecision, ScenarioDefinition, SecurityOutcome)
  - [x] backend/policy/engine.py — pure function policy engine, deny-by-default
  - [x] backend/scenarios/fixtures/scenario_01.json — AT-01 indirect prompt injection
  - [x] backend/scenarios/fixtures/scenario_02.json — AT-02 trust escalation
  - [x] backend/tests/test_policy.py — 27 tests, all PASS
  - [x] backend/requirements.txt
  - [x] pytest.ini
  - [x] .venv (project-local, not global)
- [x] Phase 2B: Scenario engine + FastAPI routes + SQLite audit logger — COMPLETE_VERIFIED (2026-11-12)
  - [x] backend/scenarios/engine.py — elapsed-time timeout (time.monotonic, DEFAULT=30s, MAX=300s)
  - [x] backend/scenarios/registry.py
  - [x] backend/audit/__init__.py — append-only SQLite with DB triggers
  - [x] backend/main.py — SSE stream, GeneratorExit→CANCELLED, 6 API routes
  - [x] backend/tests/test_api.py, test_audit.py, test_scenarios.py, test_timeout_and_disconnect.py
  - [x] .venv restored (httpx2 + hypothesis); 56/56 tests pass on .venv\Scripts\python.exe

## Active
- [ ] Phase 3: Next.js + TypeScript frontend scaffold

## Blockers
- None

## Critical Findings Resolved
- F-01: Defense redesigned from pattern-match to structural trust-level check
- F-02: Deterministic engine behavior clarified — fixture controls path selection
- F-03: Time Machine alignment algorithm defined
- F-04: 9 outcome types defined in DEFENSE_ARCHITECTURE.md
- F-05: Competitor analysis in INNOVATION_REVIEW.md; 3 differentiators identified
- F-06: Mode A/B execution modes defined in PRD.md

## Environment (verified)
- Node.js v24.21.0
- npm 11.19.0 (cmd /c npm required)
- Python 3.14.5 (FastAPI 0.136.1, Pydantic 2.13.4, Uvicorn 0.47.0 pre-installed)
- Git 2.55.0 + GCM 2.9.1
- Docker 29.9.3
- gh CLI: NOT INSTALLED (Phase 7)
- PowerShell npm: blocked — use `cmd /c npm` workaround

## Known Limitations
- Host memory critically low — no large parallel spawns
- gh CLI not installed
- Mode B (Live Playground) is P1 — may be excluded if deadline at risk

## P0 / P1 / P2 Summary
P0: Deterministic sim, 2 scenarios, policy engine, event log, Attack Lab, Time Machine, tests, demo
P1: Live LLM playground, real API calls, dynamic tracing, rate limits
P2: Advanced mutation engine, multi-agent sim, memory poisoning lab

## 2026-11-12 Phase 2B implementation and verification

Status: PHASE_2B_INCOMPLETE. Guided fixture execution, SQLite audit, SSE and six API routes are implemented. Original Phase 2A policy remains unchanged. The two fixtures and both modes were exercised; 45 tests passed using `.venv-phase2b` Python 3.12.14. The requested `.venv` command cannot run because its Python 3.14 executable is missing. Real elapsed-time timeout and client disconnect handling have not been implemented or verified. Git is unavailable in this directory because it is not a repository.

The defended policy excludes `mock_read_config` from its allowlist despite scenario 02 describing it as permitted; the engine follows the existing policy. Specific API examples are used for 404/422 instead of the conflicting generic error envelope. Comparison requires complete runs, different policy modes, and the same fixture hash as the Time Machine specification requires. Fixture steps describing a decision or execution are annotations; proposals are evaluated once and the actual decision determines the emitted result. Architecture's SSE-before-write ordering conflicts with INV-04; persistence and commit precede emission.
