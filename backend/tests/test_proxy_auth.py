import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


def test_auth_requires_secret_and_rejects_untrusted_requests(tmp_path, monkeypatch):
    monkeypatch.setenv('AFTERLIFE_AUTH_MODE', 'required')
    monkeypatch.delenv('AFTERLIFE_PROXY_SECRET', raising=False)
    with pytest.raises(ValueError, match='authentication'):
        create_app(tmp_path / 'audit.db')
    secret = 'a' * 32
    monkeypatch.setenv('AFTERLIFE_PROXY_SECRET', secret)
    client = TestClient(create_app(tmp_path / 'audit.db'))
    for headers in ({}, {'x-afterlife-proxy-secret': 'invalid'}):
        assert client.get('/api/scenarios', headers=headers).status_code == 401
        assert client.post('/api/run', json={}, headers=headers).status_code == 401
    assert not (tmp_path / 'audit.db').exists()
    assert client.get('/api/scenarios', headers={'x-afterlife-proxy-secret': secret}).status_code == 200
