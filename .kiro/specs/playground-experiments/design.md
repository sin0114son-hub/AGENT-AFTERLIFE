# Design: Playground experiments

## Alternatives considered
- **Detect injection in the text with heuristics.** Rejected. It would imply attack detection that cannot be justified, and the policy engine is deliberately independent of content.
- **Let the user supply the injection flag.** Rejected for now. A user-asserted flag only demonstrates the flag gate and could mislead users into thinking the text was inspected.
- **Choose the action and trust level.** Chosen. It is deterministic, uses the real policy engine, and teaches how the policy decides.

## Backend
- `simulation.py`: `SimulationRequest` gains `action` (enum of mock tools from the defended policy) and `trust_level` (int 0 to 3), both with defaults that preserve today's request body `{text}` (action `mock_data_exfiltrate`, trust 0). Tool tier comes from a server table, never from the client. The policy is `POLICY_DEFENDED`.
- Response adds `text_affected_decision: false`, `what_affected_decision`, `what_did_not`, and keeps `mode: "simulated"`, hash, decision, reason, evidence and limitation.
- `gemini_live.py`: unchanged contract. Later stage adds a status endpoint reporting only `{enabled: bool}`, and a documented operator recovery for stuck `active` counts.

## Frontend
- `app/lib/playgroundCopy.ts`: single source for feedback and disclosure strings and `playgroundMode` type.
- `app/lib/modeLabel.ts`: pure functions `navModeLabel(pathname)` and `experimentModeLabel(mode)`. Unknown input returns the neutral label.
- `NavBar.tsx` calls `navModeLabel(usePathname())`. `/playground` page shows `experimentModeLabel(mode)` in an element with `role="status"`.
- Pure modules are tested with `node --experimental-strip-types --test`, which needs no package install.

## Security notes
- Text is untrusted. React escapes it. Model output is rendered in a `<pre>` as text, never as HTML.
- The key is read in `evaluate_live` only. No client-visible config.
- Quota check and increment happen in one `BEGIN IMMEDIATE` transaction. Active slots are released in `finally`.
