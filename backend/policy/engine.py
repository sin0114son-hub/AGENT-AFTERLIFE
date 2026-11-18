"""
Agent Afterlife — Policy Engine (pure function, server-side).

Design rules (INV-01 through INV-03):
  - evaluate() is a pure function: same inputs → same output, always.
  - No external I/O, no network calls, no database access inside this module.
  - No mutable global state.
  - LLM is NEVER the sole authority for allow/deny.
  - Deny-by-default for sensitive (admin/system) operations.

A ALLOW decision does NOT mean a tool was executed.
Execution is a separate, later step handled by the scenario engine.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.models import (
    PolicyContext,
    PolicyDecision,
    PolicyOutcome,
    ToolTier,
)


# ---------------------------------------------------------------------------
# Reason codes (machine-readable, stable)
# ---------------------------------------------------------------------------

class ReasonCode:
    # Allow reasons
    PERMITTED_USER_TOOL = "PERMITTED_USER_TOOL"
    PERMITTED_SERVICE_TOOL = "PERMITTED_SERVICE_TOOL"
    PERMITTED_SYSTEM = "PERMITTED_SYSTEM_ACTOR"
    ALLOW_WITH_FLAG_ADMIN = "ALLOW_WITH_FLAG_ADMIN_TIER"

    # Deny reasons
    UNTRUSTED_ACTOR = "UNTRUSTED_ACTOR"           # trust_level == 0
    TRUST_LEVEL_INSUFFICIENT = "TRUST_LEVEL_INSUFFICIENT"  # user → admin tool
    INJECTION_FLAGGED = "INJECTION_FLAGGED"        # Layer 2 flag present
    RUNTIME_LIMIT_EXCEEDED = "RUNTIME_LIMIT_EXCEEDED"
    TOOL_NOT_IN_ALLOWLIST = "TOOL_NOT_IN_ALLOWLIST"
    UNDEFENDED_POLICY_ALLOW = "UNDEFENDED_POLICY_NO_CHECK"  # intentionally vulnerable


# ---------------------------------------------------------------------------
# Policy configuration (resolved from JSON fixture at startup)
# ---------------------------------------------------------------------------

class PolicyConfig:
    """
    Immutable policy configuration loaded from a fixture file.
    Passed into evaluate() — never stored as global state.
    """

    def __init__(
        self,
        policy_id: str,
        enforce_trust_levels: bool,
        enforce_injection_detection: bool,
        allowed_tools: list[str] | None,       # None = all tools allowed
        admin_tools: list[str] | None = None,  # tools that require trust >= 2
    ) -> None:
        self.policy_id = policy_id
        self.enforce_trust_levels = enforce_trust_levels
        self.enforce_injection_detection = enforce_injection_detection
        # Freeze to prevent runtime mutation
        self.allowed_tools: frozenset[str] | None = (
            frozenset(allowed_tools) if allowed_tools is not None else None
        )
        self.admin_tools: frozenset[str] = frozenset(admin_tools or [])


# ---------------------------------------------------------------------------
# Pre-built policy instances (mirrors policy/*.json files)
# ---------------------------------------------------------------------------

POLICY_UNDEFENDED = PolicyConfig(
    policy_id="policy_undefended_v1",
    enforce_trust_levels=False,    # vulnerable: no trust checks
    enforce_injection_detection=False,  # vulnerable: no injection detection
    allowed_tools=None,            # all tools permitted
    admin_tools=[],
)

POLICY_DEFENDED = PolicyConfig(
    policy_id="policy_defended_v1",
    enforce_trust_levels=True,
    enforce_injection_detection=True,
    allowed_tools=["mock_web_search", "mock_read_file", "mock_read_config"],   # explicit allowlist (user-tier, read-only tools)
    admin_tools=["mock_data_exfiltrate", "mock_config_write"],  # requires trust >= 2
)

POLICY_REGISTRY: dict[str, PolicyConfig] = {
    POLICY_UNDEFENDED.policy_id: POLICY_UNDEFENDED,
    POLICY_DEFENDED.policy_id: POLICY_DEFENDED,
}


# ---------------------------------------------------------------------------
# Core pure function
# ---------------------------------------------------------------------------

def evaluate(
    ctx: PolicyContext,
    policy: PolicyConfig,
) -> PolicyDecision:
    """
    Pure policy evaluation function.

    Invariants upheld here:
      INV-02: Same (ctx, policy) → same PolicyDecision. No I/O, no randomness.
      INV-03: Called independently of LLM; LLM never bypasses this.
      INV-13: trust_level=0 → DENY for any tool, any tier.

    Returns PolicyDecision — does NOT execute the tool.
    """
    now = datetime.now(timezone.utc).isoformat()

    # --- Gate 0: runtime limits already exceeded ---
    if not ctx.runtime_limits_ok:
        return PolicyDecision(
            outcome=PolicyOutcome.DENY,
            reason_code=ReasonCode.RUNTIME_LIMIT_EXCEEDED,
            evidence_ref="ctx.runtime_limits_ok=False",
            evaluated_at=now,
        )

    # --- Gate 1: injection detection (Layer 2) ---
    if policy.enforce_injection_detection and ctx.injection_flags:
        return PolicyDecision(
            outcome=PolicyOutcome.DENY,
            reason_code=ReasonCode.INJECTION_FLAGGED,
            evidence_ref=f"flags={ctx.injection_flags}",
            evaluated_at=now,
        )

    tool_name = ctx.tool_call.tool_name
    trust = ctx.actor_trust_level
    tier = ctx.tool_tier

    # --- UNDEFENDED PATH: skip all trust checks ---
    if not policy.enforce_trust_levels:
        return PolicyDecision(
            outcome=PolicyOutcome.ALLOW,
            reason_code=ReasonCode.UNDEFENDED_POLICY_ALLOW,
            evidence_ref=f"policy={policy.policy_id}",
            evaluated_at=now,
        )

    # --- Gate 2: absolute deny for untrusted actors (INV-13) ---
    if trust == 0:
        return PolicyDecision(
            outcome=PolicyOutcome.DENY,
            reason_code=ReasonCode.UNTRUSTED_ACTOR,
            evidence_ref=f"actor={ctx.actor_id} trust_level=0",
            evaluated_at=now,
        )

    # --- Gate 3: tool allowlist ---
    if policy.allowed_tools is not None and tool_name not in policy.allowed_tools:
        # Tool not in explicit allowlist → check if it's admin-tier
        if tool_name not in policy.admin_tools:
            return PolicyDecision(
                outcome=PolicyOutcome.DENY,
                reason_code=ReasonCode.TOOL_NOT_IN_ALLOWLIST,
                evidence_ref=f"tool={tool_name} not in allowed_tools",
                evaluated_at=now,
            )

    # --- Gate 4: trust-level vs tool tier ---
    if tier == ToolTier.ADMIN:
        if trust < 2:
            return PolicyDecision(
                outcome=PolicyOutcome.DENY,
                reason_code=ReasonCode.TRUST_LEVEL_INSUFFICIENT,
                evidence_ref=f"tool={tool_name} tier=admin trust={trust} required>=2",
                evaluated_at=now,
            )
        if trust == 2:
            # Service-level actor: allow but flag for audit
            return PolicyDecision(
                outcome=PolicyOutcome.ALLOW_WITH_FLAG,
                reason_code=ReasonCode.ALLOW_WITH_FLAG_ADMIN,
                evidence_ref=f"tool={tool_name} tier=admin trust={trust}",
                evaluated_at=now,
            )
        # trust == 3 (system): fall through to ALLOW

    if tier == ToolTier.SYSTEM and trust < 3:
        return PolicyDecision(
            outcome=PolicyOutcome.DENY,
            reason_code=ReasonCode.TRUST_LEVEL_INSUFFICIENT,
            evidence_ref=f"tool={tool_name} tier=system trust={trust} required=3",
            evaluated_at=now,
        )

    # --- All gates passed ---
    reason = (
        ReasonCode.PERMITTED_USER_TOOL if trust == 1
        else ReasonCode.PERMITTED_SERVICE_TOOL if trust == 2
        else ReasonCode.PERMITTED_SYSTEM
    )
    return PolicyDecision(
        outcome=PolicyOutcome.ALLOW,
        reason_code=reason,
        evidence_ref=f"tool={tool_name} tier={tier} trust={trust}",
        evaluated_at=now,
    )


# ---------------------------------------------------------------------------
# Convenience: build a PolicyConfig by policy_id string
# ---------------------------------------------------------------------------

def get_policy(policy_id: str) -> PolicyConfig:
    """Retrieve a registered PolicyConfig by id. Raises KeyError if not found."""
    return POLICY_REGISTRY[policy_id]
