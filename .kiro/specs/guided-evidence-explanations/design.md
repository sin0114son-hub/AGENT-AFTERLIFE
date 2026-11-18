# Design: Guided evidence explanations

## Decisions

### D1 Scenario 02: change the policy, not the fixture text
Options:
- A. Edit the fixture so it says the read is denied. Rejected: the scenario's `legitimate_objective` is "Read current system configuration summary". A defense that blocks the legitimate task teaches the wrong lesson and makes the first difference look like the attack.
- B. Add `mock_read_config` to `POLICY_DEFENDED.allowed_tools`. Chosen.

Security impact of B:
- `mock_read_config` is user tier and returns public fixture data. It is not an admin tool, so Gate 4 is unchanged.
- Gate 2 still denies it for trust 0. Gate 1 still denies it when injection flags are present.
- `mock_data_exfiltrate` and `mock_config_write` are not added to `allowed_tools`; they are still reachable only through `admin_tools` and Gate 4 (trust at least 2).
- Scenario 01 never uses `mock_read_config`. The Playground simulator (`ACTION_TIERS`) does not offer it. Gemini `policy_comparison` is unchanged.
- Tests pin the full allowlist, so adding another tool later fails a test.

Result for scenario 02 defended: seq 2 `TOOL_CALL_EXECUTED mock_read_config ALLOW PERMITTED_USER_TOOL`, seq 4 `TOOL_CALL_DENIED mock_config_write DENY TRUST_LEVEL_INSUFFICIENT`. The first event difference is now seq 4 and equals the key decision.

### D2 Compare gets a key decision, found by tool name
Positional alignment stays (existing contract, first-difference semantics unchanged). Scenario 01 shows why position is not enough: the defended log has an extra `INJECTION_DETECTED`, so every later row is shifted.
`/api/compare` and `/api/report` add fields. Existing fields are untouched.
- `critical_tool` (from one server-side map shared by report and compare).
- compare: `key_decision_a`, `key_decision_b`: the first `TOOL_CALL_EXECUTED` or `TOOL_CALL_DENIED` event of that tool, or `null`.
- report: `critical_tool`, `key_decision`: same rule for one run.
The frontend turns events into text. The server does not create explanation prose, so every sentence traces to an event field or to a documented rule.

### D3 Optional `actor_trust_level` on events
Needed: `TRUST_LEVEL_INSUFFICIENT` ("admin tool needs trust 2 or more") cannot be shown against the trust that was used unless it is recorded. Scenario 02 uses trust 1.
- Model: `actor_trust_level: int | None = Field(None, ge=0, le=3)`. Default `None`.
- Generation: `engine.py` sets it from `step.actor_trust_level` on tool-call events only. `_make_limit_event` resets it. `INJECTION_DETECTED` does not carry it (the step value 3 describes the system actor and would mislead).
- Storage: events are stored as JSON text (`model_dump_json`). No schema migration. Old rows lack the key and load as `None`. New rows hold the key. Pydantic ignores unknown keys, so an older reader also loads new rows.
- Reading: `/api/run/{id}/events`, report, compare return the field (`null` for old events).
- Compare equality (`SAME` or `OUTCOME_DIFFERS`) ignores it, so old and new runs compare as before.
- UI: shown when not null. Otherwise "trust level not recorded".
- Not added: `evidence_ref` and injection flags. The explanation for `INJECTION_FLAGGED` therefore says the flags were not stored in the event.

### D4 Explanation text lives in one tested module
`frontend/app/lib/explain.ts` holds: reason glossary (one sentence per code, taken from `policy/engine.py` gates), policy glossary (`policy_undefended_v1`, `policy_defended_v1`), `describeEvent`, and `explainKeyDecision(a, b)`. It has no React imports, so Node tests run it directly. Unknown codes fall back to "code only, no description".

### D5 Gemini: observe what is shown
Option A (chosen): truncate once, then observe the same string. `shown = output[:8192]`. Response adds `output_truncated`, `output_chars_total`, and `observation.scope = {chars_checked, chars_total, truncated}`. Summary text mentions the unchecked remainder when truncated.
Option B (rejected): observe the full text and show a shortened one. The user could not verify a match found in hidden text.
Status values stay `observed` and `not_observed`. A truncated `not_observed` states that the rest was not checked.
Three labelled groups in the UI: 1 model reply (untrusted), 2 fixed text checks, 3 policy view (policy engine on proposed names; nothing run).

### D6 Order of checks in `evaluate_live`
1. Static configuration (env values and path syntax, no database): else 503 `not_configured`.
2. Access code (`hmac.compare_digest`): else 403 `access_denied`.
3. Consent flag: else 400 `consent_required`.
4. Storage readiness (Render device check, read-only ledger probe): else 503 `not_configured`.
5. Reserve, call, release (unchanged).
`live_configured()` (used by `/status`) = 1 and 4, so its public meaning is unchanged.

### D7 Server-side consent
Chosen: required. The checkbox in the UI is a user control only. The proxy forwards any JSON, so a direct API client could send text to Google without the acknowledgment. The flag is a request field (`external_send_consent`), checked server-side, not stored. It is an acknowledgment, not a legal record.
Callers changed: `playground/page.tsx` sends it; test helper `post()` sends it by default; `describeLiveFailure` and docs list the new code.
It is checked after the access code so an unauthenticated caller learns nothing about the consent rule.

### D8 Windows test
`_ephemeral_render_disk` calls a new helper `_device_id(path)`. The test patches that helper. Behavior is identical in production (`os.stat(path).st_dev`). The test still proves both outcomes (same device: not configured, different device: configured).

### D9 UI structure
- Shared `ScrollTable` component: wraps a focusable named region and shows "Scroll sideways to see all columns" only when `scrollWidth > clientWidth` (ResizeObserver).
- `RunIdTools` in Attack Lab: copy button with `role="status"` message; links to Evidence and Time Machine.
- Attack Lab order (all widths): status, report plus key decision, timeline (a list), graph. The graph block is a `section` named "Event graph" with text "Visual summary. The timeline above has the same events." The minimap is hidden at 640 px and below.
- Home flow `div aria-label` becomes `section aria-labelledby`. Graph wrapper is a named `section`.
- Errors: `ApiError` carries `status`; `describeApiError(status, context)` returns the message. Network failure gets its own message. No URL, no body.
- Query string hand-off uses `window.location.search` in an effect, so no Suspense boundary is needed.

## Test plan (summary; details in tasks.md)
- Backend: scenario 02 policy, allowlist pin, scenario 01 and 02 decisions in both modes, key decision equals audit events, old and new event JSON, SSE order and IDs, cancellation, compare and report fields; Gemini normal, long (8,192 boundary: 8,191, 8,192, 8,193), wrong code with no ledger open and no provider call, consent missing, missing config, limit, provider error, timeout; Windows stat test; full suite.
- Frontend: `tsc`, `eslint`, `next build`, Node tests for `explain.ts`, `api.ts` errors, `playgroundScenarios.ts`.
- Browser: Playwright (Edge) against running servers at 320, 375, 1280 px: Time Machine, Evidence, Attack Lab, Playground; keyboard, focus, table scroll hint, no page overflow.
- Hallmark static check and render check against the running server. A skipped render step is reported as skipped.
- Not testable here: real screen reader, real Google, Vercel to Render.
