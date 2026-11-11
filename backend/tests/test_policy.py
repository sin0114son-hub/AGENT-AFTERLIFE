"""
Agent Afterlife — Backend unit tests: Policy Engine
Implements T-U-01 through T-U-04 from TEST_BASELINE.md
plus additional invariant tests (INV-02, INV-13, INV-14-related).

Run: python -m pytest backend/tests/test_policy.py -v
"""

import json
import pytest

from backend.models import (
    ContentProvenance,
    PolicyContext,
    PolicyDecision,
    PolicyOutcome,
    SecurityOutcome,
    SecurityOutcomeCode,
    ToolCallRequest,
    ToolTier,
    VerdictCode,
    AgentEvent,
    EventType,
    RunStatus,
)
from backend.policy.engine import (
    POLICY_DEFENDED,
    POLICY_UNDEFENDED,
    ReasonCode,
    evaluate,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ctx(
    tool_name: str,
    tier: ToolTier,
    trust_level: int = 1,
    injection_flags: list[str] | None = None,
    runtime_limits_ok: bool = True,
) -> PolicyContext:
    return PolicyContext(
        actor_id="test_agent",
        actor_trust_level=trust_level,
        tool_call=ToolCallRequest(
            tool_name=tool_name,
            tool_args={"key": "value"},
            proposed_by="fixture",
        ),
        tool_tier=tier,
        injection_flags=injection_flags or [],
        runtime_limits_ok=runtime_limits_ok,
    )


# ---------------------------------------------------------------------------
# T-U-01: AT-01 undefended → data_exfiltrate ALLOWED
# ---------------------------------------------------------------------------

class TestTU01:
    """T-U-01: Policy engine — T-1 undefended → data_exfiltrate ALLOWED."""

    def test_data_exfiltrate_allowed_in_undefended_mode(self) -> None:
        ctx = _make_ctx("mock_data_exfiltrate", ToolTier.ADMIN, trust_level=1)
        decision = evaluate(ctx, POLICY_UNDEFENDED)
        assert decision.outcome == PolicyOutcome.ALLOW, (
            f"Undefended policy MUST allow data_exfiltrate; got {decision.outcome} "
            f"reason={decision.reason_code}"
        )

    def test_undefended_ignores_injection_flags(self) -> None:
        """Undefended policy does not apply injection detection."""
        ctx = _make_ctx(
            "mock_data_exfiltrate",
            ToolTier.ADMIN,
            trust_level=1,
            injection_flags=["KNOWN_INJECTION_PATTERN"],
        )
        decision = evaluate(ctx, POLICY_UNDEFENDED)
        assert decision.outcome == PolicyOutcome.ALLOW

    def test_undefended_policy_id_in_evidence(self) -> None:
        ctx = _make_ctx("mock_data_exfiltrate", ToolTier.ADMIN, trust_level=1)
        decision = evaluate(ctx, POLICY_UNDEFENDED)
        assert POLICY_UNDEFENDED.policy_id in decision.evidence_ref


# ---------------------------------------------------------------------------
# T-U-02: AT-01 defended → data_exfiltrate BLOCKED
# ---------------------------------------------------------------------------

class TestTU02:
    """T-U-02: Policy engine — T-1 defended → data_exfiltrate BLOCKED."""

    def test_data_exfiltrate_denied_in_defended_mode_with_injection(self) -> None:
        """Injection flag + admin tool + user trust → DENY."""
        ctx = _make_ctx(
            "mock_data_exfiltrate",
            ToolTier.ADMIN,
            trust_level=1,
            injection_flags=["IMPERATIVE_VERB_IN_TOOL_OUTPUT", "KNOWN_INJECTION_PATTERN"],
        )
        decision = evaluate(ctx, POLICY_DEFENDED)
        assert decision.outcome == PolicyOutcome.DENY
        assert decision.reason_code == ReasonCode.INJECTION_FLAGGED

    def test_data_exfiltrate_denied_without_injection_due_to_trust(self) -> None:
        """Even without injection flags: user-tier actor (trust=1) cannot call admin tool."""
        ctx = _make_ctx("mock_data_exfiltrate", ToolTier.ADMIN, trust_level=1)
        decision = evaluate(ctx, POLICY_DEFENDED)
        assert decision.outcome == PolicyOutcome.DENY
        assert decision.reason_code == ReasonCode.TRUST_LEVEL_INSUFFICIENT

    def test_data_exfiltrate_denied_untrusted_actor(self) -> None:
        """INV-13: trust_level=0 → DENY for ANY tool, ANY tier."""
        ctx = _make_ctx("mock_data_exfiltrate", ToolTier.ADMIN, trust_level=0)
        decision = evaluate(ctx, POLICY_DEFENDED)
        assert decision.outcome == PolicyOutcome.DENY
        assert decision.reason_code == ReasonCode.UNTRUSTED_ACTOR


# ---------------------------------------------------------------------------
# T-U-03: AT-02 undefended → config_write SUCCESS
# ---------------------------------------------------------------------------

class TestTU03:
    """T-U-03: Policy engine — T-2 undefended → config_write ALLOWED."""

    def test_config_write_allowed_in_undefended_mode(self) -> None:
        ctx = _make_ctx("mock_config_write", ToolTier.ADMIN, trust_level=1)
        decision = evaluate(ctx, POLICY_UNDEFENDED)
        assert decision.outcome == PolicyOutcome.ALLOW

    def test_config_write_allowed_does_not_mean_executed(self) -> None:
        """
        ALLOW decision is a data object only.
        No tool execution happens inside evaluate().
        Verifies separation of policy decision from tool execution.
        """
        ctx = _make_ctx("mock_config_write", ToolTier.ADMIN, trust_level=1)
        decision = evaluate(ctx, POLICY_UNDEFENDED)
        # PolicyDecision is a Pydantic model — no side effects, no I/O
        assert isinstance(decision, PolicyDecision)
        assert decision.outcome == PolicyOutcome.ALLOW


# ---------------------------------------------------------------------------
# T-U-04: AT-02 defended → config_write DENIED
# ---------------------------------------------------------------------------

class TestTU04:
    """T-U-04: Policy engine — T-2 defended → config_write DENIED."""

    def test_config_write_denied_for_user_trust(self) -> None:
        ctx = _make_ctx("mock_config_write", ToolTier.ADMIN, trust_level=1)
        decision = evaluate(ctx, POLICY_DEFENDED)
        assert decision.outcome == PolicyOutcome.DENY
        assert decision.reason_code == ReasonCode.TRUST_LEVEL_INSUFFICIENT

    def test_config_write_allowed_with_flag_for_service_trust(self) -> None:
        """Service-level actor (trust=2) on admin tool → ALLOW_WITH_FLAG, not DENY."""
        ctx = _make_ctx("mock_config_write", ToolTier.ADMIN, trust_level=2)
        decision = evaluate(ctx, POLICY_DEFENDED)
        assert decision.outcome == PolicyOutcome.ALLOW_WITH_FLAG
        assert decision.reason_code == ReasonCode.ALLOW_WITH_FLAG_ADMIN

    def test_config_write_allowed_for_system_actor(self) -> None:
        """System-level actor (trust=3) on admin tool → ALLOW."""
        ctx = _make_ctx("mock_config_write", ToolTier.ADMIN, trust_level=3)
        decision = evaluate(ctx, POLICY_DEFENDED)
        assert decision.outcome == PolicyOutcome.ALLOW


# ---------------------------------------------------------------------------
# INV-02: Determinism — same inputs always produce same output
# ---------------------------------------------------------------------------

class TestINV02Determinism:
    """INV-02: evaluate() is a pure function — deterministic."""

    def test_same_inputs_same_output_defended(self) -> None:
        ctx = _make_ctx("mock_data_exfiltrate", ToolTier.ADMIN, trust_level=1)
        results = [evaluate(ctx, POLICY_DEFENDED) for _ in range(10)]
        outcomes = {r.outcome for r in results}
        reason_codes = {r.reason_code for r in results}
        assert len(outcomes) == 1, f"Non-deterministic outcome: {outcomes}"
        assert len(reason_codes) == 1, f"Non-deterministic reason_code: {reason_codes}"

    def test_same_inputs_same_output_undefended(self) -> None:
        ctx = _make_ctx("mock_data_exfiltrate", ToolTier.ADMIN, trust_level=1)
        results = [evaluate(ctx, POLICY_UNDEFENDED) for _ in range(10)]
        outcomes = {r.outcome for r in results}
        assert len(outcomes) == 1


# ---------------------------------------------------------------------------
# INV-13: trust_level=0 → DENY for all tools in defended mode
# ---------------------------------------------------------------------------

class TestINV13UntrustedActorAlwaysDenied:
    """INV-13: trust_level=0 → DENY for ANY admin-tier tool."""

    @pytest.mark.parametrize("tool_name", [
        "mock_data_exfiltrate",
        "mock_config_write",
        "any_other_admin_tool",
    ])
    def test_untrusted_always_denied_defended(self, tool_name: str) -> None:
        ctx = _make_ctx(tool_name, ToolTier.ADMIN, trust_level=0)
        decision = evaluate(ctx, POLICY_DEFENDED)
        assert decision.outcome == PolicyOutcome.DENY
        assert decision.reason_code == ReasonCode.UNTRUSTED_ACTOR

    def test_untrusted_user_tool_also_denied(self) -> None:
        ctx = _make_ctx("mock_web_search", ToolTier.USER, trust_level=0)
        decision = evaluate(ctx, POLICY_DEFENDED)
        assert decision.outcome == PolicyOutcome.DENY
        assert decision.reason_code == ReasonCode.UNTRUSTED_ACTOR


# ---------------------------------------------------------------------------
# INV-02 / Edge: runtime limit → DENY
# ---------------------------------------------------------------------------

class TestRuntimeLimitDeny:
    def test_runtime_limit_exceeded_produces_deny(self) -> None:
        ctx = _make_ctx(
            "mock_web_search", ToolTier.USER, trust_level=1, runtime_limits_ok=False
        )
        decision = evaluate(ctx, POLICY_DEFENDED)
        assert decision.outcome == PolicyOutcome.DENY
        assert decision.reason_code == ReasonCode.RUNTIME_LIMIT_EXCEEDED

    def test_runtime_limit_in_undefended_also_denies(self) -> None:
        """Runtime limits take priority over all policy modes."""
        ctx = _make_ctx(
            "mock_data_exfiltrate", ToolTier.ADMIN, trust_level=1, runtime_limits_ok=False
        )
        decision = evaluate(ctx, POLICY_UNDEFENDED)
        assert decision.outcome == PolicyOutcome.DENY


# ---------------------------------------------------------------------------
# INV-08: ERROR/TIMEOUT run MUST NOT have verdict DEFENDED
# ---------------------------------------------------------------------------

class TestINV08ErrorNeverDefended:
    def test_execution_limit_outcome_refuses_defended_verdict(self) -> None:
        with pytest.raises(Exception):
            SecurityOutcome(
                run_id="test-run",
                scenario_id="scenario_01_prompt_injection",
                policy_mode="defended",  # type: ignore[arg-type]
                outcome_code=SecurityOutcomeCode.EXECUTION_LIMIT_REACHED,
                verdict=VerdictCode.DEFENDED,   # <- MUST raise
                verdict_evidence="timeout is not a defense",
            )

    def test_run_error_outcome_refuses_defended_verdict(self) -> None:
        with pytest.raises(Exception):
            SecurityOutcome(
                run_id="test-run",
                scenario_id="scenario_01_prompt_injection",
                policy_mode="defended",  # type: ignore[arg-type]
                outcome_code=SecurityOutcomeCode.RUN_ERROR,
                verdict=VerdictCode.DEFENDED,   # <- MUST raise
                verdict_evidence="errors are not defenses",
            )

    def test_error_outcome_allows_error_verdict(self) -> None:
        outcome = SecurityOutcome(
            run_id="test-run",
            scenario_id="scenario_01_prompt_injection",
            policy_mode="defended",  # type: ignore[arg-type]
            outcome_code=SecurityOutcomeCode.RUN_ERROR,
            verdict=VerdictCode.ERROR,
            verdict_evidence="backend exception at step 3",
        )
        assert outcome.verdict == VerdictCode.ERROR


# ---------------------------------------------------------------------------
# Schema: AgentEvent tool_args_hash
# ---------------------------------------------------------------------------

class TestAgentEventSchema:
    def test_args_hash_is_sha256(self) -> None:
        args = {"target": "all_data", "destination": "synthetic"}
        digest = AgentEvent.hash_args(args)
        assert len(digest) == 64
        assert all(c in "0123456789abcdef" for c in digest)

    def test_args_hash_is_deterministic(self) -> None:
        args = {"b": 2, "a": 1}
        h1 = AgentEvent.hash_args(args)
        h2 = AgentEvent.hash_args(args)
        assert h1 == h2

    def test_args_hash_different_args_differ(self) -> None:
        h1 = AgentEvent.hash_args({"a": 1})
        h2 = AgentEvent.hash_args({"a": 2})
        assert h1 != h2


# ---------------------------------------------------------------------------
# Schema: PolicyDecision DENY requires reason_code
# ---------------------------------------------------------------------------

class TestPolicyDecisionValidation:
    def test_deny_without_reason_code_raises(self) -> None:
        with pytest.raises(Exception):
            PolicyDecision(
                outcome=PolicyOutcome.DENY,
                reason_code="",  # empty string → validator should catch
            )

    def test_allow_decision_is_valid(self) -> None:
        d = PolicyDecision(
            outcome=PolicyOutcome.ALLOW,
            reason_code=ReasonCode.PERMITTED_USER_TOOL,
        )
        assert d.outcome == PolicyOutcome.ALLOW
