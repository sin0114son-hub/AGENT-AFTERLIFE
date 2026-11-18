"""
Agent Afterlife — Pydantic data models (source of truth for schema).
frontend/lib/types.ts MUST be kept in sync with these definitions.
"""

from __future__ import annotations

import hashlib
import json
from enum import Enum
from typing import Any, Literal
from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class EventType(str, Enum):
    TOOL_CALL_PROPOSED = "TOOL_CALL_PROPOSED"
    TOOL_CALL_EXECUTED = "TOOL_CALL_EXECUTED"
    TOOL_CALL_DENIED = "TOOL_CALL_DENIED"
    INJECTION_DETECTED = "INJECTION_DETECTED"
    TRUST_CHECK_FAILED = "TRUST_CHECK_FAILED"
    EXECUTION_LIMIT_REACHED = "EXECUTION_LIMIT_REACHED"
    RUN_COMPLETE = "RUN_COMPLETE"
    RUN_ERROR = "RUN_ERROR"


class PolicyOutcome(str, Enum):
    ALLOW = "ALLOW"
    DENY = "DENY"
    ALLOW_WITH_FLAG = "ALLOW_WITH_FLAG"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"


class RunStatus(str, Enum):
    CREATED = "CREATED"
    RUNNING = "RUNNING"
    COMPLETE = "COMPLETE"
    ERROR = "ERROR"
    TIMEOUT = "TIMEOUT"
    CANCELLED = "CANCELLED"


class PolicyMode(str, Enum):
    DEFENDED = "defended"
    UNDEFENDED = "undefended"


class ToolTier(str, Enum):
    USER = "user"
    ADMIN = "admin"
    SYSTEM = "system"


class SecurityOutcomeCode(str, Enum):
    """9 distinguishable security outcomes. Never collapse to generic SUCCESS/FAIL."""
    ATTACK_NOT_ATTEMPTED = "ATTACK_NOT_ATTEMPTED"
    ATTACK_ATTEMPTED = "ATTACK_ATTEMPTED"
    MODEL_REFUSED = "MODEL_REFUSED"            # Mode B only
    INJECTION_DETECTED = "INJECTION_DETECTED"
    UNAUTHORIZED_ACTION_PROPOSED = "UNAUTHORIZED_ACTION_PROPOSED"
    UNAUTHORIZED_ACTION_DENIED = "UNAUTHORIZED_ACTION_DENIED"
    UNAUTHORIZED_ACTION_EXECUTED = "UNAUTHORIZED_ACTION_EXECUTED"
    EXECUTION_LIMIT_REACHED = "EXECUTION_LIMIT_REACHED"  # NOT a defense
    RUN_ERROR = "RUN_ERROR"                    # NOT a defense


class VerdictCode(str, Enum):
    DEFENDED = "DEFENDED"
    VULNERABLE = "VULNERABLE"
    INCONCLUSIVE = "INCONCLUSIVE"
    ERROR = "ERROR"       # ERROR/TIMEOUT run → NEVER reported as DEFENDED


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class RunRequest(BaseModel):
    """POST /api/run — start a guided (Mode A) scenario run."""
    scenario_id: str = Field(..., min_length=1, max_length=200)
    policy_mode: PolicyMode


class LiveRunRequest(BaseModel):
    """POST /api/run/live — Mode B (P1). Unused in Phase 2A but schema defined."""
    prompt: str = Field(..., min_length=1, max_length=4096)
    scenario_template: str = Field(..., min_length=1, max_length=200)
    policy_mode: PolicyMode


# ---------------------------------------------------------------------------
# Core event model
# ---------------------------------------------------------------------------

class AgentEvent(BaseModel):
    """Canonical audit event. Append-only after insertion."""
    event_id: str = Field(..., description="UUID-v4, globally unique")
    run_id: str = Field(..., description="UUID-v4")
    scenario_id: str
    policy_id: str
    sequence_number: int = Field(..., ge=1, description="Monotonically increasing within run_id")
    timestamp: str = Field(..., description="ISO 8601")
    actor: str = Field(..., description="agent_id | 'system' | tool_name")
    event_type: EventType
    tool_name: str | None = None
    tool_args_hash: str | None = Field(
        None,
        description="SHA-256 of serialized args. Raw args are NEVER stored.",
    )
    policy_outcome: PolicyOutcome | None = None
    policy_reason_code: str | None = None
    content_provenance: str | None = None
    mock_result: dict[str, Any] | None = None
    error: str | None = None
    # Optional. Trust level the policy used for a tool-call decision. Events stored before this
    # field existed do not have it and load as None.
    actor_trust_level: int | None = Field(None, ge=0, le=3)

    @classmethod
    def hash_args(cls, args: dict[str, Any]) -> str:
        """Produce the tool_args_hash from raw arguments (helper, not stored)."""
        serialized = json.dumps(args, sort_keys=True, ensure_ascii=True)
        return hashlib.sha256(serialized.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Tool-call proposal
# ---------------------------------------------------------------------------

class ToolCallRequest(BaseModel):
    """A tool call proposed by the agent (Mode A: fixture-driven; Mode B: LLM)."""
    tool_name: str = Field(..., min_length=1, max_length=100)
    tool_args: dict[str, Any] = Field(default_factory=dict)
    proposed_by: str = Field(..., description="agent_id or 'fixture'")

    @property
    def args_hash(self) -> str:
        return AgentEvent.hash_args(self.tool_args)


# ---------------------------------------------------------------------------
# Policy engine types
# ---------------------------------------------------------------------------

class ContentProvenance(BaseModel):
    """Provenance tag attached to every piece of ingested content (INV-12)."""
    content_id: str
    source_type: Literal["user_input", "tool_output", "system_fixture", "memory"]
    trust_level: int = Field(..., ge=0, le=3, description="0=untrusted … 3=system")
    origin_label: str
    ingested_at: str
    content_hash: str


class PolicyContext(BaseModel):
    """
    Full context evaluated by PolicyEngine.evaluate().
    Pure inputs only — no I/O, no randomness inside the engine.
    """
    actor_id: str
    actor_trust_level: int = Field(..., ge=0, le=3)
    tool_call: ToolCallRequest
    tool_tier: ToolTier
    content_provenance: ContentProvenance | None = None
    injection_flags: list[str] = Field(default_factory=list)
    runtime_limits_ok: bool = True  # False if any runtime limit already exceeded


class PolicyDecision(BaseModel):
    """Output of PolicyEngine.evaluate() — pure data, no side effects."""
    outcome: PolicyOutcome
    reason_code: str = Field(..., description="Machine-readable, stable identifier")
    evidence_ref: str = Field(default="", description="Pointer to audit event or rule")
    evaluated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    @model_validator(mode="after")
    def deny_must_have_reason(self) -> "PolicyDecision":
        if self.outcome == PolicyOutcome.DENY and not self.reason_code:
            raise ValueError("DENY decision requires a non-empty reason_code")
        return self


# ---------------------------------------------------------------------------
# Scenario definition
# ---------------------------------------------------------------------------

class MockToolConfig(BaseModel):
    """Mock tool definition embedded in a scenario fixture."""
    tool_name: str
    tier: ToolTier
    fixture_response: dict[str, Any]
    side_effects: list[str] = Field(default_factory=list)


class ScenarioStep(BaseModel):
    """One step in a deterministic scenario (Mode A)."""
    step_number: int = Field(..., ge=1)
    description: str
    actor: str
    tool_call: ToolCallRequest | None = None
    expected_event_type: EventType
    # trust_level override for this step (uses scenario default if None)
    actor_trust_level: int | None = Field(None, ge=0, le=3)
    content_provenance_source_type: str | None = None
    injection_flags: list[str] = Field(default_factory=list)


class ScenarioDefinition(BaseModel):
    """Complete scenario fixture — read-only after server startup (INV-15)."""
    scenario_id: str
    version: str = Field(..., pattern=r"^\d+\.\d+\.\d+$")
    name: str
    description: str
    attack_category: str  # e.g. "AT-01"
    supported_modes: list[Literal["guided", "live"]]
    legitimate_objective: str
    attacker_controlled_surface: str
    mock_tools: list[MockToolConfig]
    steps: list[ScenarioStep]
    # Policy configs (inline — resolved from policy/*.json files at load time)
    undefended_policy_id: str
    defended_policy_id: str
    # Success condition for verdict (described declaratively)
    defended_success_condition: str
    vulnerable_success_condition: str

    @field_validator("steps")
    @classmethod
    def steps_must_be_ordered(cls, v: list[ScenarioStep]) -> list[ScenarioStep]:
        for i, step in enumerate(v):
            if step.step_number != i + 1:
                raise ValueError(
                    f"Step {i} has step_number={step.step_number}, expected {i + 1}"
                )
        return v


# ---------------------------------------------------------------------------
# Security outcome / report
# ---------------------------------------------------------------------------

class SecurityOutcome(BaseModel):
    """High-level security outcome attached to a completed run."""
    run_id: str
    scenario_id: str
    policy_mode: PolicyMode
    outcome_code: SecurityOutcomeCode
    verdict: VerdictCode
    verdict_evidence: str
    # Tallies (never collapsed to a single boolean)
    tool_calls_proposed: int = 0
    tool_calls_allowed: int = 0
    tool_calls_denied: int = 0
    injections_detected: int = 0
    trust_violations: int = 0
    execution_errors: int = 0
    timeouts: int = 0

    @model_validator(mode="after")
    def error_timeout_never_defended(self) -> "SecurityOutcome":
        """INV-08: ERROR or TIMEOUT run MUST NOT have verdict DEFENDED."""
        blocked = {SecurityOutcomeCode.EXECUTION_LIMIT_REACHED, SecurityOutcomeCode.RUN_ERROR}
        if self.outcome_code in blocked and self.verdict == VerdictCode.DEFENDED:
            raise ValueError(
                f"outcome_code={self.outcome_code} MUST NOT produce verdict=DEFENDED (INV-08)"
            )
        return self
