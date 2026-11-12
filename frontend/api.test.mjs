import assert from "node:assert/strict";
import { test } from "node:test";
import { api } from "./app/lib/api.ts";

const event = (id, type) => ({event_id:id,run_id:"run-1",event_type:type});
const first = event("한", "TOOL_CALL_PROPOSED"), last = event("end", "RUN_COMPLETE");
const json = x => new Response(JSON.stringify(x), {headers:{"Content-Type":"application/json"}});
function mock(events, status="COMPLETE", ending=true) {
  let request;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/scenarios") return json({scenarios:[{scenario_id:"s"}]});
    if (url === "/api/run" && options) {
      request = JSON.parse(options.body);
      const wire = events.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join("") + (ending ? "" : "data: {");
      const bytes = new TextEncoder().encode(wire);
      return new Response(new ReadableStream({start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); }}));
    }
    if (url.endsWith("/events")) return json({events: [...new Map(events.map(e=>[e.event_id,e])).values()]});
    return json({run_id:"run-1",status});
  };
  return () => request;
}
test("scenario envelope, policy field, split UTF-8 frames, IDs and deduplication", async () => {
  const request = mock([first, first, last]);
  assert.equal((await api.listScenarios())[0].scenario_id,"s");
  const seen=[];
  const result = await api.startRun("s","defended",new AbortController().signal,e=>seen.push(e));
  assert.deepEqual(request(),{scenario_id:"s",policy_mode:"defended"});
  assert.deepEqual(seen,[first,last]);
  assert.equal(result.run.run_id,"run-1");
});
test("incomplete and nonterminal streams do not complete", async () => {
  mock([first], "COMPLETE");
  await assert.rejects(api.startRun("s","defended",new AbortController().signal,()=>{}),/completion event/);
  mock([first], "RUNNING");
  await assert.rejects(api.startRun("s","defended",new AbortController().signal,()=>{}),/Connection ended/);
  mock([first], "COMPLETE", false);
  await assert.rejects(api.startRun("s","defended",new AbortController().signal,()=>{}),/Incomplete/);
});
test("server error and cancellation remain distinct", async () => {
  for (const status of ["ERROR","CANCELLED","TIMEOUT"]) {
    mock([event("end","RUN_ERROR")], status);
    assert.equal((await api.startRun("s","defended",new AbortController().signal,()=>{})).run.status,status);
  }
});
test("HTTP errors are surfaced", async () => {
  globalThis.fetch = async () => new Response("bad request", {status:422});
  await assert.rejects(api.startRun("s","defended",new AbortController().signal,()=>{}),/422/);
});


test("multiple data lines and aborted request", async () => {
  const wire = 'data: {"event_id":"end",\ndata: "run_id":"run-1","event_type":"RUN_COMPLETE"}\n\n';
  const end = event("end", "RUN_COMPLETE");
  globalThis.fetch = async (url, options) => {
    if (url === "/api/run" && options) return new Response(wire);
    if (url.endsWith("/events")) return json({events:[end]});
    return json({run_id:"run-1",status:"COMPLETE"});
  };
  assert.equal((await api.startRun("s","defended",new AbortController().signal,()=>{})).run.status,"COMPLETE");
  globalThis.fetch = async (_url, options) => {
    options.signal.throwIfAborted();
  };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.startRun("s","defended",controller.signal,()=>{}), {name:"AbortError"});
});
