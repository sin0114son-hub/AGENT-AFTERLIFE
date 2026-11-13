import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
tmp = Path(tempfile.mkdtemp(prefix='afterlife-protected-'))
secret = 'test_' + 'a' * 40
env = dict(os.environ, PYTHONPATH=str(root), AFTERLIFE_AUTH_MODE='required', AFTERLIFE_PROXY_SECRET=secret, NEXT_TELEMETRY_DISABLED='1')

def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

bp, fp = port(), port()
env['API_ORIGIN'] = f'http://127.0.0.1:{bp}'
backend_url, base = env['API_ORIGIN'], f'http://127.0.0.1:{fp}'
helper = tmp / 'server.py'
helper.write_text('''import sys,time\nfrom pathlib import Path\nimport backend.main as m\nimport uvicorn\np=Path(sys.argv[1]); original=m.run_scenario\ndef trace(scenario,mode,run_id):\n i=iter(original(scenario,mode,run_id)); n=0\n while True:\n  n+=1; (p/f"{run_id}-{n}-started").touch()\n  if (p/f"gate-{n}").exists():\n   while not (p/f"release-{n}").exists(): time.sleep(.01)\n  time.sleep(.25)\n  try: event=next(i)\n  except StopIteration: return\n  (p/f"{run_id}-{n}-produced").touch()\n  yield event\nm.run_scenario=trace\nuvicorn.run(m.create_app(p/"audit.db"),host="127.0.0.1",port=int(sys.argv[2]),log_level="error")\n''', encoding='utf8')
backend = subprocess.Popen([sys.executable, str(helper), str(tmp), str(bp)], cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
front = subprocess.Popen(['node', str(root/'frontend/node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', str(fp)], cwd=root/'frontend', env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def wait(fn, label, limit=30):
    until = time.monotonic() + limit
    while time.monotonic() < until:
        try:
            value = fn()
            if value:
                return value
        except (httpx.HTTPError, FileNotFoundError, json.JSONDecodeError):
            pass
        time.sleep(.05)
    raise AssertionError('timeout: ' + label)

def get(path):
    return httpx.get(base + path, timeout=3).json()

try:
    wait(lambda: httpx.get(base+'/api/scenarios', timeout=1).status_code == 200, 'proxy ready', 60)
    payload = {'scenario_id': 'scenario_01_prompt_injection', 'policy_mode': 'defended'}
    for headers in ({}, {'x-afterlife-proxy-secret': 'forged'}):
        assert httpx.get(backend_url+'/api/scenarios', headers=headers).status_code == 401
        assert httpx.post(backend_url+'/api/run', json=payload, headers=headers).status_code == 401
    assert not (tmp/'audit.db').exists()
    assert httpx.get(backend_url+'/api/scenarios', headers={'x-afterlife-proxy-secret': secret}).status_code == 200
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        page.goto(base+'/attack-lab', wait_until='networkidle')
        assert secret not in page.content()
        for src in page.locator('script[src]').evaluate_all('(nodes) => nodes.map(n => n.src)'):
            assert secret not in page.request.get(src).text()
        check = page.evaluate('''async () => { const r=await fetch('/api/scenarios',{headers:{'x-afterlife-proxy-secret':'forged'}}); return {status:r.status, headers:[...r.headers],body:await r.text()}; }''')
        assert check['status'] == 200 and secret not in json.dumps(check)
        for gate in (1, 2, 0):
            existing = set(tmp.glob(f'*-{gate}-started'))
            if gate:
                (tmp/f'gate-{gate}').touch()
            page.evaluate('''() => { window.result={events:[],times:[],state:'pending'}; window.ctl=new AbortController(); (async()=>{try {const r=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json','x-afterlife-proxy-secret':'forged'},body:JSON.stringify({scenario_id:'scenario_01_prompt_injection',policy_mode:'defended'}),signal:window.ctl.signal}); window.result.status=r.status; window.result.type=r.headers.get('content-type'); window.result.headers=[...r.headers]; const reader=r.body.getReader(), dec=new TextDecoder(); let b=''; while(true){const v=await reader.read(); if(v.done) break; b+=dec.decode(v.value,{stream:true}); let j; while((j=b.indexOf('\\n\\n'))>=0){const f=b.slice(0,j); b=b.slice(j+2); if(f.startsWith('data: ')){window.result.events.push(JSON.parse(f.slice(6)));window.result.times.push(performance.now());}}} window.result.state='complete';}catch(e){window.result.state=e.name;}})(); }''')
            if gate:
                markers = wait(lambda: list(set(tmp.glob(f'*-{gate}-started'))-existing), 'gate started')
                rid = markers[-1].name.rsplit('-', 2)[0]
                if gate == 2:
                    wait(lambda: page.evaluate('window.result.events.length') >= 1, 'first event')
                page.evaluate('window.ctl.abort()')
                wait(lambda: page.evaluate('window.result.state') == 'AbortError', 'abort')
                (tmp/f'release-{gate}').touch()
                state = wait(lambda: (s if (s := get(f'/api/run/{rid}'))['status'] not in ('CREATED', 'RUNNING') else None), 'terminal')
                assert state['status'] == 'CANCELLED' and get(f'/api/report/{rid}')['verdict'] == 'ERROR'
                (tmp/f'gate-{gate}').unlink()
                (tmp/f'release-{gate}').unlink()
            else:
                wait(lambda: page.evaluate('window.result.state') == 'complete', 'complete')
                rid = page.evaluate('window.result.events[0].run_id')
                page.evaluate('window.ctl.abort()')
                state = get(f'/api/run/{rid}')
                assert state['status'] == 'COMPLETE'
            result = page.evaluate('window.result')
            assert secret not in json.dumps(result)
            stored = get(f'/api/run/{rid}/events')['events']
            received_ids = [e['event_id'] for e in result['events']]
            stored_ids = [e['event_id'] for e in stored]
            if gate:
                assert len(stored_ids) == gate and received_ids == stored_ids[:gate-1]
                assert not (tmp/f'{rid}-{gate+1}-started').exists()
            else:
                assert result['status'] == 200 and result['type'].startswith('text/event-stream')
                assert received_ids == stored_ids and len(result['times']) > 1 and result['times'][-1]-result['times'][0] > 100
            started = time.monotonic()
            time.sleep(5.1)
            elapsed = time.monotonic()-started
            assert get(f'/api/run/{rid}')['status'] == state['status']
            assert [e['event_id'] for e in get(f'/api/run/{rid}/events')['events']] == stored_ids
            if gate:
                assert not (tmp/f'{rid}-{gate+1}-started').exists()
            print(json.dumps({'case':gate, 'browser':result['state'], 'received':received_ids, 'stored':stored_ids, 'status':state['status'], 'verdict':get(f'/api/report/{rid}')['verdict'], 'later_started':bool(gate and (tmp/f'{rid}-{gate+1}-started').exists()), 'stable_seconds':round(elapsed,2), 'stream_ms':round(result['times'][-1]-result['times'][0]) if len(result['times'])>1 else None}), flush=True)
        browser.close()
    front.terminate()
    front.wait(timeout=5)
    invalid_env = dict(env)
    del invalid_env['AFTERLIFE_PROXY_SECRET']
    invalid_port = port()
    invalid_front = subprocess.Popen(['node', str(root/'frontend/node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', str(invalid_port)], cwd=root/'frontend', env=invalid_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        invalid_url = f'http://127.0.0.1:{invalid_port}/api/scenarios'
        wait(lambda: httpx.get(invalid_url, timeout=1).status_code == 503, 'missing frontend secret', 60)
    finally:
        invalid_front.terminate()
        invalid_front.wait(timeout=5)
finally:
    for proc in (front, backend):
        proc.terminate()
    for proc in (front, backend):
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
