# Agent Afterlife — Product Requirements Document

## Overview

**Product Name:** Agent Afterlife  
**Category:** Frankenstein (Kiroween 2026)  
**Tagline:** An interactive AI agent security laboratory — watch agents get compromised, see defenses hold.  
**Deadline:** December 4, 2026, 14:00 PST  

---

## Problem Statement

AI agents operate with tool access and elevated trust. Prompt injection, trust-boundary violations, and policy bypasses are real but invisible to most developers. Agent Afterlife makes these attacks tangible and reproducible.

---

## Execution Modes

### Mode A — Guided Simulation (P0)
Deterministic scenarios using scripted fixture data and mock tools.
Agent behavior is controlled by the scenario fixture — NOT by a real LLM.
"Without defense" means the fixture explicitly selects the vulnerable path.
"With defense" means the policy engine blocks the action before mock tool execution.
No fabricated security evidence. Outcomes are verifiable from the event log.

### Mode B — Live Attack Playground (P1)
Real LLM invocation with user-supplied prompt.
Policy engine runs independently server-side — LLM is never the sole authority.
Rate-limited: max 5 runs per session per 10 minutes; max 10 tool calls per run; 30s timeout.
Nondeterminism is disclosed in the UI.
Requires API key configuration — disabled if key absent.

---

## Product Experiences (MVP)

### A. Immersive Homepage
- Full-screen animated landing page
- Halloween / Frankenstein aesthetic (dark, electric, eerie)
- Clear entry point to the Attack Lab
- Brief "what is this?" context — one sentence per concept
- Keyboard accessible, reduced-motion support

### B. Attack Lab
- Split-screen: left = attack scenario, right = live execution trace
- Interactive node graph (React Flow) showing agent → tool → policy flow
- Two deterministic scenarios (see Scenarios below)
- Run / Reset / Pause controls
- Real-time event stream with timestamps and actor labels
- Color-coded outcomes: ALLOWED (green), BLOCKED (red), FLAGGED (yellow)

### C. Time Machine
- Side-by-side "Before Defense" vs "After Defense" replay
- Synchronized step-by-step playback
- Each step: event name, actor, tool called, policy result, evidence string
- Scrubber to jump to any step
- Diff highlight: what changed between the two runs

### D. Evidence Report
- Auto-generated summary after each lab run
- Counts: total events, blocked calls, allowed calls, policy violations caught
- Per-event table with stable IDs
- Exportable as JSON
- Clear pass/fail verdict per scenario

---

## Scenarios (MVP — 2 deterministic)

### Scenario 1: Indirect Prompt Injection via Tool Output
**Setup:** A research agent calls a web-search mock tool. The mock returns a poisoned result containing an injected instruction.

**Mode A behavior (deterministic):**
- The scenario fixture defines two execution paths: `vulnerable` and `defended`.
- Vulnerable path: fixture step 4 selects `data_exfiltrate` as the next action — simulating an agent that followed the injection.
- Defended path: policy engine intercepts at step 4, evaluates trust level of the tool output source (trust_level=0), returns DENY before the action executes.

**Evidence criterion:** `data_exfiltrate` appears as `TOOL_CALL_EXECUTED` in undefended trace; appears as `TOOL_CALL_DENIED` with `policy_reason_code=TRUST_CHECK_FAILED` in defended trace.

**Attack taxonomy ref:** AT-01

---

### Scenario 2: Trust Boundary Escalation
**Setup:** A low-trust user agent requests access to an admin-only `config_write` tool.

**Without defense:** No trust check → `config_write` executes → config mutated.  
**With defense:** Trust-level policy denies call → `UNAUTHORIZED_TOOL_CALL` event logged → config unchanged.

**Attack taxonomy ref:** AT-02

---

## Out of Scope (MVP)
- Real network calls or external targets
- Real credentials anywhere in the codebase
- LLM API calls (all agent behavior is deterministic/scripted)
- Multi-user sessions
- Persistent user accounts

---

## Success Criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | Homepage loads in <2s on cold start | Measured in browser dev tools |
| 2 | Scenario 1 produces different traces (defended vs undefended) | Automated test on event log |
| 3 | Scenario 2 produces DENIED event in defended mode | Automated test on event log |
| 4 | All UI controls reachable by keyboard | Manual accessibility check |
| 5 | Evidence Report exports valid JSON | Automated schema test |
| 6 | No real credentials in repo | `git grep` scan |
| 7 | App loads after browser hard-refresh | Manual test |
| 8 | Reduced-motion CSS respected | Manual test with prefers-reduced-motion |

---

## Team
- 2 human contributors
- Kiro AI orchestrator

## Repository
- GitHub: TBD (create before Phase 3)
- License: MIT
