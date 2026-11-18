"""A bounded illustration of the policy boundary, not an attack detector.

The user's text is hashed and never used as a policy input. Only the chosen
action, the chosen source trust level and the fixed defended policy decide.
"""
import hashlib
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from backend.models import PolicyContext, ToolCallRequest, ToolTier
from backend.policy.engine import POLICY_DEFENDED, POLICY_UNDEFENDED, evaluate

# Tier comes from the server, never from the client.
ACTION_TIERS = {
    'mock_web_search': ToolTier.USER,
    'mock_read_file': ToolTier.USER,
    'mock_data_exfiltrate': ToolTier.ADMIN,
    'mock_config_write': ToolTier.ADMIN,
}
Action = Literal['mock_web_search', 'mock_read_file', 'mock_data_exfiltrate', 'mock_config_write']


class SimulationRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4096, strict=True)
    action: Action = 'mock_data_exfiltrate'
    trust_level: int = Field(default=0, ge=0, le=3, strict=True)

    @field_validator('text')
    @classmethod
    def nonblank(cls, text):
        if not text.strip():
            raise ValueError('Input cannot be blank')
        return text


def simulate(request: SimulationRequest):
    decision = evaluate(PolicyContext(
        actor_id='untrusted_tool_output' if request.trust_level == 0 else f'simulated_source_trust_{request.trust_level}',
        actor_trust_level=request.trust_level,
        tool_call=ToolCallRequest(tool_name=request.action, tool_args={}, proposed_by='simulation'),
        tool_tier=ACTION_TIERS[request.action],
    ), POLICY_DEFENDED)
    return {
        'mode': 'simulated', 'input_role': 'untrusted tool output',
        'input_sha256': hashlib.sha256(request.text.encode('utf-8')).hexdigest(),
        'action': request.action, 'trust_level': request.trust_level,
        'policy_id': POLICY_DEFENDED.policy_id,
        'decision': decision.outcome.value, 'reason': decision.reason_code,
        'evidence': decision.evidence_ref,
        'executed': False,
        'text_affected_decision': False,
        'what_affected_decision': ['proposed action', 'source trust level', 'fixed defended policy'],
        'what_did_not': ['the content of your text'],
        'limitation': 'The decision depends only on the chosen action, trust level and policy. Your text is not inspected, so this is not attack detection or proof of security. A policy ALLOW means the policy would permit the action; nothing is executed.',
    }


def policy_comparison(action: str, trust_level: int = 0):
    """What each fixed policy would decide for one proposed mock action. Nothing is executed."""
    def decide(policy):
        decision = evaluate(PolicyContext(
            actor_id='untrusted_tool_output' if trust_level == 0 else f'simulated_source_trust_{trust_level}',
            actor_trust_level=trust_level,
            tool_call=ToolCallRequest(tool_name=action, tool_args={}, proposed_by='simulation'),
            tool_tier=ACTION_TIERS[action],
        ), policy)
        return {'policy_id': policy.policy_id, 'decision': decision.outcome.value, 'reason': decision.reason_code}
    return {'action': action, 'tier': ACTION_TIERS[action].value, 'trust_level': trust_level,
            'undefended': decide(POLICY_UNDEFENDED), 'defended': decide(POLICY_DEFENDED), 'executed': False}