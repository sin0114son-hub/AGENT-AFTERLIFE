# Agent Afterlife — Threat Model

## Scope
This threat model covers the synthetic security simulation only.
No real agents, no real credentials, no real network targets.

---

## Simulated Threats (In Scope for Demo)

### T-1: Prompt Injection via Tool Output
- **Vector:** Attacker-controlled tool response contains injected instruction
- **Impact (undefended):** Agent executes unauthorized tool call
- **Defense:** Output scanner in policy engine; pattern match on injection signatures
- **Evidence:** `INJECTION_DETECTED` event in audit log

### T-2: Trust Boundary Escalation
- **Vector:** Low-trust agent requests high-trust tool
- **Impact (undefended):** Privilege escalation, config mutation
- **Defense:** Trust-level check before every tool dispatch
- **Evidence:** `UNAUTHORIZED_TOOL_CALL` event with trust delta logged

---

## Out of Scope (Explicitly Excluded)

| Item | Reason |
|---|---|
| Real network attacks | Not an authorized target; synthetic only |
| Real LLM API | Deterministic engine used instead |
| Real credentials | Zero tolerance — `git grep` gate in CI |
| External user data | No user accounts in MVP |
| Supply chain attacks | Outside demo scope |

---

## Security Rules for Implementation

1. All mock tools return static fixtures — no live I/O
2. Policy engine is pure function: `(event, trust_level, policy) → decision`
3. Audit log is append-only during a scenario run
4. No environment variables with real secrets in repo
5. All scenario fixtures are committed as JSON — no dynamic generation
6. CORS restricted to localhost in development
7. No `eval()`, no dynamic code execution

---

## Verification
- `git grep -r "password\|secret\|token\|api_key" --include="*.ts" --include="*.py" --include="*.json"` must return 0 real secrets
- Policy engine unit tests cover both T-1 and T-2 in both defended/undefended modes
