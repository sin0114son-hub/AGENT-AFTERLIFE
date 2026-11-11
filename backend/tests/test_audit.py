import sqlite3
import pytest
from backend.audit import AuditLog
from backend.scenarios.registry import load_scenarios
from backend.scenarios.engine import run_scenario


def test_append_only_and_contiguous(tmp_path):
    log = AuditLog(tmp_path / 'audit.db')
    log.create_run('run', 'scenario_01_prompt_injection', 'defended', '1.0.0')
    events = list(run_scenario(load_scenarios()['scenario_01_prompt_injection'], 'defended', 'run'))
    with pytest.raises(sqlite3.IntegrityError):
        log.append(events[1])
    log.append(events[0])
    with pytest.raises(sqlite3.IntegrityError):
        log.append(events[0])
    with sqlite3.connect(log.path) as db:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute('DELETE FROM events')
    assert [e.sequence_number for e in log.events('run')] == [1]

from concurrent.futures import ThreadPoolExecutor
from hypothesis import given, strategies as st, settings


@settings(max_examples=10, deadline=None)
@given(st.integers(min_value=1, max_value=12))
def test_sequence_invariant_for_multiple_runs(tmp_path_factory, count):
    path = tmp_path_factory.mktemp('property') / 'audit.db'
    log = AuditLog(path)
    log.create_run('r', 'scenario_01_prompt_injection', 'defended', '1')
    template = next(run_scenario(load_scenarios()['scenario_01_prompt_injection'], 'defended', 'r'))
    from uuid import uuid4
    for i in range(1, count + 1):
        log.append(template.model_copy(update={'sequence_number': i, 'event_id': str(uuid4())}))
    assert [e.sequence_number for e in log.events('r')] == list(range(1, count + 1))


def test_concurrent_runs_do_not_overwrite(tmp_path):
    log = AuditLog(tmp_path / 'audit.db')
    scenario = load_scenarios()['scenario_01_prompt_injection']
    def execute(run_id):
        log.create_run(run_id, scenario.scenario_id, 'defended', scenario.version)
        for event in run_scenario(scenario, 'defended', run_id):
            log.append(event)
        return log.events(run_id)
    with ThreadPoolExecutor(max_workers=4) as pool:
        runs = list(pool.map(execute, [str(i) for i in range(8)]))
    assert len({e.event_id for run in runs for e in run}) == sum(map(len, runs))
    assert all([e.sequence_number for e in run] == list(range(1, len(run) + 1)) for run in runs)


def test_replace_cannot_overwrite_existing_event(tmp_path):
    log = AuditLog(tmp_path / 'audit.db')
    log.create_run('run', 'scenario_01_prompt_injection', 'defended', '1')
    event = next(run_scenario(load_scenarios()['scenario_01_prompt_injection'], 'defended', 'run'))
    log.append(event)
    with sqlite3.connect(log.path) as db:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute('INSERT OR REPLACE INTO events VALUES (?, ?, ?, ?)', (event.event_id, event.run_id, 1, '{}'))
    assert log.events('run')[0] == event


def test_replace_cannot_move_event_to_another_run(tmp_path):
    log = AuditLog(tmp_path / 'audit.db')
    for run in ('one', 'two'):
        log.create_run(run, 'scenario_01_prompt_injection', 'defended', '1')
    event = next(run_scenario(load_scenarios()['scenario_01_prompt_injection'], 'defended', 'one'))
    log.append(event)
    with sqlite3.connect(log.path) as db:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute('INSERT OR REPLACE INTO events VALUES (?, ?, ?, ?)', (event.event_id, 'two', 1, '{}'))
    assert log.events('one') == [event]
