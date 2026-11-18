# Plan: Hallmark redesign and accessibility verification

Written by Kiro, 2026-11-16. Nothing in this plan has been run. Status of every item is NOT STARTED unless a measurement is quoted. Hallmark is a skill in `C:\Users\micby\.agents\skills\hallmark` (v2.0.0). It loads only when the user names it (`/hallmark audit <path>` or `/hallmark redesign <path>`), and it asks questions once before building.

## Measured facts that drive the plan
Contrast computed from the CSS tokens (WCAG formula, not a rendered check):

| Pair | Ratio | Requirement | Result |
|---|---|---|---|
| `--text-muted` #64748B on `--bg` | 3.98 | 4.5 (body text) | fails |
| `--text-muted` on `--surface` | 3.31 | 4.5 | fails |
| `--text-dim` on `--surface` | 6.14 | 4.5 | passes |
| `--agent` link/text on `--bg`, `--surface` | 8.84, 7.35 | 4.5 | passes |
| control border #2A3F5F on `--bg`, `--surface` | 1.78, 1.48 | 3.0 (input boundary) | fails |

`--text-muted` is used for the home feature-card text and the disclaimer. The experiment page uses `--text-dim` and `--surface`, so its text passes; its textarea and select borders fail.

Hallmark Floor rules the current UI breaks (found by reading, not by `sloplint`): an emoji logo and emoji card icons in `NavBar.tsx` and `page.tsx`; a middle-dot meta string (`MODE A · GUIDED`, `SIMULATED · no model is called`, `Kiroween 2026 · Frankenstein Category`); an eyebrow and tracked capitals; `transition: all` in the nav; literal colors in inline styles instead of tokens; no `overflow-x: clip` on `html` and `body`; no stamp line at the top of `globals.css`.

## Conflict to settle before any redesign
Requirements R4 and the tests assert exact label strings. Hallmark forbids the middle-dot and capitals styling. Decision needed from the user: keep the meaning, change the wording. Proposed labels: `Guided scenarios`, `Experiment`, `Simulation selected`, `Gemini selected`, and a neutral `Agent Afterlife`. Required changes if accepted: `modeLabel.ts`, `modeLabel.test.mjs`, `expansion_browser.py`, `requirements.md` R4. The rule stays the same: never `Guided` on the playground, never `Simulation` while Gemini is selected, neutral when unknown.

## Stages (each ends with a recorded command and exit code)
1. **Approval and snapshot.** User names Hallmark and answers the one-time ask (material, audience, use, tone). The draft is not a Git repo, so copy `C:\mysite\afterlife-expansion-stage` (without `node_modules`, `.next`, caches) to a dated sibling folder first. No transfer to the original worktree.
2. **Audit only.** `node <skill>/scripts/sloplint.mjs <target> --genre modern-minimal --render --before --url <route>` against a dev server inside the offline container, for `/`, `/attack-lab`, `/time-machine`, `/evidence`, `/playground`. Chromium exists in the image at `/ms-playwright`. `audit` changes no files. Output: findings by gate with `file:line`, before screenshots.
3. **Decide depth.** `polish` (fix gate failures and contrast, keep layout) is the recommended minimum. `full` redesign only if the user asks.
4. **Implement in small slices:** (a) tokens: raise `--text-muted` to at least 4.5 on `--surface` and the control border to at least 3.0; (b) remove emoji icons, eyebrow, middle-dot strings, `transition: all`; (c) `overflow-x: clip`; (d) the label wording decision; (e) playground layout. After each slice rerun the full offline check script.
5. **Preserve wiring.** Keep every route, `data-testid`, label, ARIA role, form name, SSE call and the `AFTERLIFE_*` auth flow. Do not edit tests to make a redesign pass; update them only for the agreed label wording, and say so.
6. **Re-run `sloplint --render`.** Fix every FAIL; fix or waive every REFLEX with a reason.

## Accessibility checks to add (none run yet)
- **Automated:** axe-core through Playwright on every route, at 320, 375 and 1280 px. This needs `axe-core` or `@axe-core/playwright`; neither is installed, so adding it needs approval to download it into the task volume.
- **Keyboard:** Playwright script that tabs through `/playground` and records focus order; every control reachable, no trap, visible focus ring (the `:focus-visible` rule exists, unverified), mode buttons operable with Enter and Space, `aria-pressed` state announced.
- **Mode announcement:** `role="status"` indicator text changes when the mode changes (the current page has two `role="status"` elements; confirm they are not read twice).
- **Reduced motion:** run with `reduced_motion='reduce'` and confirm no animation (`.pulse-dot` and the global rule exist).
- **Contrast in render:** computed styles for text over its real background, including text on the gradient headline and the sticky blurred nav.
- **Zoom and reflow:** 200 percent zoom and 320 px width, no horizontal scroll (the browser script checks 320 and 375 only).
- **Error and loading states:** simulate 429, 503, a slow response and offline; confirm the message is announced (`role="alert"`) and the submit button re-enables.
- **Form semantics:** every control has a label (true for the playground), `maxLength` counter does not spam screen readers, errors are tied to fields (`aria-describedby` is missing today).
- **Screen reader:** manual pass with NVDA and Chrome on Windows. Cannot be automated here and cannot be claimed without a person running it.
- **Hallmark gates:** the 80-word-per-screen and hero-fold rules for the home page.

## Blocked until the user acts
Hallmark naming and approval, the label wording decision, permission to download axe-core, and a person for the screen-reader pass.
