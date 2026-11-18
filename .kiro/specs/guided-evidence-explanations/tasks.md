# Tasks: Guided evidence explanations

A box is checked only after the named check ran against the current source (Windows, Python 3.14.5 venv `C:\mysite\afterlife-kiro-venv`, Node 24.21.0, test SQLite files under `C:\mysite\afterlife-kiro-tmp`).
Test commands use `--basetemp` under that folder because the default user temp folder gave `PermissionError` for pytest `tmp_path`.

- [x] 0. Baseline: backend suite on the untouched stage; copy saved as `afterlife-expansion-stage-baseline-kiro`.
- [x] 1. Backend model and engine (R3, D3)
  - [x] 1.1 `AgentEvent.actor_trust_level`, set on tool-call events; limit event resets it.
  - [x] 1.2 Tests: old JSON (no key) loads, new JSON loads, both come back through the API; compare ignores the field.
- [x] 2. Scenario 02 policy (R2, D1)
  - [x] 2.1 Allow `mock_read_config` in the defended policy.
  - [x] 2.2 Tests: allowlist pinned; both scenarios x both modes produce the expected decision events; trust 0 still denied; admin tools still need trust 2.
- [x] 3. Compare and report fields (R1, D2)
  - [x] 3.1 `critical_tool`, `key_decision_a/b`, report `key_decision`.
  - [x] 3.2 Tests: values equal the stored audit events for both scenarios; first divergence is `INJECTION_DETECTED` at 3 for scenario 01 and the key decision at 4 for scenario 02.
- [x] 4. Gemini (R5, R6, R7, D5 to D8)
  - [x] 4.1 Check order, `consent_required`, `_device_id`.
  - [x] 4.2 Truncation: 8,191 / 8,192 / 8,193 characters; observation range equals shown range.
  - [x] 4.3 Wrong code: no ledger open, no provider request, usage unchanged. Missing consent likewise.
  - [x] 4.4 Existing tests for normal reply, limit, provider error, timeout, missing config still pass with the consent field.
  - [x] 4.5 Windows `os.stat` test replaced; full backend suite.
- [x] 5. Frontend library (R1, R4, R8.1)
  - [x] 5.1 `explain.ts`, `describeApiError`, `ApiError`, types.
  - [x] 5.2 Node tests.
- [x] 6. Frontend pages (R1 to R5, R8)
  - [x] 6.1 Time Machine, Evidence, Attack Lab, Playground, home, `ScrollTable`, CSS.
  - [x] 6.2 `tsc`, `eslint`, `next build`.
- [x] 7. Browser checks at 320, 375 and 1280 px, keyboard and focus (R8)
- [x] 8. Hallmark static and render checks
- [x] 9. Docs: `docs/GEMINI_OPERATIONS.md` consent and order note; `CHANGELOG.md`.
- [x] 10. Final full re-run of everything above on the final source.

## Results (final run on the final source, 2026-11-18)
- Backend: 159 passed (baseline 125; +34 new). Mutation checks: reverting the allowlist, the access-code order, the observation scope or the consent check each made tests fail.
- Frontend: tsc exit 0, eslint exit 0, next build exit 0, Node tests 21/21.
- Browser (Edge, 320/375/1280): guided_evidence_browser.py no failures (includes axe wcag2a/2aa/21aa/best-practice on each page); expansion_browser.py, cancel_boundary.py, proxy_stream.py, protected_proxy.py pass.
- Hallmark: static scan 0 FAIL/0 REFLEX/0 WARN; render tier ran on 5 URLs (puppeteer-core installed in a temp folder, Chrome) with 0 findings.
- Windows os.stat test: replaced by a test of _device_id; passed here, and the earlier failure cause (global os.stat patch) no longer exists.
- Task 5.2 note: the HTTP error test in api.test.mjs still matches /422/ because messages keep HTTP <status>.

## Not verified here (kept open on purpose)
- Real screen reader.
- Real Google responses, real key, live activation.
- Vercel to Render deployment path.
