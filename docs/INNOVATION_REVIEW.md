# Agent Afterlife — Innovation Review

## Competitive Landscape (Verified)

### Promptfoo
- 300,000+ open source users; used by OpenAI and Anthropic
- Automated red teaming with thousands of adversarial probes
- CLI-first; developer workflow tool; no interactive visual UI
- Tests prompts/agents but does not visualize causal execution traces
- No "before/after defense" comparison UI
- **Gap:** No interactive educational experience; no step-by-step policy reasoning

### Microsoft PyRIT
- Python framework; security researcher audience
- Custom multi-turn attack orchestration (Crescendo, TAP)
- Not a product UI; requires significant security expertise to operate
- **Gap:** No accessible UI for developers or hackathon judges

### Giskard
- Strongest for RAG and agent red teaming in Python
- Product-ready but aimed at ML engineers
- No interactive execution graph
- **Gap:** No real-time causal trace visualization

### OWASP-aligned tools / LangSmith / Arize Phoenix
- Observability and tracing (Arize Phoenix, LangSmith)
- Primarily for production monitoring, not security education
- **Gap:** No security scenario simulation; no policy enforcement demo

---

## What Agent Afterlife Does Differently

### Differentiator 1: Causal Trace Graph (strongest)
Every existing tool either generates a report or shows a log.
Agent Afterlife shows a **live interactive graph** where you watch the attack travel through the agent → tool → policy node network in real time, then see exactly where the defense intercepted it.

**Why this matters for hackathon:** Judges see the security event happen, not just read about it. The node that turns red when the injection is blocked is immediately understood.

### Differentiator 2: Before/After Policy Comparison (Time Machine)
No existing tool shows you the same attack scenario with two different policy configurations side by side, synchronized step by step, with the first divergence highlighted and a plain-language causal explanation.

**Why this matters:** "Policy version 1.0 stopped the attack at step 4" is a verifiable, evidence-backed claim — not a marketing claim.

### Differentiator 3: Security Outcome Semantics (credibility)
Every existing tool collapses results into pass/fail or score.
Agent Afterlife distinguishes 9 outcome types and explicitly shows when a timeout is NOT a successful defense.

**Why this matters for portfolio value:** This shows real security engineering thinking, not demo polish.

---

## What NOT to Build (avoid overlap)

| Feature | Reason to avoid |
|---|---|
| Automated probe generation (Promptfoo's strength) | Out-competed; not differentiating |
| Multi-turn attack orchestration (PyRIT's strength) | P2 at earliest; scope risk |
| LLM benchmark scoring | Not interactive; not visual |
| Generic dashboard with charts | Exactly what this product must NOT be |

---

## Risk: "It's just a demo"
**Challenge:** Judges may dismiss the product as a scripted animation.
**Response:** Mode A is deterministic by design for reliability — but Mode B (Live Playground) adds real LLM execution with observable non-determinism. The Evidence Report contains verifiable event IDs and policy reason codes that judges can inspect. The Security Invariants document and test results show real engineering discipline.

**Mitigation if Mode B is not ready by deadline:** The deterministic engine is honest about being deterministic. The README explains this clearly. The engineering quality and the Time Machine comparison are still compelling.

---

## Three Features for Maximum Hackathon Impact

1. **Live node graph with animated attack path** — judges immediately understand what's happening
2. **Time Machine: "Before policy" vs "After policy" at step 4"** — memorable, concrete, verifiable
3. **Mode B: type your own prompt, watch the policy intercept it** — interactive, memorable, technically impressive
