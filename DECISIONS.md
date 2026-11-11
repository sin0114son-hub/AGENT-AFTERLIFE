# Agent Afterlife — Decision Log

## D-001: LLM-free deterministic engine
**Date:** 2026-11-11  
**Decision:** Use scripted/deterministic scenario engine instead of real LLM API calls.  
**Reason:** Reproducibility, no API key required, no fabricated attack outcomes, faster CI.  
**Rejected:** Live LLM integration (risk of non-determinism, cost, credential exposure)

## D-002: SQLite for MVP persistence
**Date:** 2026-11-11  
**Decision:** Use SQLite (Python built-in) for scenario run storage.  
**Reason:** Zero extra install, sufficient for single-user demo, easy export.  
**Rejected:** PostgreSQL (overkill for MVP), in-memory only (no persistence across refresh)

## D-003: Next.js App Router + FastAPI split
**Date:** 2026-11-11  
**Decision:** Frontend = Next.js 15 (App Router, TypeScript). Backend = FastAPI (Python 3.14).  
**Reason:** Next.js for SSR/routing/TypeScript ecosystem; FastAPI for typed API + Python security ecosystem.  
**Rejected:** Full-stack Next.js only (limits Python policy engine), Deno (less ecosystem for React Flow)

## D-004: React Flow for node graph
**Date:** 2026-11-11  
**Decision:** Use React Flow for interactive agent → tool → policy node graph.  
**Reason:** Mature library, handles interactive edges, fits agent execution visualization perfectly.  
**Rejected:** D3.js (more complex, less React-native), Mermaid (not interactive)

## D-005: Two scenarios for MVP
**Date:** 2026-11-11  
**Decision:** Launch with exactly 2 deterministic scenarios (prompt injection, trust escalation).  
**Reason:** Enough to demonstrate the core concept; more can be added post-hackathon.  
**Rejected:** 4+ scenarios (scope risk before deadline)
