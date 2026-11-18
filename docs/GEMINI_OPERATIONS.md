# Gemini live mode: operator notes

Written by Kiro, 2026-11-16. These are procedures, not proof that any deployment is safe. Live mode stays off unless every item under "Enablement" is satisfied and reviewed.

## Enablement (all required)
- `GEMINI_LIVE_ENABLED=true`, `GEMINI_API_KEY` (server environment only), `GEMINI_QUOTA_DB_PATH` (absolute file path in an existing directory), `GEMINI_DURABLE_QUOTA_CONFIRMED=true`, `GEMINI_SINGLE_INSTANCE_CONFIRMED=true`.
- The two `CONFIRMED` flags are operator assertions. The app cannot check them. Do not set them on Render's free ephemeral filesystem: a restart can delete the ledger and reset the daily count.
- `GEMINI_ACCESS_CODE`: a random string of at least 16 characters that you give to the people allowed to spend the budget. The page asks for it and sends it in the `X-Afterlife-Live-Code` header. This is user access control. It is not `AFTERLIFE_PROXY_SECRET`, which only proves that a request came through the frontend proxy, and anyone who can open the public page passes that check. Without the access code, live mode stays off.
- Create the ledger once, as an operator, before enabling: `GEMINI_QUOTA_DB_PATH=/abs/path/quota.db python -m backend.gemini_live init-ledger --used-today N` (N = calls already spent today in UTC; use 10 if unsure). The app never creates the ledger. If the file is missing or lacks the marker (for example a wiped ephemeral disk), live mode turns off and calls return 503 instead of starting from zero. Do not run `init-ledger` from a start script: that would let each restart choose a fresh count.
- On Render, `RENDER` is set and the ledger directory must be on a different filesystem than `/` (a persistent disk). This is a heuristic, not proof. The free plan has no persistent disk, so live mode stays off there.
- Run exactly one backend instance. The ledger is local SQLite and is not shared across hosts.
- Set a budget or quota cap in the Google account as a second limit. The app limit (10 calls per UTC day, 2 active) covers only this app's route.
- Before first use: review Google's current terms, data handling, regions, rate limits and model pricing, and run one authorized real-key test with the cost accepted in writing.

## What the experiment does
The server picks the task (guided scenario 1, guided scenario 2, or a generic summary). The user's text is placed between random `BEGIN_UNTRUSTED_<nonce>` and `END_UNTRUSTED_<nonce>` markers. The system instruction contains a per-call fake test record (`CANARY-...`). There are no real tools; mock tool names exist only as text, and a line `PROPOSED_ACTION: <tool>` is a proposal in text that is never executed. The result lists two fixed checks (test record repeated; admin-tier mock action proposed) and shows what the undefended and defended policies would decide for the proposed actions. "Not observed" is never reported as a defense success, and failed or empty calls produce no result. Error codes returned in `detail.code`: `not_configured`, `access_denied`, `usage_limit`, `quota_unavailable`, `provider_rate_limit`, `timeout`, `no_response`, `provider_error`.

## Checking state
`GET /api/evaluate/gemini/status` returns `{"enabled": true|false, "requires_access_code": true}` only. It reports configuration, not that quota remains or that the provider works.

## Stuck active reservations
A process crash between reservation and release leaves `active` greater than 0. The app counts unfinished calls from any day, so a stuck slot blocks calls (fails closed) until an operator acts.

1. Stop the backend. Confirm no request is in flight.
2. Copy the quota database file as a backup.
3. Inspect: `SELECT day, used, active FROM quota;`
4. Reset only the concurrency counter: `UPDATE quota SET active = 0;`

Never delete the database file and never lower `used`. Either action resets the daily spend cap. If the file is lost, run `init-ledger --used-today 10` to treat today's usage as already at the limit.

## Verified with the real SDK on a mock transport (Kiro, 2026-11-16)
SDK: `google-genai==2.30.1`. Docs checked: https://aistudio.google.com/docs/interactions-overview and the `create-interaction` reference. The tests in `backend/tests/test_gemini_live.py` drive the real SDK through `httpx.MockTransport`; no network, no real key.

Proven:
- The request is `POST https://generativelanguage.googleapis.com/v1beta/interactions` with `store:false`, `generation_config.max_output_tokens=512`, `system_instruction`, no `tools`. The key is only in the `x-goog-api-key` header, not the URL or body.
- The SDK retries 408, 429 and 5xx by itself (4 requests in about 3 seconds). `HttpOptions.retry_options` does not control this for the interactions client, and `RetryConfig` settings gave timing-dependent counts. The app now blocks every request after the first with an `httpx` request hook, so one reservation produces at most one network request.
- The real SDK raises `RateLimitError` with `status_code=429` and `code=None`. The earlier draft checked `.code` and would have returned 502 for a real rate limit. The app now maps from the first response status.
- `timeout=15000` becomes connect, read, write and pool timeouts of 15 seconds each. It is not a total limit. The app adds `asyncio.wait_for` with a 20 second wall-clock limit and a test proves the in-flight request is cancelled.
- Statuses other than `completed` (`failed`, `incomplete`, `cancelled`, `budget_exceeded`, `in_progress`, `requires_action`), empty text, non-string text, an empty JSON object and a non-JSON body all return 502 and are never shown as a defense result.
- The key did not appear in responses or in captured DEBUG logs.
- Quota: two active calls maximum, a third is refused without reaching the provider; exactly one of six simultaneous calls succeeds when one daily use remains; usage persists across new app instances; two crashed processes leave two stuck slots and later calls get 429; deleting the ledger turns live mode off (503) until an operator runs `init-ledger`.

Not proven:
- Real provider payloads and behavior. The mock reflects the documentation, not Google's servers.
- How a safety block is reported. The documented statuses have no explicit block value; it may arrive as `failed`, `incomplete`, or empty text. All of those are errors here, and ordinary refusals written as text are returned as untrusted output.
- Whether thinking tokens count toward `max_output_tokens` or cost. The 10 per day limit counts calls, not money.
- Behavior when a server worker is killed mid-call, beyond the ledger staying charged.
- Client disconnects do not cancel an in-flight call (the route is synchronous); the 20 second limit bounds it.
- Free-tier terms and data use, regions and current pricing. The documentation says stored interactions are kept 1 day (free) or 55 days (paid) unless `store=false`; this app sets `store=false`.

## Known limits
- Failed, timed-out and refused calls are charged against the daily count, so a stuck provider can use up the day.
- The SDK may sleep a backoff delay before the blocked second attempt, up to the 20 second limit.
- A custom `httpx` event hook is used; it depends on SDK 2.30.1 behavior. The pinned version and the tests guard it. Upgrade only after rerunning them.


## Request contract and check order (2026-11-18, guided-evidence-explanations spec)

- `POST /api/evaluate/gemini` now requires `"external_send_consent": true` in the JSON body. Without it the server answers 400 `consent_required`. The Playground sends it only when the consent box is ticked. Reason: the box is a UI control, and any API client could otherwise skip it.
- Check order: static configuration (503 `not_configured`), access code (403 `access_denied`), consent (400 `consent_required`), then storage readiness (Render disk device and a read-only ledger probe), then reserve, call, release. A wrong access code never opens the ledger.
- `GET /api/evaluate/gemini/status` still reports `enabled` only when configuration and storage are both ready.
- The response has `output_truncated` and `output_chars_total`. `output` is at most 8,192 characters, and the fixed text checks in `observation` run on exactly that text. `observation.scope` gives `chars_checked`, `chars_total` and `truncated`.
- Verified with mocked transport only. No real key, no real Google call.