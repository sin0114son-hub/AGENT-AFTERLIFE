from backend.scenarios.registry import load_scenarios


def test_registry_loads_both_valid_fixtures():
    scenarios = load_scenarios()
    assert set(scenarios) == {'scenario_01_prompt_injection', 'scenario_02_trust_escalation'}
    assert all(s.steps and s.mock_tools for s in scenarios.values())

import pytest
from backend.scenarios.engine import run_scenario


@pytest.mark.parametrize('scenario_id,attack', [
    ('scenario_01_prompt_injection', 'mock_data_exfiltrate'),
    ('scenario_02_trust_escalation', 'mock_config_write'),
])
@pytest.mark.parametrize('mode,expected', [('defended', 'TOOL_CALL_DENIED'), ('undefended', 'TOOL_CALL_EXECUTED')])
def test_attack_outcome_is_policy_driven_and_deterministic(scenario_id, attack, mode, expected):
    scenario = load_scenarios()[scenario_id]
    def run():
        return list(run_scenario(scenario, mode, 'run'))
    events = run()
    attack_events = [e for e in events if e.tool_name == attack]
    assert any(e.event_type == expected for e in attack_events)
    assert not any(e.event_type == ('TOOL_CALL_EXECUTED' if mode == 'defended' else 'TOOL_CALL_DENIED') for e in attack_events)
    assert [(e.event_type, e.tool_name, e.policy_outcome) for e in events] == [(e.event_type, e.tool_name, e.policy_outcome) for e in run()]
    assert 'tool_args' not in events[0].model_dump()


def test_excessive_fixture_stops_with_limit():
    scenario = load_scenarios()['scenario_01_prompt_injection']
    step = scenario.steps[0]
    scenario = scenario.model_copy(update={'steps': [step] * 60})
    events = list(run_scenario(scenario, 'undefended', 'run'))
    assert len(events) <= 100
    assert events[-1].event_type == 'EXECUTION_LIMIT_REACHED'
    assert not any(e.event_type == 'RUN_COMPLETE' for e in events)


def test_mock_execution_does_not_expose_raw_arguments_or_use_external_io(monkeypatch):
    import builtins
    import socket
    import subprocess
    scenario = load_scenarios()['scenario_01_prompt_injection'].model_copy(deep=True)
    scenario.steps[0].tool_call.tool_args = {'private': 'sentinel_raw_argument_987'}
    def forbidden(*args, **kwargs):
        raise AssertionError('external IO attempted')
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    monkeypatch.setattr(subprocess, 'Popen', forbidden)
    monkeypatch.setattr(builtins, 'open', forbidden)
    events = list(run_scenario(scenario, 'undefended', 'run'))
    assert 'sentinel_raw_argument_987' not in ''.join(e.model_dump_json() for e in events)
    assert any(e.event_type == 'TOOL_CALL_EXECUTED' for e in events)
