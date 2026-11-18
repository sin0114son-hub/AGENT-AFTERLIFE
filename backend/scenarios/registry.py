from pathlib import Path
from backend.models import ScenarioDefinition
from backend.policy.engine import get_policy


# The tool whose allow or deny decision is the point of each guided scenario.
# Report and compare both read this one map.
CRITICAL_TOOL = {
    'scenario_01_prompt_injection': 'mock_data_exfiltrate',
    'scenario_02_trust_escalation': 'mock_config_write',
}


def key_decision(events, scenario_id):
    """First executed or denied event of the scenario's critical tool, or None."""
    tool = CRITICAL_TOOL[scenario_id]
    return next((e for e in events if e.tool_name == tool and e.event_type in ('TOOL_CALL_EXECUTED', 'TOOL_CALL_DENIED')), None)


def load_scenarios():
    scenarios = {}
    for path in sorted((Path(__file__).parent / 'fixtures').glob('scenario_*.json')):
        scenario = ScenarioDefinition.model_validate_json(path.read_text(encoding='utf-8'))
        if scenario.scenario_id in scenarios:
            raise ValueError('Duplicate scenario ID')
        tools = {tool.tool_name for tool in scenario.mock_tools}
        if len(tools) != len(scenario.mock_tools) or any(s.tool_call and s.tool_call.tool_name not in tools for s in scenario.steps):
            raise ValueError('Invalid scenario tools')
        get_policy(scenario.defended_policy_id)
        get_policy(scenario.undefended_policy_id)
        scenarios[scenario.scenario_id] = scenario
    if len(scenarios) != 2:
        raise ValueError('Expected two scenario fixtures')
    return scenarios
