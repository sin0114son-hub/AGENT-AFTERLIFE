# Agent Afterlife — Test Baseline

## Status: Phase 2A — T-U-01 through T-U-04 EXECUTED AND PASSED

---

## Planned Tests

### Unit Tests (Backend)
| ID | Test | Status |
|---|---|---|
| T-U-01 | Policy engine: T-1 undefended → `data_exfiltrate` ALLOWED | ✅ PASS |
| T-U-02 | Policy engine: T-1 defended → `data_exfiltrate` BLOCKED | ✅ PASS |
| T-U-03 | Policy engine: T-2 undefended → `config_write` SUCCESS | ✅ PASS |
| T-U-04 | Policy engine: T-2 defended → `config_write` DENIED | ✅ PASS |
| T-U-05 | Audit log: events have stable IDs and timestamps | PLANNED |
| T-U-06 | Schema validation: event shape matches Pydantic model | ✅ PASS (AgentEvent hash tests) |
| T-U-07 | Evidence Report: exports valid JSON | PLANNED |

### Integration Tests (API)
| ID | Test | Status |
|---|---|---|
| T-I-01 | GET /scenarios returns list of 2 scenarios | PLANNED |
| T-I-02 | POST /run/{scenario_id} returns event stream | PLANNED |
| T-I-03 | POST /run with invalid scenario_id returns 404 | PLANNED |
| T-I-04 | GET /report/{run_id} returns valid report JSON | PLANNED |

### Frontend Tests
| ID | Test | Status |
|---|---|---|
| T-F-01 | Homepage renders without JS errors | PLANNED |
| T-F-02 | Attack Lab: Run button triggers event stream | PLANNED |
| T-F-03 | Time Machine: before/after renders both runs | PLANNED |
| T-F-04 | Browser hard-refresh preserves last run state | PLANNED |

### Acceptance Tests (Manual)
| ID | Test | Status |
|---|---|---|
| T-A-01 | All UI controls reachable by keyboard tab | PLANNED |
| T-A-02 | Reduced-motion: animations stop | PLANNED |
| T-A-03 | No real secrets in git history | PLANNED |
| T-A-04 | App loads in <2s (cold start) | PLANNED |

---

## Executed Tests

| Date | Command | Total | Passed | Failed | Notes |
|---|---|---|---|---|---|
| 2026-11-12 | `.venv\Scripts\python.exe -m pytest backend/tests/test_policy.py -v` | 27 | 27 | 0 | T-U-01~04 + INV-02, INV-08, INV-13, schema tests |

### Evidence (2026-11-12)
```
27 passed in 0.40s
platform win32 -- Python 3.14.5, pytest-8.3.5
```
Invariants verified in this run: INV-02 (determinism), INV-08 (error≠defended), INV-13 (untrusted→DENY), tool_args_hash SHA-256 stability.

## 2026-11-12 observed results

- `.venv\Scripts\python.exe -m pytest backend/tests/ -v`: failed before collection; referenced Python 3.14 executable no longer exists.
- `.venv-phase2b\Scripts\python.exe -m pytest backend/tests/ -v` before changes: 27 collected, 27 passed.
- Same command after changes: 45 collected, 45 passed, 0 failed; warnings: pytest cache access denied (2), Starlette TestClient deprecation (1).
- Registry cycle: missing module failed, implementation then 28 passed. Scenario cycle: missing engine failed, implementation then 32 passed. Audit cycle: missing logger failed, implementation then 33 passed. API cycle: missing app failed, implementation then 34 passed. Event limit cycle: 120 events violated cap, fix then 40 passed. Error event cycle: missing RUN_ERROR failed, fix then 41 passed. Cross-run INSERT OR REPLACE vulnerability reproduced, trigger added, then 43 passed. Final security and report tests brought total to 45.
- Tests use isolated temporary SQLite files. Forced append failure stops SSE before the failing event; concurrent runs and generated sequence lengths were exercised. Actual elapsed-time timeout and client disconnect cancellation remain unverified.
