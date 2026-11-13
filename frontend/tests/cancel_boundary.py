import json, os, socket, subprocess, sys, tempfile, time
from pathlib import Path
import httpx
from playwright.sync_api import sync_playwright

root = Path(os.environ['AFTERLIFE_TEST_ROOT']) if 'AFTERLIFE_TEST_ROOT' in os.environ else Path(__file__).resolve().parents[2]
tmp = Path(tempfile.mkdtemp(prefix='afterlife-boundary-', dir=os.environ.get('AFTERLIFE_TEST_TMP')))
def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); return s.getsockname()[1]
bp, fp = port(), port()
helper = tmp / 'server.py'
helper.write_text('''import os, sys, time\nfrom pathlib import Path\nimport backend.main as m\nimport uvicorn\np=Path(sys.argv[1]); original=m.run_scenario\ndef trace(scenario, mode, run_id):\n    i=iter(original(scenario, mode, run_id)); n=0\n    while True:\n        n+=1; (p/f"{run_id}-{n}-started").touch()\n        if (p/f"gate-{n}").exists():\n            while not (p/f"release-{n}").exists(): time.sleep(.01)\n        try: event=next(i)\n        except StopIteration: return\n        (p/f"{run_id}-{n}-produced").touch()\n        yield event\nm.run_scenario=trace\nuvicorn.run(m.create_app(p/"audit.db"),host="127.0.0.1",port=int(sys.argv[2]),log_level="error")\n''', encoding='utf8')
env = os.environ.copy(); env['PYTHONPATH'] = str(root) + os.pathsep + env.get('PYTHONPATH', ''); env['API_ORIGIN'] = f'http://127.0.0.1:{bp}'; env['NEXT_TELEMETRY_DISABLED'] = '1'
backend = subprocess.Popen([sys.executable,str(helper),str(tmp),str(bp)],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
frontend = Path(os.environ.get('AFTERLIFE_FRONTEND', str(root / 'frontend')))
front = subprocess.Popen(['node',str(frontend/'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',str(fp)],cwd=frontend,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
base=f'http://127.0.0.1:{fp}'
def wait(fn, label, limit=20):
    end=time.monotonic()+limit
    while time.monotonic()<end:
        try:
            value=fn()
            if value: return value
        except (httpx.HTTPError, FileNotFoundError, json.JSONDecodeError): pass
        time.sleep(.05)
    raise AssertionError('timeout: '+label)
try:
    wait(lambda: httpx.get(base+'/api/scenarios',timeout=1).status_code == 200,'proxy ready',45)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True); page=browser.new_page(); page.goto(base+'/attack-lab',wait_until='networkidle')
        for gate in (1,2,0):
            existing = set(tmp.glob(f'*-{gate}-started'))
            if gate: (tmp/f'gate-{gate}').touch()
            page.evaluate('''() => { window.outcome={events:[],state:'pending'}; window.ctl=new AbortController(); (async()=>{try {const r=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario_id:'scenario_01_prompt_injection',policy_mode:'defended'}),signal:window.ctl.signal}); const reader=r.body.getReader(), dec=new TextDecoder(); let buffer=''; while(true){const v=await reader.read(); if(v.done) break; buffer+=dec.decode(v.value,{stream:true}); let j; while((j=buffer.indexOf('\\n\\n'))>=0){const frame=buffer.slice(0,j); buffer=buffer.slice(j+2); if(frame.startsWith('data: ')) window.outcome.events.push(JSON.parse(frame.slice(6)));}} window.outcome.state='complete';}catch(e){window.outcome.state=e.name;}})(); }''')
            if gate:
                markers=wait(lambda:list(set(tmp.glob(f'*-{gate}-started'))-existing),'gate started')
                rid=markers[-1].name.rsplit('-',2)[0]
                if gate==2: wait(lambda:page.evaluate('window.outcome.events.length') >= 1,'first client event')
                before=httpx.get(base+f'/api/run/{rid}/events').json()['events']
                page.evaluate('window.ctl.abort()')
                wait(lambda:page.evaluate('window.outcome.state')=='AbortError','client abort')
                pending=httpx.get(base+f'/api/run/{rid}').json()['status']
                (tmp/f'release-{gate}').touch()
                status=wait(lambda:(s if (s:=httpx.get(base+f'/api/run/{rid}').json())['status'] not in ('CREATED','RUNNING') else None),'terminal server')
                events=httpx.get(base+f'/api/run/{rid}/events').json()['events']; report=httpx.get(base+f'/api/report/{rid}').json()
                produced=(tmp/f'{rid}-{gate}-produced').exists(); later=list(tmp.glob(f'{rid}-{gate+1}-started'))
                print(json.dumps({'case':f'abort while next {gate} paused before processing','before_count':len(before),'client':page.evaluate('window.outcome.state'),'received':page.evaluate('window.outcome.events.length'),'server_before_release':pending,'produced_after_release':produced,'later_started':bool(later),'server':status['status'],'stored':len(events),'verdict':report['verdict']}),flush=True)
                assert status['status']=='CANCELLED' and report['verdict']=='ERROR'
                assert produced and not later and len(events)==gate and len(before)==gate-1
                (tmp/f'gate-{gate}').unlink(); (tmp/f'release-{gate}').unlink()
            else:
                wait(lambda:page.evaluate('window.outcome.state')=='complete','complete run')
                out=page.evaluate('window.outcome'); rid=out['events'][0]['run_id']; page.evaluate('window.ctl.abort()'); status=httpx.get(base+f'/api/run/{rid}').json(); events=httpx.get(base+f'/api/run/{rid}/events').json()['events']
                print(json.dumps({'case':'abort after complete','received':len(out['events']),'server':status['status'],'stored':len(events)}),flush=True)
                assert status['status']=='COMPLETE' and len(events)==len(out['events'])
        browser.close()
finally:
    for proc in (front,backend): proc.terminate()
    for proc in (front,backend):
        try: proc.wait(timeout=5)
        except subprocess.TimeoutExpired: proc.kill(); proc.wait()
    print('evidence',tmp,flush=True)
