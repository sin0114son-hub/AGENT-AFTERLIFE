# Agent Afterlife — Test Strategy

## Principle
Tests are executed and evidence is recorded. No test is reported as passing without a command run and output captured.

---

## Test Layers

### Layer 1: Property-Based Tests (Backend — highest confidence)

Tool: `pytest` + `hypothesis`

Target: Policy engine invariants (see SECURITY_INVARIANTS.md)

```python
# Example: INV-02 — PolicyEngine is a pure function
@given(
    actor_trust=st.integers(min_value=0, max_value=3),
    tool_tier=st.sampled_from(["user", "admin", "system"]),
    policy_mode=st.sampled_from(["defended", "undefended"])
)
def test_policy_engine_pure(actor_trust, tool_tier, policy_mode):
    decision_1 = PolicyEngine.evaluate(actor_trust, tool_tier, policy_mode)
    decision_2 = PolicyEngine.evaluate(actor_trust, tool_tier, policy_mode)
    assert decision_1 == decision_2  # deterministic

# Example: INV-13 — trust_level=0 always DENY for admin tools
@given(tool_tier=st.sampled_from(["admin", "system"]))
def test_untrusted_always_denied(tool_tier):
    decision = PolicyEngine.evaluate(trust_level=0, tool_tier=tool_tier, policy_mode="defended")
    assert decision.outcome == "DENY"
```

### Layer 2: Unit Tests (Backend)

Tool: `pytest`

| Test ID | Description | Acceptance |
|---|---|---|
| T-U-01 | Scenario 1 undefended: `data_exfiltrate` ALLOWED | event.policy_outcome == "ALLOW" |
| T-U-02 | Scenario 1 defended: `data_exfiltrate` DENIED | event.policy_outcome == "DENY" |
| T-U-03 | Scenario 2 undefended: `config_write` SUCCESS | event.event_type == "TOOL_CALL_EXECUTED" |
| T-U-04 | Scenario 2 defended: `config_write` DENIED | event.event_type == "TOOL_CALL_DENIED" |
| T-U-05 | Events have monotonic sequence_number | No gaps, starts at 1 |
| T-U-06 | Event IDs are unique across two runs | set(ids) == len(ids) |
| T-U-07 | Pydantic model: AgentEvent validates correctly | No ValidationError on fixture events |
| T-U-08 | Evidence Report: verdict=DEFENDED for scenario 1 defended | report.verdict == "DEFENDED" |
| T-U-09 | Evidence Report: verdict=VULNERABLE for scenario 1 undefended | report.verdict == "VULNERABLE" |
| T-U-10 | Evidence Report: verdict=ERROR when run status=ERROR | report.verdict != "DEFENDED" |
| T-U-11 | Scenario fixture is read-only after two runs | fixture hash unchanged |
| T-U-12 | Mock tools: no subprocess call | grep returns 0 matches |

### Layer 3: Integration Tests (API)

Tool: `pytest` + `httpx` (async)

| Test ID | Endpoint | Acceptance |
|---|---|---|
| T-I-01 | GET /api/scenarios | 200, list of 2 scenarios |
| T-I-02 | POST /api/run (valid) | 200, SSE stream with RUN_COMPLETE |
| T-I-03 | POST /api/run (invalid scenario_id) | 404 |
| T-I-04 | POST /api/run (invalid policy_mode) | 422 |
| T-I-05 | GET /api/run/{run_id} | 200, correct status |
| T-I-06 | GET /api/run/{run_id}/events | 200, ordered events |
| T-I-07 | GET /api/report/{run_id} | 200, valid report JSON |
| T-I-08 | GET /api/compare (same scenario) | 200, first_divergence_sequence set |
| T-I-09 | GET /api/compare (different scenarios) | 400, clear error |
| T-I-10 | GET /api/run/nonexistent | 404 |

### Layer 4: Security Invariant Tests

Tool: `pytest`

For each invariant in SECURITY_INVARIANTS.md, one dedicated test:

| Invariant | Test |
|---|---|
| INV-08 | Run with ERROR status → report.verdict != "DEFENDED" |
| INV-09 | MockTool.__call__ → no subprocess, no I/O |
| INV-10 | DENY decision → mock tool execute() not called |
| INV-16 | git grep returns 0 real secrets |

### Layer 5: Frontend Unit Tests

Tool: `Vitest` + `@testing-library/react`

| Test ID | Description |
|---|---|
| T-F-01 | Homepage renders without console errors |
| T-F-02 | Run button disabled during active run |
| T-F-03 | Reset clears event stream |
| T-F-04 | EventStream renders correct icon per event_type |
| T-F-05 | Time Machine: divergence marker appears at correct step |
| T-F-06 | Evidence Report: ERROR verdict shows warning, not "DEFENDED" |

### Layer 6: Accessibility Tests (Manual)

| Test ID | Method | Acceptance |
|---|---|---|
| T-A-01 | Tab through Lab page | All controls reachable |
| T-A-02 | prefers-reduced-motion: reduce | All animations absent |
| T-A-03 | Screen reader on event row | Outcome announced correctly |
| T-A-04 | Keyboard-only: complete a full scenario run | Possible without mouse |

---

## Test Execution Order

1. Backend unit tests (fastest, no server)
2. Backend property-based tests
3. Security invariant tests (includes git grep)
4. API integration tests (requires running backend)
5. Frontend unit tests
6. Manual accessibility tests (last, human-only)

---

## Coverage Definition

Coverage is defined over attack categories and policy invariants, not line count alone:

| Category | Required coverage |
|---|---|
| AT-01 (Prompt Injection) | Defended + Undefended unit tests |
| AT-02 (Trust Escalation) | Defended + Undefended unit tests |
| AT-08 (Resource Exhaustion) | Timeout integration test |
| All INV-* invariants | One test each |
| All Edge Cases T-E-* | One test each (or manual note) |

**Coverage ≠ security guarantee.** State this in the README.

---

## Recording Evidence

For every executed test:

```
Test ID: T-U-02
Command: cd C:\AgentAfterlife\backend && python -m pytest tests/test_policy.py::test_scenario1_defended -v
Output:  tests/test_policy.py::test_scenario1_defended PASSED
Date:    2026-11-11
Status:  EXECUTED — PASS
```

Update TEST_BASELINE.md with each result.
