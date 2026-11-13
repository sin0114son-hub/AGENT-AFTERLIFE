import os, sys, subprocess, socket, tempfile, time, re
from pathlib import Path
import httpx
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2]; tmp=Path(tempfile.mkdtemp(prefix="afterlife-browser-"))
def port():
 s=socket.socket(); s.bind(("127.0.0.1",0)); p=s.getsockname()[1]; s.close(); return p
bp,fp=port(),port()
server=tmp/"server.py"
server.write_text("import sys,time\nimport backend.main as m\nimport uvicorn\nold=m.run_scenario\ndef slow(*a,**k):\n for e in old(*a,**k):\n  yield e\n  time.sleep(.4)\nm.run_scenario=slow\nuvicorn.run(m.create_app(sys.argv[1]),host='127.0.0.1',port=int(sys.argv[2]),log_level='error')\n",encoding='utf-8')
env=os.environ.copy(); env["PYTHONPATH"]=str(root); env["API_ORIGIN"]=f"http://127.0.0.1:{bp}"; env["NEXT_TELEMETRY_DISABLED"]="1"
backend=subprocess.Popen([sys.executable,str(server),str(tmp/"audit.db"),str(bp)],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
node=subprocess.Popen(["node",str(root/"frontend/node_modules/next/dist/bin/next"),"dev","--port",str(fp)],cwd=root/"frontend",env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
base=f"http://localhost:{fp}"
try:
 for _ in range(180):
  try:
   if httpx.get(base+"/api/scenarios",timeout=2).status_code==200: break
  except Exception: time.sleep(.2)
 else: raise RuntimeError("servers not ready")
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True)
  page=browser.new_page(viewport={"width":375,"height":800})
  page.goto(base+"/attack-lab",wait_until="networkidle")
  page.get_by_label("Select scenario").locator("option").first.wait_for(state="attached",timeout=15000)
  assert page.get_by_role("button",name="Start simulation").is_enabled()
  print("scenario selection enables Run",flush=True)
  result=page.evaluate("""async () => {
    const resp=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario_id:'scenario_01_prompt_injection',policy_mode:'defended'})});
    const type=resp.headers.get('content-type'); const reader=resp.body.getReader(); const dec=new TextDecoder();
    let text='', chunks=0, times=[]; const started=performance.now();
    while (true) {const r=await reader.read(); if (r.done) break; chunks++; times.push(performance.now()-started); text+=dec.decode(r.value,{stream:true});}
    const events=text.split('\\n\\n').filter(Boolean).map(x=>JSON.parse(x.slice(6)));
    return {type,chunks,times,events};
  }""")
  assert result["type"].startswith("text/event-stream"),result
  assert result["chunks"]>1 and result["times"][-1]-result["times"][0]>100,result
  events=result["events"]; assert events[-1]["event_type"]=="RUN_COMPLETE",result
  run=events[0]["run_id"]
  stored=httpx.get(base+"/api/run/"+run+"/events").json()["events"]
  assert [x["event_id"] for x in events]==[x["event_id"] for x in stored]
  print("POST SSE proxy",result["type"],"chunks",result["chunks"],"events",len(events),"duration_ms",round(result["times"][-1]-result["times"][0]),flush=True)
  result=page.evaluate("""async () => {
    const ctl=new AbortController();
    const resp=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario_id:'scenario_01_prompt_injection',policy_mode:'defended'}),signal:ctl.signal});
    const reader=resp.body.getReader(); const first=await reader.read(); const text=new TextDecoder().decode(first.value);
    const event=JSON.parse(text.split('\\n')[0].slice(6)); ctl.abort();
    try {await reader.read();} catch(e) {return {id:event.run_id,error:e.name};}
    return {id:event.run_id,error:'not aborted'};
  }""")
  assert result["error"]=="AbortError",result
  for _ in range(50):
   state=httpx.get(base+"/api/run/"+result["id"]).json()
   if state["status"] not in ("CREATED","RUNNING"): break
   time.sleep(.2)
  stored=httpx.get(base+"/api/run/"+result["id"]+"/events").json()["events"]
  report=httpx.get(base+"/api/report/"+result["id"]).json()
  print("abort proxy state",state["status"],"stored events",len(stored),"verdict",report["verdict"],flush=True)
  assert state["status"]=="CANCELLED" and report["verdict"]=="ERROR"
  browser.close()
finally:
 for p in (node,backend): p.terminate()
 for p in (node,backend):
  try: p.wait(timeout=5)
  except subprocess.TimeoutExpired: p.kill(); p.wait()
