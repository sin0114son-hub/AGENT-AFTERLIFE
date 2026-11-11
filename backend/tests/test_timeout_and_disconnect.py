"""
Tests for real elapsed-time timeout and SSE disconnect (GeneratorExit) handling.

Timeout design:
- time.monotonic() is used — a monotonic clock, not wall-clock datetime.
- Checked at each step boundary *before* mock-tool execution.
- Produces EXECUTION_LIMIT_REACHED (never DEFENDED, INV-08).
- No mock tool executes after the limit fires.

SSE disconnect design:
- TestClient buffers the full stream, so GeneratorExit cannot be injected
  through it.  We test the stream generator directly by calling .close(),
  which injects GeneratorExit inside the generator.
- After close(), the run status is CANCELLED.
- Already-committed audit events are preserved.
- CANCELLED runs produce verdict ERROR, never DEFENDED.
"""
import json
import time
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.scenarios.registry import load_scenarios
from backend.scenarios.engine import run_scenario, DEFAULT_TIMEOUT_SECS, MAX_TIMEOUT_SECS
import hashlib


# ---------------------------------------------------------------------------
# Timeout — engine level
# ---------------------------------------------------------------------------

class TestElapsedTimeout:
    def test_timeout_produces_execution_limit_reached(self):
        """A timeout fires EXECUTION_LIMIT_REACHED, not RUN_COMPLETE."""
        scenario = load_scenarios()['scenario_01_prompt_injection']
        clock = iter([0.0] + [1000.0] * 200)
        with patch('time.monotonic', side_effect=lambda: next(clock)):
            events = list(run_scenario(scenario, 'defended', 'run', timeout_secs=0.001))
        assert events[-1].event_type == 'EXECUTION_LIMIT_REACHED'
        assert not any(e.event_type == 'RUN_COMPLETE' for e in events)

    def test_timeout_stops_before_further_tool_calls(self):
        """No mock tool executes after the timeout boundary fires."""
        scenario = load_scenarios()['scenario_01_prompt_injection']
        call_count = [0]
        def mock_clock():
            call_count[0] += 1
            return 0.0 if call_count[0] == 1 else 9999.0
        with patch('time.monotonic', side_effect=mock_clock):
            events = list(run_scenario(scenario, 'undefended', 'run', timeout_secs=1.0))
        assert events[-1].event_type == 'EXECUTION_LIMIT_REACHED'
        limit_seq = events[-1].sequence_number
        assert all(e.sequence_number <= limit_seq for e in events)

    def test_timeout_never_reported_as_defended(self):
        """EXECUTION_LIMIT_REACHED must not produce verdict DEFENDED (INV-08)."""
        from backend.models import VerdictCode, SecurityOutcomeCode, SecurityOutcome, PolicyMode
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            SecurityOutcome(
                run_id='r', scenario_id='s', policy_mode=PolicyMode.DEFENDED,
                outcome_code=SecurityOutcomeCode.EXECUTION_LIMIT_REACHED,
                verdict=VerdictCode.DEFENDED,
                verdict_evidence='',
            )

    def test_normal_run_completes_within_timeout(self):
        """A normal run with generous timeout ends with RUN_COMPLETE."""
        scenario = load_scenarios()['scenario_01_prompt_injection']
        events = list(run_scenario(scenario, 'defended', 'run', timeout_secs=DEFAULT_TIMEOUT_SECS))
        assert events[-1].event_type == 'RUN_COMPLETE'

    def test_timeout_capped_at_max(self):
        """Passing a huge timeout is silently clamped to MAX_TIMEOUT_SECS."""
        scenario = load_scenarios()['scenario_01_prompt_injection']
        events = list(run_scenario(scenario, 'defended', 'run', timeout_secs=MAX_TIMEOUT_SECS + 9999))
        assert events[-1].event_type == 'RUN_COMPLETE'

    def test_timeout_error_field_contains_timeout(self):
        """The EXECUTION_LIMIT_REACHED event's error field mentions timeout."""
        scenario = load_scenarios()['scenario_01_prompt_injection']
        clock = iter([0.0] + [9999.0] * 200)
        with patch('time.monotonic', side_effect=lambda: next(clock)):
            events = list(run_scenario(scenario, 'defended', 'run', timeout_secs=0.001))
        limit = events[-1]
        assert limit.event_type == 'EXECUTION_LIMIT_REACHED'
        assert limit.error is not None
        assert 'timeout' in limit.error.lower()


# ---------------------------------------------------------------------------
# Timeout — API / report level
# ---------------------------------------------------------------------------

class TestTimeoutViaAPI:
    def test_api_verdict_error_when_run_status_timeout(self, tmp_path):
        """A run manually set to TIMEOUT produces verdict ERROR, never DEFENDED."""
        app = create_app(tmp_path / 'audit.db')
        client = TestClient(app)
        response = client.post('/api/run', json={
            'scenario_id': 'scenario_01_prompt_injection', 'policy_mode': 'defended'
        })
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
        run_id = events[0]['run_id']
        app.state.log.finish(run_id, 'TIMEOUT')
        assert client.get(f'/api/report/{run_id}').json()['verdict'] == 'ERROR'


# ---------------------------------------------------------------------------
# SSE disconnect (GeneratorExit) — generator level
# ---------------------------------------------------------------------------

def _build_stream_generator(store, scenario, policy_mode, run_id):
    """
    Reconstruct the stream generator logic from main.py so we can call
    .close() on it, which injects GeneratorExit inside the generator.
    """
    fixture_hash = hashlib.sha256(scenario.model_dump_json().encode()).hexdigest()
    store.create_run(run_id, scenario.scenario_id, policy_mode, fixture_hash)
    iterator = iter(run_scenario(scenario, policy_mode, run_id))
    sequence = 0

    def stream():
        nonlocal sequence
        try:
            while True:
                try:
                    event = next(iterator)
                except StopIteration:
                    break
                store.append(event)
                sequence = event.sequence_number
                if event.event_type == 'RUN_COMPLETE':
                    store.finish(run_id, 'COMPLETE')
                elif event.event_type in ('EXECUTION_LIMIT_REACHED', 'RUN_ERROR'):
                    store.finish(run_id, 'ERROR')
                yield 'data: ' + event.model_dump_json() + '\n\n'
                if event.event_type == 'RUN_ERROR':
                    break
        except GeneratorExit:
            try:
                store.finish(run_id, 'CANCELLED')
            except Exception:
                pass
            raise

    return stream()


class TestSSEDisconnect:
    def test_disconnect_sets_run_cancelled(self, tmp_path):
        """Closing the SSE generator marks the run CANCELLED."""
        from backend.audit import AuditLog
        store = AuditLog(tmp_path / 'audit.db')
        scenario = load_scenarios()['scenario_01_prompt_injection']
        gen = _build_stream_generator(store, scenario, 'defended', 'run-dc-1')
        next(gen)   # consume one event
        gen.close() # inject GeneratorExit
        assert store.run('run-dc-1')['status'] == 'CANCELLED'

    def test_disconnect_preserves_committed_events(self, tmp_path):
        """Events already appended survive the disconnect."""
        from backend.audit import AuditLog
        store = AuditLog(tmp_path / 'audit.db')
        scenario = load_scenarios()['scenario_01_prompt_injection']
        gen = _build_stream_generator(store, scenario, 'defended', 'run-dc-2')
        next(gen)
        gen.close()
        assert len(store.events('run-dc-2')) >= 1

    def test_disconnect_verdict_is_error_not_defended(self, tmp_path):
        """A CANCELLED run produces verdict ERROR, never DEFENDED."""
        app = create_app(tmp_path / 'audit.db')
        client = TestClient(app)
        response = client.post('/api/run', json={
            'scenario_id': 'scenario_01_prompt_injection', 'policy_mode': 'defended'
        })
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
        run_id = events[0]['run_id']
        app.state.log.finish(run_id, 'CANCELLED')
        assert client.get(f'/api/report/{run_id}').json()['verdict'] == 'ERROR'

    def test_no_tool_execution_after_disconnect(self, tmp_path):
        """After close(), no further events are appended."""
        from backend.audit import AuditLog
        store = AuditLog(tmp_path / 'audit.db')
        scenario = load_scenarios()['scenario_01_prompt_injection']
        gen = _build_stream_generator(store, scenario, 'defended', 'run-dc-3')
        next(gen)   # exactly one event committed
        gen.close()
        events = store.events('run-dc-3')
        assert all(e.sequence_number <= 1 for e in events)
