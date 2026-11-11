# Agent Afterlife — Security Invariants

These invariants MUST hold in every run, in every mode, forever.
Any test that finds a violation is a critical failure.

---

## Invariant Group 1: Policy Engine Independence

**INV-01** The policy engine runs server-side. The frontend NEVER makes allow/deny decisions.

**INV-02** PolicyEngine.evaluate() is a pure function. Same inputs always produce same output. No external I/O, no randomness, no database access inside the function.

**INV-03** The LLM (Mode B) is NEVER the sole authority for allowing a tool call. PolicyEngine.evaluate() runs independently before every tool dispatch.

---

## Invariant Group 2: Audit Log Integrity

**INV-04** Events are written to SQLite before they are emitted via SSE. A client receiving an event MUST mean the event is persisted.

**INV-05** `sequence_number` is monotonically increasing within a `run_id` with no gaps.

**INV-06** `event_id` is globally unique across all runs.

**INV-07** The audit log is append-only during a run. No event is modified or deleted after insertion.

**INV-08** A run with status `ERROR` or `TIMEOUT` MUST NOT have a `verdict` of `DEFENDED`.

---

## Invariant Group 3: Mock Tool Isolation

**INV-09** Mock tools MUST NOT perform real I/O: no subprocess, no network calls, no real file writes.

**INV-10** A mock tool call that is DENIED by the policy engine MUST NOT execute. No side effects, no fixture mutation.

**INV-11** `tool_args_hash` in audit events is sha256 of the serialized arguments. Raw arguments are NOT stored in the audit log.

---

## Invariant Group 4: Trust Level

**INV-12** Trust level is assigned server-side at context ingestion. Clients cannot override trust level assignments.

**INV-13** A `trust_level=0` (untrusted) source MUST NOT produce a `ALLOW` policy outcome for any admin-tier tool.

---

## Invariant Group 5: Determinism (Mode A)

**INV-14** Two guided runs with the same `scenario_id` and `policy_mode` MUST produce event sequences with identical `event_type` values in the same order.

**INV-15** A scenario fixture is never modified at runtime. Fixtures are read-only after server startup.

---

## Invariant Group 6: No Real Credentials

**INV-16** The repository MUST contain zero real passwords, API keys, tokens, or secrets.
Verification: `git grep -r "password\|api_key\|secret\|token" -- "*.py" "*.ts" "*.json"` returns only test fixture placeholder strings.

---

## Property-Based Test Targets

These invariants are suitable for hypothesis/property-based testing:

| Invariant | Test approach |
|---|---|
| INV-02 | Arbitrary (actor, tool, policy) inputs → function returns valid PolicyDecision |
| INV-05 | Generate N events for a run → sequence_numbers are 1..N with no gaps |
| INV-06 | Generate M runs × N events → all event_ids are unique |
| INV-14 | Run same scenario twice → event_type sequences are equal |
| INV-13 | Any tool call from trust_level=0 → outcome is DENY |
