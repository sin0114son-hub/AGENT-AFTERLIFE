import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


def test_configured_database_and_explicit_override(tmp_path, monkeypatch):
    configured = tmp_path / 'configured.db'
    monkeypatch.setenv('AFTERLIFE_DB_PATH', str(configured))
    client = TestClient(create_app())
    response = client.post('/api/run', json={'scenario_id': 'scenario_01_prompt_injection', 'policy_mode': 'defended'})
    assert response.status_code == 200
    assert configured.is_file()
    override = tmp_path / 'override.db'
    client = TestClient(create_app(override))
    assert client.post('/api/run', json={'scenario_id': 'scenario_01_prompt_injection', 'policy_mode': 'defended'}).status_code == 200
    assert override.is_file()


@pytest.mark.parametrize('path', ['', 'relative.db'])
def test_invalid_database_path_fails_at_startup(path, monkeypatch):
    monkeypatch.setenv('AFTERLIFE_DB_PATH', path)
    with pytest.raises(ValueError, match='AFTERLIFE_DB_PATH'):
        create_app()


def test_missing_database_directory_fails_at_startup(tmp_path, monkeypatch):
    monkeypatch.setenv('AFTERLIFE_DB_PATH', str(tmp_path / 'missing' / 'audit.db'))
    with pytest.raises(ValueError, match='AFTERLIFE_DB_PATH'):
        create_app()
