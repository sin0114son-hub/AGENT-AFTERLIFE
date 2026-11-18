# Requirements: Playground experiments (simulation, Gemini, feedback, mode label)

Provenance: written by Kiro on 2026-11-16 from the Codex draft in this directory. Codex work is listed in `afterlife-expansion-HANDOFF.md`. Nothing here claims Kiro wrote the earlier draft.

## Analysis of the current draft (input to these requirements)

The `/api/simulate` endpoint hashes the submitted text and evaluates one fixed proposed action (`mock_data_exfiltrate`, admin tier) from a fixed actor at trust level 0. The text never reaches the policy engine, so every input returns `DENY` / `UNTRUSTED_ACTOR`.

- **What it teaches:** content from an untrusted source cannot authorize an admin action, because the server-side policy gate runs before any tool-specific rule and does not depend on the content.
- **What it cannot evaluate:** whether the text contains an injection, what a model would do with it, whether other actions or trust levels are allowed, or whether any real system is secure.
- **Does it meet the goal "enter your own content and get a useful evaluation"?** No. The result is identical for all inputs, so the user's content is not evaluated. It is a correct fixed illustration. It becomes useful only if the user chooses what varies and the result states what did and did not affect the outcome.

Other verified gaps: the nav badge says `MODE A 쨌 GUIDED` on every route including `/playground`; the home disclaimer says no real AI models are used, which is false once Gemini mode exists; a crashed Gemini call can leave a stuck `active` reservation with no documented recovery.

## R1. Simulated experiment
1. The user can select a proposed mock action from a server-defined list and a source trust level (0 to 3) in addition to entering text.
2. The server evaluates the policy with the selected action and trust level. Unknown actions or out-of-range levels return 422.
3. The text is never used as a policy input, never executed, never stored, and never logged. The result includes its SHA-256 and a `text_affected_decision: false` field.
4. The result lists `what_affected_decision` (action, trust level, policy) and `what_did_not` (text content). The UI shows both.
5. The UI and API never describe the result as attack detection, injection detection, a security proof, or a model result.
6. The simulated endpoint calls no network service.

## R2. Gemini experiment
1. Gemini mode is separate from the simulation in the UI, the endpoint and the response (`mode: "gemini"`).
2. Disabled by default. It is enabled only when the server has the key, an absolute quota path, and both operator confirmations. The key is read only from server environment variables and never appears in responses, logs or frontend code.
3. The UI shows, before submission, that the text is sent to Google, that responses vary, that output is untrusted and not a policy decision, and that secrets and personal data must not be entered.
4. Quota: at most 10 reservations per UTC day and 2 active. Reservation is atomic. A stuck reservation fails closed and is never auto-reset in a way that lowers spend counts.
5. Provider errors map to: 429 for rate or quota, 504 for timeout, 502 for failed, incomplete, empty or malformed responses, 503 when not configured. Error bodies never include provider messages.
6. A refusal, error or timeout is never reported as a defense success.
7. One reservation causes at most one network request to Google. SDK automatic retries are blocked, because they would bill several requests against one counted use.
8. The whole call has a wall-clock limit (20 seconds) that cancels the in-flight request. The SDK timeout alone is per phase and is not a total.
9. Provider status maps from the first HTTP response: 429 gives 429, 408 and 504 give 504, other failures give 502. Mapping never depends on provider message text.
10. Live mode stays off on ephemeral storage. Enabling it requires a separate, reviewed decision and a real-key test with explicit cost authorization. This spec does not authorize either.

## R3. Feedback
1. The UI states, next to the form and in the save confirmation, that the draft is stored only in this browser tab and is not sent to the team.
2. The wording is defined once and reused by the page and tests.

## R4. Mode indicator
1. On guided routes (`/attack-lab`, `/time-machine`, `/evidence`) the indicator reads `MODE A 쨌 GUIDED`.
2. On `/playground` the global indicator never says `GUIDED`. It says `EXPERIMENT`.
3. On `/playground` the in-page indicator says `SIMULATED` only while simulated mode is selected and `GEMINI LIVE` only while Gemini mode is selected.
4. On any other route, or if the mode is not a known value, the label is neutral (`AGENT AFTERLIFE`) and contains neither `GUIDED` nor `SIMULATED`.
5. The home page disclaimer is limited to guided mode and does not claim the whole site uses no real model.

## Acceptance tests
- A1 (R1.2, R1.3): two different texts with the same action and trust give the same decision and different hashes; different action or trust can change the decision; response never contains the text.
- A2 (R1.2): unknown action and trust levels -1 and 4 return 422.
- A3 (R2.2, R2.4, R2.5, R2.6): existing `test_gemini_live.py` plus stuck-reservation and concurrency cases, using a mocked provider only.
- A4 (R3): copy test asserts the exact "browser tab only / not sent to the team" statements.
- A5 (R4): label function returns the specified label for every route and for unknown or missing mode.
- A6: all 68 pre-existing backend tests, both guided scenarios, auth, SSE and audit tests still pass.
