# Agent Afterlife — Edge Case Register

## User Input (Mode B)

| Case | Detection | User Feedback | Fallback | Test |
|---|---|---|---|---|
| Empty prompt | Pydantic min_length=1 | "Prompt cannot be empty" inline error | Block submit | T-E-01 |
| Oversized prompt (>4096 bytes) | len check before LLM call | "Prompt exceeds 4096 characters" | Block submit | T-E-02 |
| Prompt is only whitespace | strip() + min_length | Same as empty | Block submit | T-E-03 |
| Unicode / emoji | Accept as-is; byte count checked | None | Allowed | T-E-04 |
| Encoded text (base64, url-encode) | Log as ANOMALY; not blocked | None in UI | Pass to policy engine | T-E-05 |
| Markdown / HTML tags | Escaped before rendering | None | Safe render | T-E-06 |
| JSON as prompt | Accepted as string | None | Treated as text | T-E-07 |
| Repeated run button click | Disable button while running | Button disabled | Idempotent | T-E-08 |

---

## Backend

| Case | Detection | User Feedback | Fallback | Test |
|---|---|---|---|---|
| Invalid scenario_id | 404 from registry | "Scenario not found" | Abort | T-E-10 |
| Invalid policy_mode | 422 Pydantic validation | Validation error detail | Abort | T-E-11 |
| Scenario fixture missing | 500 at startup | Server logs; "Service unavailable" | Abort startup | T-E-12 |
| Duplicate run_id | UUID collision (1 in 2^122) | None expected | Retry UUID generation | T-E-13 |
| Concurrent runs | Allowed (each has own run_id) | None | Independent SQLite rows | T-E-14 |
| SQLite locked | Retry × 3 with 100ms backoff | "Service temporarily busy" | 503 response | T-E-15 |
| Run interrupted mid-stream | Client disconnect detected | Stream closes | Status set to CANCELLED | T-E-16 |
| Partial event stream (server crash) | Run status stays RUNNING | "Run may be incomplete — status: RUNNING" | Manual reset endpoint | T-E-17 |
| Scenario engine raises exception | Caught → RUN_ERROR event | "An error occurred during execution" | Status = ERROR | T-E-18 |
| SSE timeout (>30s) | EXECUTION_LIMIT_REACHED emitted | Amber banner "Run timed out" | Status = TIMEOUT | T-E-19 |

---

## LLM Integration (Mode B)

| Case | Detection | User Feedback | Fallback | Test |
|---|---|---|---|---|
| LLM API unavailable | HTTP error on first call | "AI provider unavailable — try guided mode" | Abort live run | T-E-20 |
| Rate limit (429 from provider) | 429 response | "Provider rate limited — retry in Xs" | 429 to client | T-E-21 |
| Missing API key | Config check at startup | "Live mode unavailable — guided mode active" | Disable Mode B | T-E-22 |
| Invalid tool-call JSON from LLM | Pydantic parse error | Logged as RUN_ERROR | TOOL_CALL_DENIED | T-E-23 |
| LLM refuses to respond | Empty content + stop_reason=content_filter | "Model declined this prompt" | INCONCLUSIVE verdict | T-E-24 |
| LLM calls tool not in schema | Tool not in registry | Logged as UNAUTHORIZED_ACTION_PROPOSED → DENIED | TOOL_CALL_DENIED | T-E-25 |
| LLM loops (>10 tool calls) | max_tool_calls counter | "Execution limit reached" | EXECUTION_LIMIT_REACHED | T-E-26 |
| Token budget exhausted | Token counter check | "Token budget reached" | EXECUTION_LIMIT_REACHED | T-E-27 |
| Nondeterministic tool call order | Expected; logged | None | Recorded in events | T-E-28 |

---

## Frontend

| Case | Detection | User Feedback | Fallback | Test |
|---|---|---|---|---|
| Network disconnect during SSE | EventSource onerror | Amber banner "Connection lost" [Retry] | Reconnect × 3 | T-E-30 |
| Duplicate Run click | Button disabled during run | None (button disabled) | Idempotent | T-E-31 |
| Stale run data after reset | Reset clears local state | None | Clean state | T-E-32 |
| Out-of-order SSE events | sequence_number sort on receive | None | Re-sort before render | T-E-33 |
| Browser hard-refresh | run_id in URL; re-fetch from API | None | GET /api/run/{id}/events | T-E-34 |
| React Flow render failure | Error boundary | "Graph unavailable — event list still active" | Fallback to list-only | T-E-35 |
| Missing event reference in Time Machine | Null check in align algo | "Some events are missing from this run" | EVENT_MISSING marker | T-E-36 |
| Large event trace (>100 events) | Server cap at 100 | "Run truncated at 100 events" | Partial display with notice | T-E-37 |
| Mobile viewport <768px | CSS breakpoint | Graph hidden; event list full-width | Responsive layout | T-E-38 |
| Evidence Report with ERROR run | Verdict check | "⚠ This run ended in an error. Results are incomplete." | INCONCLUSIVE displayed | T-E-39 |
