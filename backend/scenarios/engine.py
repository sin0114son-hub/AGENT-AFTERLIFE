import time
from datetime import datetime, timezone
from uuid import uuid4
from backend.models import AgentEvent, EventType, PolicyContext, PolicyOutcome
from backend.policy.engine import evaluate, get_policy

# Hard upper bound enforced server-side.
MAX_TIMEOUT_SECS = 300.0
DEFAULT_TIMEOUT_SECS = 30.0
MAX_STEPS = 100


def _make_limit_event(template: AgentEvent) -> AgentEvent:
    """Return an EXECUTION_LIMIT_REACHED event derived from *template*."""
    return template.model_copy(update={
        "event_type": EventType.EXECUTION_LIMIT_REACHED,
        "actor": "system",
        "tool_name": None,
        "tool_args_hash": None,
        "policy_outcome": None,
        "policy_reason_code": None,
        "content_provenance": None,
        "mock_result": None,
        "actor_trust_level": None,
        "error": "execution limit reached",
    })


def _run_scenario(scenario, mode, run_id, *, start: float, timeout_secs: float):
    """
    Inner generator.  Yields AgentEvent objects.
    Checks elapsed wall-clock time at every step boundary using a monotonic
    clock; never marks timeout as DEFENDED (INV-08).
    """
    policy = get_policy(scenario.defended_policy_id if mode == 'defended' else scenario.undefended_policy_id)
    tools = {tool.tool_name: tool for tool in scenario.mock_tools}
    sequence = 0

    def event(event_type, actor, **kwargs):
        nonlocal sequence
        sequence += 1
        return AgentEvent(
            event_id=str(uuid4()), run_id=run_id, scenario_id=scenario.scenario_id,
            policy_id=policy.policy_id, sequence_number=sequence,
            timestamp=datetime.now(timezone.utc).isoformat(), actor=actor,
            event_type=event_type, **kwargs,
        )

    for step in scenario.steps:
        # --- timeout boundary check (monotonic, before each step) ---
        elapsed = time.monotonic() - start
        if elapsed >= timeout_secs:
            # Emit a synthetic placeholder so the limit event has a valid
            # sequence number; never execute mock tools after timeout.
            placeholder = event(EventType.EXECUTION_LIMIT_REACHED, 'system',
                                error=f'timeout after {elapsed:.2f}s')
            yield placeholder
            return

        if step.expected_event_type == EventType.TOOL_CALL_PROPOSED:
            call = step.tool_call
            tool = tools[call.tool_name]
            common = dict(tool_name=call.tool_name, tool_args_hash=call.args_hash,
                          content_provenance=step.content_provenance_source_type,
                          actor_trust_level=step.actor_trust_level)
            yield event(EventType.TOOL_CALL_PROPOSED, step.actor, **common)
            decision = evaluate(PolicyContext(
                actor_id=step.actor,
                actor_trust_level=step.actor_trust_level,
                tool_call=call, tool_tier=tool.tier,
                injection_flags=step.injection_flags,
            ), policy)
            if decision.outcome in (PolicyOutcome.ALLOW, PolicyOutcome.ALLOW_WITH_FLAG):
                yield event(EventType.TOOL_CALL_EXECUTED, call.tool_name, **common,
                            policy_outcome=decision.outcome, policy_reason_code=decision.reason_code,
                            mock_result=tool.fixture_response.copy())
            else:
                yield event(EventType.TOOL_CALL_DENIED, 'system', **common,
                            policy_outcome=decision.outcome, policy_reason_code=decision.reason_code)
        elif step.expected_event_type == EventType.INJECTION_DETECTED and mode == 'defended':
            yield event(EventType.INJECTION_DETECTED, 'system',
                        content_provenance=step.content_provenance_source_type)
        elif step.expected_event_type == EventType.RUN_COMPLETE:
            yield event(EventType.RUN_COMPLETE, 'system')


def run_scenario(scenario, mode, run_id, *, timeout_secs: float = DEFAULT_TIMEOUT_SECS):
    """
    Public generator wrapper.
    Enforces MAX_STEPS (step counter) and timeout_secs (elapsed wall-clock).
    Both produce EXECUTION_LIMIT_REACHED — never DEFENDED (INV-08).
    timeout_secs is clamped to MAX_TIMEOUT_SECS.
    """
    effective_timeout = min(float(timeout_secs), MAX_TIMEOUT_SECS)
    start = time.monotonic()

    for ev in _run_scenario(scenario, mode, run_id, start=start, timeout_secs=effective_timeout):
        # Step-count hard limit (unchanged from Phase 2B baseline).
        if ev.sequence_number >= MAX_STEPS and ev.event_type != EventType.RUN_COMPLETE:
            yield _make_limit_event(ev)
            return
        yield ev
