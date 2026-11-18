# Requirements: Guided evidence explanations

Spec created 2026-11-18 by Kiro. Based on the independent verification in `C:\mysite\afterlife-independent-20261118`.
Earlier "tests passed" reports are reference only. A task here is done only when it was verified against the current source.

## Scope decision: new spec, old spec kept

`.kiro/specs/playground-experiments/` covers the Playground, mode labels and Gemini hardening. It stays unchanged.
This work crosses Time Machine, Evidence, Attack Lab, the audit event model and a Gemini contract change, so it gets its own spec.
It extends, and does not replace, the older requirements R1 to R4.

Baseline for comparing before and after: `C:\mysite\afterlife-expansion-stage-baseline-kiro` (copy of the stage before any edit, without `node_modules`).
The stage is not a Git work tree. Original repositories and other worktrees are not touched.
No commit, push or deploy.

## User goal

A judge or developer who runs a guided scenario defended and undefended can see:
1. where the two audit logs first differ,
2. which policy decision is the scenario's real point, and
3. the recorded reason for that decision,
and can do this on a 320 px phone with a keyboard.

## Current problems (found by independent verification, re-checked in code)

| ID | Problem | Where |
|---|---|---|
| P1 | Time Machine shows the first differing event but not tool, reason or policy. | `time-machine/page.tsx`, `/api/compare` |
| P2 | Scenario 01: first difference is `INJECTION_DETECTED` (defended only). The point of the scenario is `mock_data_exfiltrate`. Positional alignment is shifted by one event after that. | `scenarios/engine.py`, `/api/compare` |
| P3 | Scenario 02: fixture says the user-tier read is allowed. The defended policy allowlist is `mock_web_search`, `mock_read_file`, so `mock_read_config` is denied with `TOOL_NOT_IN_ALLOWLIST`. The first difference is therefore the read, and the real admin-write decision comes later. | `scenario_02.json`, `policy/engine.py` |
| P4 | Audit events do not record the trust level used for the decision, so `TRUST_LEVEL_INSUFFICIENT` cannot be explained from the record. | `models.AgentEvent` |
| P5 | Attack Lab run ID is plain text. No copy, no hand-off to Time Machine or Evidence. | `attack-lab/page.tsx` |
| P6 | Gemini: `observe()` reads the whole reply but the response carries only `output[:8192]`. Truncation is not shown. | `gemini_live.py` |
| P7 | Gemini: `live_configured()` opens the SQLite ledger before the access code is checked. | `gemini_live.py` |
| P8 | External-send consent exists only as a UI checkbox. Any client of the API can skip it. | `playground/page.tsx`, `LiveRequest` |
| P9 | Windows: `test_render_requires_the_ledger_on_a_separate_filesystem` replaces global `os.stat`, which breaks `Path.is_dir` (`AttributeError: 'S' object has no attribute 'st_mode'`). | `test_gemini_live.py` |
| P10 | API errors show `API /api/...: 400 {raw JSON}`. | `lib/api.ts` |
| P11 | Playground: a blank-input error leaves the previous result visible. | `playground/page.tsx` |
| P12 | `div aria-label` on the home flow and the graph container has no role, so the name is not exposed reliably. | `page.tsx`, `attack-lab/page.tsx` |
| P13 | At 320 and 375 px the graph (480 px tall) comes before the timeline and the report. Wide tables scroll with no visible hint. | Attack Lab, Time Machine, Evidence |

## Requirements

### R1 First difference and key decision (P1, P2, P3)
- R1.1 Time Machine shows two separate blocks: "First event difference" and "Key policy decision".
- R1.2 The key decision is the `TOOL_CALL_EXECUTED` or `TOOL_CALL_DENIED` event for the scenario's critical tool (`mock_data_exfiltrate`, `mock_config_write`), found by tool name and not by position.
- R1.3 Each side shows tool name, allow or deny, `policy_reason_code`, `policy_id`, sequence number and, when recorded, the trust level. Values come from audit events only.
- R1.4 When the first difference and the key decision are the same event pair, the page says so. Otherwise it says they differ and why (for example, scenario 01: the defended run adds `INJECTION_DETECTED`, which the undefended policy never emits).
- R1.5 The explanation of why the policies differ uses the recorded reason code and the documented rule for that code. Anything not recorded (for example the injection flags, or a trust level in an older run) is shown as "not recorded". Nothing is guessed.
- R1.6 Evidence shows the same key decision for the single run, next to the verdict.
- R1.7 The key decision is also visible in the Attack Lab report after a run.

### R2 Scenario 02 consistency (P3)
- R2.1 Fixture text, policy and tests agree. In defended mode the user-tier `mock_read_config` read is allowed and the admin-tier `mock_config_write` is denied with `TRUST_LEVEL_INSUFFICIENT`.
- R2.2 The decision and its security impact are written in `design.md`.

### R3 Optional trust level on events (P4)
- R3.1 `AgentEvent.actor_trust_level` is optional. Events stored before this change load unchanged.
- R3.2 It is set for tool-call events (proposed, executed, denied) and is absent on other events.
- R3.3 It is visible in the API, the timeline, Time Machine and Evidence.

### R4 Run ID hand-off (P5)
- R4.1 Attack Lab has a Copy run ID button with a visible result message. If the clipboard is unavailable the ID stays selectable and the message says so.
- R4.2 Links open Evidence for the run and Time Machine for a defended and undefended pair of the same scenario. Time Machine and Evidence accept the IDs in the query string and fill the inputs.

### R5 Gemini observation matches what is shown (P6)
- R5.1 The checked text equals the displayed text. If a reply is longer than 8,192 characters, the response says so (`output_truncated`, `output_chars_total`), the page shows a notice, and the observation states the range it covered.
- R5.2 The page keeps three things apart: the fixed text check, the model reply, and the policy view. A "not observed" result is never presented as a defense success.

### R6 Access code before ledger, server-side consent (P7, P8)
- R6.1 With a valid server configuration, a wrong or missing access code returns 403 before any ledger read, provider call or usage change.
- R6.2 The server requires `external_send_consent: true` in the request. Without it the call returns 400 `consent_required` before the ledger is opened or the provider is called. The UI sends it only when the checkbox is on.
- R6.3 No real key is read, printed or used. No real Gemini call. No live activation.

### R7 Windows test (P9)
- R7.1 The test no longer patches global `os.stat`. Product behavior is unchanged: on Render the ledger must be on a different device than the container root.

### R8 Errors, blank input, semantics, mobile (P10 to P13)
- R8.1 Error text for users names what happened and what to do. No internal URL, no raw JSON. The HTTP status number may appear.
- R8.2 A blank-input error clears the previous result and any previous error.
- R8.3 Named groups use a role that supports a name (`section`, `role="group"`).
- R8.4 At 320 and 375 px the reading order is: status and run ID, report with key decision, timeline, then graph. The graph is described as a visual summary. No page-level horizontal scroll.
- R8.5 A table that needs horizontal scroll shows a visible hint, and its scroll region is focusable with an accessible name.
- R8.6 Astryx selector and Hallmark styling are kept. No Astryx adoption history or design comparison document is added.

## Non-goals
Real Gemini calls, deployment, Vercel to Render path, a screen reader run, changes to the injection detector (flags are still fixture-driven).
