# Tasks: Playground experiments

Status marks are set only after the listed check was actually run. "Codex" means the earlier draft; "Kiro" means work done in this session (2026-11-16). All checks ran in `afterlife-gemini-test:20261113` with `--network none` (network was used only for `npm ci --ignore-scripts` into a task-owned Docker volume).

- [x] 0. Baseline (Kiro): `test_gemini_live.py` 5 passed, `backend/tests` 68 passed, exit 0.
- [x] 1. Mode label and copy (R3, R4, A4, A5)
  - [x] 1.1 `playgroundCopy.ts`, `modeLabel.ts`.
  - [x] 1.2 `NavBar.tsx`, `playground/page.tsx`, home disclaimer. tsc, lint, build exit 0; browser script verifies labels at 320 and 375 px.
  - [x] 1.3 `modeLabel.test.mjs` (5 tests).
- [x] 2. Simulation inputs (R1, A1, A2)
  - [x] 2.1 `action` and `trust_level`; explanation fields.
  - [x] 2.2 3 new backend tests.
  - [x] 2.3 Selectors and result panel; browser script checks DENY and ALLOW_WITH_FLAG results and "what did not" text.
- [x] 3. Gemini hardening (R2, A3)
  - [x] 3.1 4 mock-only tests (stuck reservation, charged errors, no leaks, no quota use when unconfigured).
  - [x] 3.2 `GET /api/evaluate/gemini/status` returns only `{enabled}`; UI disables submit unless enabled; 2 backend tests; browser script checks disabled state and, with browser-level route mocks, the enabled state and plain-text rendering of HTML output.
  - [x] 3.3 `docs/GEMINI_OPERATIONS.md`. Documentation only; not executed.
- [~] 4. Final re-run: backend 77 passed; tsc, lint, build, Node 10/10 passed; browser script passed. Not covered: keyboard order beyond one Tab, contrast, screen reader, real Gemini, deployed proxy, SDK wall-clock timeout.
- [x] 5. Gemini SDK verification (R2.4 to R2.9; Kiro, 2026-11-16). Real `google-genai==2.30.1` against `httpx.MockTransport`, offline container.
  - [x] 5.1 Docs checked (Interactions API overview and create reference). Outgoing request asserted: URL, method, `x-goog-api-key` header only, `store:false`, `max_output_tokens:512`, no tools.
  - [x] 5.2 Defects found and fixed in `gemini_live.py`: SDK retried 408/429/5xx up to 4 requests per reservation (now one, via request hook); real 429 raised `status_code=429`, not `.code`, so it returned 502 (now mapped from the first response); the SDK timeout is per phase (now `asyncio.wait_for`, 20 s, cancellation proven).
  - [x] 5.3 38 tests in `test_gemini_live.py`: malformed and non-completed responses, provider errors, timeout, cancellation, key never in responses or DEBUG logs.
  - [x] 5.4 Ledger: concurrency limit, atomic daily limit with 6 simultaneous callers, restart persistence, crashed processes (`os._exit`) leave stuck slots that fail closed, ledger deletion resets usage (documented limit).
  - [x] 5.5 Mutation checks: 8 reintroduced defects each failed the intended tests.
  - [ ] 5.6 NOT PROVEN: real provider behavior, safety-block representation, thinking-token cost, mid-call worker kill, free-tier terms and pricing. See `docs/GEMINI_OPERATIONS.md`.
- [ ] 6. Hallmark redesign and accessibility: plan only, see `hallmark-accessibility-plan.md`. BLOCKED on user approval. Measured: `--text-muted` fails 4.5:1; control borders fail 3:1.
