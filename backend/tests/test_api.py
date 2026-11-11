import json
from fastapi.testclient import TestClient
from backend.main import create_app


def test_run_stream_and_lookup(tmp_path):
    app = create_app(tmp_path / 'audit.db')
    client = TestClient(app)
    assert len(client.get('/api/scenarios').json()['scenarios']) == 2
    assert client.post('/api/run', json={'scenario_id':'missing', 'policy_mode':'defended'}).status_code == 404
    response = client.post('/api/run', json={'scenario_id':'scenario_01_prompt_injection', 'policy_mode':'defended'})
    assert response.status_code == 200
    events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    run_id = events[0]['run_id']
    assert events[-1]['event_type'] == 'RUN_COMPLETE'
    assert client.get(f'/api/run/{run_id}/events').json()['events'] == events
    assert client.get(f'/api/run/{run_id}').json()['status'] == 'COMPLETE'
    assert client.get(f'/api/report/{run_id}').json()['verdict'] == 'DEFENDED'


def test_compare_validation_and_stream_storage_failure(tmp_path, monkeypatch):
    app = create_app(tmp_path / 'audit.db')
    client = TestClient(app)
    request = {'scenario_id': 'scenario_02_trust_escalation', 'policy_mode': 'defended'}
    def run(mode):
        response = client.post('/api/run', json={**request, 'policy_mode': mode})
        return json.loads(response.text.splitlines()[0][6:])['run_id']
    a, b = run('defended'), run('undefended')
    comparison = client.get('/api/compare', params={'run_a': a, 'run_b': b})
    assert comparison.status_code == 200
    assert comparison.json()['first_divergence_sequence'] is not None
    assert client.get('/api/compare', params={'run_a': a, 'run_b': a}).status_code == 400
    assert client.get('/api/run/missing/events').status_code == 404
    assert client.post('/api/run', json={**request, 'policy_mode': 'invalid'}).status_code == 422
    store = app.state.log
    original = store.append
    def fail_second(event):
        if event.sequence_number == 2:
            raise OSError('storage failure')
        original(event)
    monkeypatch.setattr(store, 'append', fail_second)
    response = client.post('/api/run', json=request)
    sent = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    assert len(sent) == 1
    run_id = sent[0]['run_id']
    assert client.get(f'/api/run/{run_id}/events').json()['events'] == sent
    assert client.get(f'/api/report/{run_id}').json()['verdict'] == 'ERROR'


def test_report_error_timeout_and_limit_never_defended(tmp_path):
    from backend.models import AgentEvent
    app = create_app(tmp_path / 'audit.db')
    client = TestClient(app)
    response = client.post('/api/run', json={'scenario_id': 'scenario_01_prompt_injection', 'policy_mode': 'defended'})
    sent = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    run_id = sent[0]['run_id']
    store = app.state.log
    for status in ('ERROR', 'TIMEOUT'):
        store.finish(run_id, status)
        assert client.get(f'/api/report/{run_id}').json()['verdict'] == 'ERROR'
    store.finish(run_id, 'COMPLETE')
    limit = AgentEvent.model_validate({**sent[-1], 'event_id': 'limit', 'sequence_number': len(sent)+1, 'event_type': 'EXECUTION_LIMIT_REACHED'})
    store.append(limit)
    assert client.get(f'/api/report/{run_id}').json()['verdict'] == 'ERROR'


def test_client_cannot_override_trust_or_persist_arguments(tmp_path):
    app = create_app(tmp_path / 'audit.db')
    client = TestClient(app)
    response = client.post('/api/run', json={'scenario_id': 'scenario_02_trust_escalation', 'policy_mode': 'defended', 'actor_trust_level': 3, 'policy_outcome': 'ALLOW'})
    assert '"tool_args"' not in response.text
    sent = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    assert any(e['tool_name'] == 'mock_config_write' and e['event_type'] == 'TOOL_CALL_DENIED' for e in sent)
    assert not any(e['tool_name'] == 'mock_config_write' and e['event_type'] == 'TOOL_CALL_EXECUTED' for e in sent)
    assert b'"tool_args"' not in (tmp_path / 'audit.db').read_bytes()


def test_engine_failure_emits_persisted_error(tmp_path, monkeypatch):
    import backend.main as main
    original = main.run_scenario
    def broken(*args):
        yield next(original(*args))
        raise RuntimeError('sensitive exception')
    monkeypatch.setattr(main, 'run_scenario', broken)
    client = TestClient(create_app(tmp_path / 'audit.db'))
    response = client.post('/api/run', json={'scenario_id': 'scenario_01_prompt_injection', 'policy_mode': 'defended'})
    sent = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    assert sent[-1]['event_type'] == 'RUN_ERROR'
    assert 'sensitive exception' not in response.text
    assert client.get(f"/api/run/{sent[0]['run_id']}/events").json()['events'] == sent


def test_both_fixtures_have_evidence_based_reports(tmp_path):
    client = TestClient(create_app(tmp_path / 'audit.db'))
    for scenario in ('scenario_01_prompt_injection', 'scenario_02_trust_escalation'):
        for mode, verdict in (('defended', 'DEFENDED'), ('undefended', 'VULNERABLE')):
            response = client.post('/api/run', json={'scenario_id': scenario, 'policy_mode': mode})
            events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
            run_id = events[0]['run_id']
            assert client.get(f'/api/report/{run_id}').json()['verdict'] == verdict
            assert client.get(f'/api/run/{run_id}/events').json()['events'] == events
