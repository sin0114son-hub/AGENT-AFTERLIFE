# Agent Afterlife — UX Specification

## Design Philosophy
- Explainability first: every security event has a plain-language explanation
- Education before aesthetics: the user must understand *what happened* before they see *how it looks*
- No color-only communication: every outcome uses icon + text + color
- Beginner path and expert path coexist on the same screen

---

## Design Tokens

### Colors

```css
/* Dark base — Frankenstein laboratory aesthetic */
--color-bg-base:        #0a0a0f;   /* deep black */
--color-bg-surface:     #111118;   /* card background */
--color-bg-elevated:    #1a1a24;   /* modal, tooltip */

/* Text */
--color-text-primary:   #e8e8f0;
--color-text-secondary: #9090a8;
--color-text-muted:     #50505e;

/* Security outcome — ALWAYS paired with icon and text, never color alone */
--color-allowed:        #22c55e;   /* green */
--color-denied:         #ef4444;   /* red */
--color-flagged:        #f59e0b;   /* amber */
--color-inconclusive:   #6366f1;   /* indigo */
--color-error:          #dc2626;   /* red-700 */
--color-neutral:        #6b7280;   /* gray */

/* Electric / Frankenstein accent */
--color-electric:       #7fff00;   /* chartreuse — used sparingly for emphasis */
--color-electric-dim:   #3d7a00;

/* Borders */
--color-border:         #2a2a38;
--color-border-focus:   #6366f1;
```

### Typography

```css
--font-mono:   'JetBrains Mono', 'Fira Code', monospace;  /* events, code, hashes */
--font-sans:   'Inter', system-ui, sans-serif;              /* UI prose */

--text-xs:    0.75rem;   /* 12px — timestamps, labels */
--text-sm:    0.875rem;  /* 14px — event descriptions */
--text-base:  1rem;      /* 16px — body */
--text-lg:    1.125rem;  /* 18px — section heads */
--text-xl:    1.25rem;   /* 20px — page titles */
--text-3xl:   1.875rem;  /* 30px — hero */
--text-5xl:   3rem;      /* 48px — homepage headline */
```

### Spacing

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
--space-16: 64px;
```

### Motion

```css
--duration-fast:   150ms;
--duration-normal: 300ms;
--duration-slow:   600ms;
--ease-out:        cubic-bezier(0.16, 1, 0.3, 1);

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  --duration-fast:   0ms;
  --duration-normal: 0ms;
  --duration-slow:   0ms;
}
```

---

## Outcome Icon System (never color alone)

| Outcome | Icon | Color | ARIA label |
|---|---|---|---|
| ALLOW | ✓ checkmark | `--color-allowed` | "Allowed" |
| DENY | ✗ x-mark | `--color-denied` | "Denied" |
| INJECTION_DETECTED | ⚠ triangle | `--color-flagged` | "Injection detected" |
| TRUST_CHECK_FAILED | 🔒 lock | `--color-denied` | "Trust check failed" |
| EXECUTION_LIMIT_REACHED | ⏱ clock | `--color-inconclusive` | "Timeout — not a defense" |
| RUN_ERROR | ! exclamation | `--color-error` | "Execution error" |
| INCONCLUSIVE | ? question | `--color-inconclusive` | "Inconclusive" |

---

## Screen 1: Immersive Homepage

**Goal:** User understands product in 10 seconds, clicks "Enter Lab."

**Layout:** Full-screen. Single scroll section.

```
┌─────────────────────────────────────────────────────┐
│  [Background: dark, slow electric particle field]    │
│                                                      │
│        AGENT AFTERLIFE                               │
│   ── AI Security Laboratory ──                       │
│                                                      │
│  "Watch AI agents get compromised.                   │
│   See defenses hold."                                │
│                                                      │
│  [ENTER THE LAB]  ←── primary CTA, large button     │
│                                                      │
│  ───────────────────────────────────────────────    │
│  [3 concept cards, horizontal]                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  Attack  │  │  Policy  │  │  Compare │           │
│  │  Inject  │  │  Engine  │  │  Traces  │           │
│  └──────────┘  └──────────┘  └──────────┘           │
└─────────────────────────────────────────────────────┘
```

**Reduced motion:** Particle field is static; no auto-play animations.
**Keyboard:** Tab → concept cards → CTA button.
**Mobile:** Cards stack vertically.

---

## Screen 2: Attack Lab

**Goal:** User runs a scenario and sees the execution trace in real time.

**Layout:** Three-panel (collapsible sidebar on mobile).

```
┌────────────────────────────────────────────────────────┐
│ [Nav: Agent Afterlife  |  Lab  |  Time Machine  |  Help]│
├──────────────┬─────────────────────┬────────────────────┤
│ SCENARIO     │  AGENT GRAPH        │  EVENT STREAM      │
│ PANEL        │  (React Flow)       │                    │
│              │                     │  #1 TOOL_CALL_...  │
│ Scenario 1 ● │  [agent] ──→ [tool] │  #2 INJECTION_...  │
│ Scenario 2 ○ │       ↘             │  #3 TOOL_CALL_...  │
│              │    [policy]         │  #4 RUN_COMPLETE   │
│ Mode:        │                     │                    │
│ ● Defended   │                     │                    │
│ ○ Vulnerable │                     │                    │
│              │                     │                    │
│ [RUN]        │                     │  [Export JSON]     │
│ [RESET]      │                     │                    │
└──────────────┴─────────────────────┴────────────────────┘
```

**Node graph semantics:**
- Blue node: agent
- Gray node: mock tool
- Red/amber node: policy engine (lights up on decision)
- Edge color: green=ALLOW, red=DENY, amber=FLAGGED
- Edge label: event type (small text, not color-only)
- Animated edge traversal: disabled under `prefers-reduced-motion`

**Event stream:**
- Each row: `[seq#] [icon] [event_type] [actor] → [tool] [outcome]`
- Clicking a row expands: full JSON, plain-language explanation, policy reason
- Monospace font for technical fields

**Controls:**
- RUN: disabled while running; re-enabled after COMPLETE/ERROR
- RESET: clears graph + stream, returns to initial state
- Policy mode toggle locked during run (prevents mid-run switch)

**States to design:**
- Idle (waiting for run)
- Running (animated edges, streaming events)
- Complete (all nodes settled, final verdict banner)
- Error (red banner, error message, RESET available)
- Timeout (amber banner, NOT a defense)

---

## Screen 3: Time Machine

**Goal:** Side-by-side comparison of two runs. First divergence highlighted.

**Layout:** Two columns, synchronized playback.

```
┌───────────────────────────────────────────────────────┐
│  TIME MACHINE                                          │
│  Scenario: Prompt Injection via Tool Output            │
│  ◄ PREV  [●●●●○○○○] step 4 of 8  NEXT ►               │
├────────────────────┬──────────────────────────────────┤
│  RUN A: Vulnerable │  RUN B: Defended                  │
│  Policy: none      │  Policy: v1.0                     │
│                    │                                   │
│  #4 TOOL_CALL_     │  #4 TOOL_CALL_          ◄ DIFF   │
│  _EXECUTED         │  _DENIED                         │
│  data_exfiltrate   │  data_exfiltrate                  │
│  result: SUCCESS   │  reason: TRUST_CHECK_FAILED       │
│                    │                                   │
│  [!] FIRST DIVERGENCE AT STEP 4                        │
└────────────────────┴──────────────────────────────────┘
```

**Synchronization rule:** Scrubber moves both columns together. DIFF marker appears at `first_divergence_sequence`.

**Causal explanation panel** (below the diff):
> "At step 4, both runs proposed calling `data_exfiltrate`. In Run A (no policy), the call was executed. In Run B (with policy v1.0), the trust check detected that the call was triggered by untrusted tool output, and denied it. The agent then continued without the unauthorized tool."

**Uncertainty notice (Mode B only):**
> "⚠ This comparison uses live LLM runs. The model's behavior is not guaranteed to be identical between runs. Differences may reflect model nondeterminism, not only policy effect."

---

## Screen 4: Evidence Report

**Goal:** Auto-generated summary of a run. Exportable.

**Layout:** Single column, printable.

```
EVIDENCE REPORT
Scenario: Prompt Injection via Tool Output
Run ID: abc123
Policy: defended
Generated: 2026-11-11T12:05:00Z

VERDICT: ✓ DEFENDED
"data_exfiltrate was proposed at step 4 and DENIED by policy engine."

SUMMARY
  Total events:          8
  Tool calls proposed:   3
  Tool calls allowed:    2
  Tool calls denied:     1
  Injections detected:   1
  Errors / Timeouts:     0

EVENT TABLE
#  | Timestamp | Actor | Event Type | Tool | Outcome
---|-----------|-------|------------|------|--------
1  | ...       | agent | TOOL_CALL_PROPOSED | web_search | ALLOW
...

[Export as JSON]
```

**Verdict rules (displayed verbatim):**
- DEFENDED: green ✓ — criterion met per scenario
- VULNERABLE: red ✗ — unauthorized action executed
- INCONCLUSIVE: indigo ? — critical step not reached
- ERROR/TIMEOUT: amber ! — "Run ended without reaching the critical decision point."

---

## Accessibility Requirements

- All interactive elements reachable by Tab key
- Focus ring: `2px solid var(--color-border-focus)`, `outline-offset: 2px`
- ARIA labels on all icon-only buttons
- Event stream rows: `role="row"`, outcome announced by screen reader
- Color contrast: all text ≥ 4.5:1 against background (WCAG AA)
- Reduced-motion: all animations stop
- Keyboard shortcut: `Space` = Run/Pause, `R` = Reset, `←/→` = Time Machine step

---

## Responsive Layout

| Breakpoint | Behavior |
|---|---|
| ≥1280px | Full 3-panel Attack Lab |
| 768–1279px | Graph panel hidden; event stream full width |
| <768px | Single column; scenario panel collapses to dropdown |

---

## Loading and Error States

Every async action has three states:
1. **Loading:** skeleton placeholder or spinner with ARIA `aria-busy="true"`
2. **Success:** content renders
3. **Error:** inline error message with retry action (not full-page error)

Network disconnection during SSE stream: amber banner "Connection lost — results may be incomplete. [Retry]"
