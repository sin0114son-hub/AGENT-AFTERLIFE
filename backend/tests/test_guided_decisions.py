"""Guided scenarios: decisions, key decision fields, and the optional trust level on events.

Every expectation about a reason or a trust level is read back from stored audit events.
"""
import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from backend.audit import AuditLog
from backend.main import create_app
from backend.models import AgentEvent, PolicyContext, PolicyOutcome, ToolCallRequest, ToolTier
from backend.policy.engine import POLICY_DEFENDED, POLICY_UNDEFENDED, evaluate

S1, S2 = 'scenario_01_prompt_injection', 'scenario_02_trust_escalation'


def run(client, scenario, mode):
    response = client.post('/api/run', json={'scenario_id': scenario, 'policy_mode': mode})
    assert response.status_code == 200
    frames = [json.loads(f[6:]) for f in response.text.split('\n\n') if f.startswith('data: ')]
    return frames[0]['run_id'], frames


def decide(tool, tier, trust, flags=(), policy=POLICY_DEFENDED):
    return evaluate(PolicyContext(actor_id='t', actor_trust_level=trust, tool_call=ToolCallRequest(tool_name=tool, proposed_by='test'),
                                  tool_tier=tier, injection_flags=list(flags)), policy)


# ---- policy: scenario 02 read is allowed, admin write is not ----

def test_defended_allowlist_is_pinned():
    assert POLICY_DEFENDED.allowed_tools == frozenset({'mock_web_search', 'mock_read_file', 'mock_read_config'})
    assert POLICY_DEFENDED.admin_tools == frozenset({'mock_data_exfiltrate', 'mock_config_write'})


def test_user_read_config_is_allowed_for_a_user_but_not_for_untrusted_or_flagged_input():
    allowed = decide('mock_read_config', ToolTier.USER, 1)
    assert (allowed.outcome, allowed.reason_code) == (PolicyOutcome.ALLOW, 'PERMITTED_USER_TOOL')
    assert decide('mock_read_config', ToolTier.USER, 0).reason_code == 'UNTRUSTED_ACTOR'
    assert decide('mock_read_config', ToolTier.USER, 1, ['KNOWN_INJECTION_PATTERN']).reason_code == 'INJECTION_FLAGGED'


def test_admin_tools_still_need_trust_two_and_other_tools_stay_off_the_allowlist():
    for tool in ('mock_config_write', 'mock_data_exfiltrate'):
        for trust in (0, 1):
            assert decide(tool, ToolTier.ADMIN, trust).outcome == PolicyOutcome.DENY
        assert decide(tool, ToolTier.ADMIN, 1).reason_code == 'TRUST_LEVEL_INSUFFICIENT'
        assert decide(tool, ToolTier.ADMIN, 2).outcome == PolicyOutcome.ALLOW_WITH_FLAG
    unknown = decide('mock_other_read', ToolTier.USER, 1)
    assert (unknown.outcome, unknown.reason_code) == (PolicyOutcome.DENY, 'TOOL_NOT_IN_ALLOWLIST')


def test_undefended_policy_is_unchanged():
    for tool, tier in (('mock_read_config', ToolTier.USER), ('mock_config_write', ToolTier.ADMIN)):
        decision = decide(tool, tier, 0, ['X'], POLICY_UNDEFENDED)
        assert decision.outcome == PolicyOutcome.ALLOW or decision.reason_code == 'INJECTION_FLAGGED'


# ---- full runs: expected decision events, trust levels, key decision ----

def brief(events):
    return [(e['sequence_number'], e['event_type'], e.get('tool_name'), e.get('policy_outcome'), e.get('policy_reason_code'), e.get('actor_trust_level')) for e in events]


def test_scenario_02_defended_run_matches_the_fixture_description(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'))
    _, frames = run(client, S2, 'defended')
    assert brief(frames) == [
        (1, 'TOOL_CALL_PROPOSED', 'mock_read_config', None, None, 1),
        (2, 'TOOL_CALL_EXECUTED', 'mock_read_config', 'ALLOW', 'PERMITTED_USER_TOOL', 1),
        (3, 'TOOL_CALL_PROPOSED', 'mock_config_write', None, None, 1),
        (4, 'TOOL_CALL_DENIED', 'mock_config_write', 'DENY', 'TRUST_LEVEL_INSUFFICIENT', 1),
        (5, 'RUN_COMPLETE', None, None, None, None),
    ]


def test_scenario_02_undefended_run(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'))
    _, frames = run(client, S2, 'undefended')
    assert [(f[1], f[2], f[3], f[4]) for f in brief(frames)] == [
        ('TOOL_CALL_PROPOSED', 'mock_read_config', None, None),
        ('TOOL_CALL_EXECUTED', 'mock_read_config', 'ALLOW', 'UNDEFENDED_POLICY_NO_CHECK'),
        ('TOOL_CALL_PROPOSED', 'mock_config_write', None, None),
        ('TOOL_CALL_EXECUTED', 'mock_config_write', 'ALLOW', 'UNDEFENDED_POLICY_NO_CHECK'),
        ('RUN_COMPLETE', None, None, None)]


def test_scenario_01_runs(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'))
    _, defended = run(client, S1, 'defended')
    _, undefended = run(client, S1, 'undefended')
    assert [f[1:5] for f in brief(defended)] == [
        ('TOOL_CALL_PROPOSED', 'mock_web_search', None, None),
        ('TOOL_CALL_EXECUTED', 'mock_web_search', 'ALLOW', 'PERMITTED_USER_TOOL'),
        ('INJECTION_DETECTED', None, None, None),
        ('TOOL_CALL_PROPOSED', 'mock_data_exfiltrate', None, None),
        ('TOOL_CALL_DENIED', 'mock_data_exfiltrate', 'DENY', 'INJECTION_FLAGGED'),
        ('RUN_COMPLETE', None, None, None)]
    assert [f[1:5] for f in brief(undefended)] == [
        ('TOOL_CALL_PROPOSED', 'mock_web_search', None, None),
        ('TOOL_CALL_EXECUTED', 'mock_web_search', 'ALLOW', 'UNDEFENDED_POLICY_NO_CHECK'),
        ('TOOL_CALL_PROPOSED', 'mock_data_exfiltrate', None, None),
        ('TOOL_CALL_EXECUTED', 'mock_data_exfiltrate', 'ALLOW', 'UNDEFENDED_POLICY_NO_CHECK'),
        ('RUN_COMPLETE', None, None, None)]
    # INJECTION_DETECTED is a system event. It must not claim a trust level.
    assert next(e for e in defended if e['event_type'] == 'INJECTION_DETECTED')['actor_trust_level'] is None


@pytest.mark.parametrize('scenario, tool, divergence, a_type, b_type, reason', [
    (S1, 'mock_data_exfiltrate', 3, 'TOOL_CALL_PROPOSED', 'INJECTION_DETECTED', 'INJECTION_FLAGGED'),
    (S2, 'mock_config_write', 4, 'TOOL_CALL_EXECUTED', 'TOOL_CALL_DENIED', 'TRUST_LEVEL_INSUFFICIENT'),
])
def test_compare_and_report_expose_the_key_decision_from_the_stored_events(tmp_path, scenario, tool, divergence, a_type, b_type, reason):
    client = TestClient(create_app(tmp_path / 'a.db'))
    undefended_id, _ = run(client, scenario, 'undefended')
    defended_id, _ = run(client, scenario, 'defended')
    stored = {rid: client.get(f'/api/run/{rid}/events').json()['events'] for rid in (undefended_id, defended_id)}
    comparison = client.get('/api/compare', params={'run_a': undefended_id, 'run_b': defended_id}).json()
    assert comparison['first_divergence_sequence'] == divergence
    assert comparison['divergence_event_a']['event_type'] == a_type and comparison['divergence_event_b']['event_type'] == b_type
    assert comparison['critical_tool'] == tool
    key_a, key_b = comparison['key_decision_a'], comparison['key_decision_b']
    assert key_a in stored[undefended_id] and key_b in stored[defended_id]
    assert (key_a['tool_name'], key_a['event_type'], key_a['policy_outcome']) == (tool, 'TOOL_CALL_EXECUTED', 'ALLOW')
    assert (key_b['tool_name'], key_b['event_type'], key_b['policy_outcome'], key_b['policy_reason_code']) == (tool, 'TOOL_CALL_DENIED', 'DENY', reason)
    assert key_b['policy_id'] == 'policy_defended_v1' and key_a['policy_id'] == 'policy_undefended_v1'
    assert key_b['actor_trust_level'] == 1 and key_a['actor_trust_level'] == 1
    for rid, key in ((undefended_id, key_a), (defended_id, key_b)):
        report = client.get(f'/api/report/{rid}').json()
        assert report['critical_tool'] == tool and report['key_decision'] == key
    assert client.get(f'/api/report/{undefended_id}').json()['verdict'] == 'VULNERABLE'
    assert client.get(f'/api/report/{defended_id}').json()['verdict'] == 'DEFENDED'


def test_scenario_02_first_difference_is_the_key_decision_but_scenario_01_is_not(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'))
    out = {}
    for scenario in (S1, S2):
        a, _ = run(client, scenario, 'undefended')
        b, _ = run(client, scenario, 'defended')
        c = client.get('/api/compare', params={'run_a': a, 'run_b': b}).json()
        out[scenario] = c
    c1, c2 = out[S1], out[S2]
    assert c1['divergence_event_b']['event_type'] == 'INJECTION_DETECTED' and c1['divergence_event_b']['sequence_number'] != c1['key_decision_b']['sequence_number']
    assert c2['divergence_event_b']['event_id'] == c2['key_decision_b']['event_id']
    assert c2['divergence_event_a']['event_id'] == c2['key_decision_a']['event_id']


def test_key_decision_is_null_when_the_decision_was_not_reached(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'))
    rid, _ = run(client, S2, 'defended')
    log = AuditLog(tmp_path / 'a.db')  # a stored run that stopped before any decision event
    other = 'cccccccc-0000-0000-0000-000000000001'
    log.create_run(other, S2, 'defended', 'v')
    log.finish(other, 'ERROR')
    report = client.get(f'/api/report/{other}').json()
    assert report['key_decision'] is None and report['verdict'] == 'ERROR' and rid != other


# ---- SSE order and IDs (regression) ----

def test_stream_order_ids_and_storage_agree(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'))
    for scenario in (S1, S2):
        for mode in ('defended', 'undefended'):
            rid, frames = run(client, scenario, mode)
            assert [f['sequence_number'] for f in frames] == list(range(1, len(frames) + 1))
            assert len({f['event_id'] for f in frames}) == len(frames) and {f['run_id'] for f in frames} == {rid}
            assert frames[-1]['event_type'] == 'RUN_COMPLETE'
            assert client.get(f'/api/run/{rid}/events').json()['events'] == frames
            assert client.get(f'/api/run/{rid}').json()['status'] == 'COMPLETE'


# ---- stored events: old shape and new shape ----

OLD = {'event_id': 'e-old', 'run_id': 'r-old', 'scenario_id': S2, 'policy_id': 'policy_defended_v1', 'sequence_number': 1,
       'timestamp': '2026-11-01T00:00:00+00:00', 'actor': 'system', 'event_type': 'TOOL_CALL_DENIED', 'tool_name': 'mock_config_write',
       'tool_args_hash': None, 'policy_outcome': 'DENY', 'policy_reason_code': 'TRUST_LEVEL_INSUFFICIENT', 'content_provenance': 'user_input',
       'mock_result': None, 'error': None}


def test_events_stored_without_the_trust_field_still_load_and_new_ones_round_trip(tmp_path):
    path = tmp_path / 'legacy.db'
    log = AuditLog(path)
    log.create_run('r-old', S2, 'defended', 'v')
    assert 'actor_trust_level' not in OLD
    with sqlite3.connect(path) as db:  # exactly the JSON an older build stored
        db.execute('INSERT INTO events VALUES (?, ?, ?, ?)', ('e-old', 'r-old', 1, json.dumps(OLD)))
    new = AgentEvent(**{**OLD, 'event_id': 'e-new', 'sequence_number': 2, 'actor_trust_level': 1})
    log.append(new)
    loaded = log.events('r-old')
    assert [e.actor_trust_level for e in loaded] == [None, 1]
    assert 'actor_trust_level' in json.loads(sqlite3.connect(path).execute("SELECT data FROM events WHERE event_id='e-new'").fetchone()[0])
    app = create_app(path)
    body = TestClient(app).get('/api/run/r-old/events').json()['events']
    assert [e['actor_trust_level'] for e in body] == [None, 1]
    assert [e['event_id'] for e in body] == ['e-old', 'e-new']


def test_new_events_are_readable_by_a_reader_that_does_not_know_the_field():
    class OldReader(AgentEvent):
        model_config = {'extra': 'ignore'}
    data = {**OLD, 'actor_trust_level': 2}
    del OldReader.model_fields['actor_trust_level']
    OldReader.model_rebuild(force=True)
    assert OldReader.model_validate_json(json.dumps(data)).tool_name == 'mock_config_write'


def test_trust_level_range_is_validated():
    with pytest.raises(ValueError):
        AgentEvent(**{**OLD, 'actor_trust_level': 4})


def test_old_and_new_runs_compare_as_before(tmp_path):
    client = TestClient(create_app(tmp_path / 'a.db'))
    a, _ = run(client, S2, 'undefended')
    b, _ = run(client, S2, 'defended')
    first = client.get('/api/compare', params={'run_a': a, 'run_b': b}).json()
    # Remove the trust field from every stored defended event, as an older build would have stored them.
    path = tmp_path / 'a.db'
    with sqlite3.connect(path) as db:
        db.execute('DROP TRIGGER events_no_update')
        for event_id, data in db.execute('SELECT event_id, data FROM events WHERE run_id=?', (b,)).fetchall():
            payload = json.loads(data)
            payload.pop('actor_trust_level')
            db.execute('UPDATE events SET data=? WHERE event_id=?', (json.dumps(payload), event_id))
    second = client.get('/api/compare', params={'run_a': a, 'run_b': b}).json()
    assert second['first_divergence_sequence'] == first['first_divergence_sequence'] == 4
    assert [s['diff'] for s in second['aligned_steps']] == [s['diff'] for s in first['aligned_steps']]
    assert second['key_decision_b']['actor_trust_level'] is None and second['key_decision_b']['policy_reason_code'] == 'TRUST_LEVEL_INSUFFICIENT'


def test_runs_from_different_policy_revisions_cannot_be_compared(tmp_path):
    import hashlib
    from backend.scenarios.registry import load_scenarios

    path = tmp_path / 'mixed.db'
    client = TestClient(create_app(path))
    old, _ = run(client, S2, 'undefended')
    new, _ = run(client, S2, 'defended')
    scenario = load_scenarios()[S2]
    old_version = hashlib.sha256(scenario.model_dump_json().encode('utf-8')).hexdigest()
    with sqlite3.connect(path) as db:
        db.execute('UPDATE runs SET version=? WHERE run_id=?', (old_version, old))
    assert client.get(f'/api/report/{old}').status_code == 200
    assert client.get('/api/compare', params={'run_a': old, 'run_b': new}).status_code == 400
