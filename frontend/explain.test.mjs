import assert from "node:assert/strict";
import { test } from "node:test";
import { api } from "./app/lib/api.ts";
import { ApiError, describeApiError, userMessage } from "./app/lib/errors.ts";
import {
  POLICY_TEXT, REASON_TEXT, decisionFacts, explainFirstDifference, keyDecisionSentence, reasonText,
  relateFirstDifferenceToKeyDecision, trustText,
} from "./app/lib/explain.ts";

const ev = (over) => ({ event_id: "e", run_id: "r", scenario_id: "s", policy_id: "policy_defended_v1", sequence_number: 1, timestamp: "t", actor: "system", event_type: "TOOL_CALL_DENIED", ...over });

// ---- errors: no URL, no raw JSON ----

test("API errors never show the URL or the response body", async () => {
  const body = '{"detail":"SECRET-INTERNAL http://10.0.0.5:8000/api/run/abc"}';
  globalThis.fetch = async () => new Response(body, { status: 404 });
  for (const call of [() => api.getReport("x"), () => api.compare("a", "b"), () => api.getRun("x"), () => api.listScenarios(), () => api.getRunEvents("x")]) {
    await assert.rejects(call(), (error) => {
      assert.ok(error instanceof ApiError);
      assert.doesNotMatch(error.message, /SECRET|10\.0\.0\.5|\/api\/|detail|\{|\}/);
      assert.ok(error.message.length > 20 && /[.]$/.test(error.message));
      return true;
    });
  }
});

test("a failed compare, a missing run and a server error each say what to do", () => {
  assert.match(describeApiError(400, "compare"), /completed runs of the same scenario/);
  assert.match(describeApiError(404, "report"), /Copy the run ID from Attack Lab/);
  assert.match(describeApiError(404, "start"), /Reload the page/);
  assert.match(describeApiError(500, "run"), /HTTP 500.*restart the backend/);
  assert.match(describeApiError(0, "run"), /could not be reached/);
  assert.match(describeApiError(403, "run"), /HTTP 403/);
});

test("network failure and stream faults become fixed messages", async () => {
  globalThis.fetch = async () => { throw new TypeError("fetch failed: http://127.0.0.1:8000/api/compare"); };
  await assert.rejects(api.compare("a", "b"), (error) => { assert.doesNotMatch(error.message, /127\.0\.0\.1|fetch failed/); assert.match(error.message, /could not be reached/); return true; });
  await assert.rejects(api.startRun("s", "defended", new AbortController().signal, () => {}), /could not be reached/);
  assert.match(userMessage(new Error("Stream and stored events differ")), /interrupted or malformed/);
  assert.equal(userMessage(new Error("TypeError: http://x/api")), "Something went wrong. Try again.");
  assert.match(userMessage(new TypeError("Failed to fetch")), /could not be reached/);
});

// ---- explanations come from event fields and documented rules ----

test("every reason code the engine can emit has a description, and unknown codes do not invent one", () => {
  for (const code of ["PERMITTED_USER_TOOL", "PERMITTED_SERVICE_TOOL", "PERMITTED_SYSTEM_ACTOR", "ALLOW_WITH_FLAG_ADMIN_TIER", "UNTRUSTED_ACTOR",
    "TRUST_LEVEL_INSUFFICIENT", "INJECTION_FLAGGED", "TOOL_NOT_IN_ALLOWLIST", "RUNTIME_LIMIT_EXCEEDED", "UNDEFENDED_POLICY_NO_CHECK"]) {
    assert.ok(REASON_TEXT[code], code);
  }
  assert.match(reasonText("SOMETHING_NEW"), /Only the code was recorded/);
  assert.match(reasonText(null), /No policy reason was recorded/);
  assert.ok(POLICY_TEXT.policy_defended_v1 && POLICY_TEXT.policy_undefended_v1);
});

test("decision facts show the recorded values and say when the trust level was not recorded", () => {
  const withTrust = decisionFacts(ev({ tool_name: "mock_config_write", policy_outcome: "DENY", policy_reason_code: "TRUST_LEVEL_INSUFFICIENT", actor_trust_level: 1, sequence_number: 4 }));
  assert.equal(withTrust.result, "Denied");
  const rows = Object.fromEntries(withTrust.rows);
  assert.equal(rows["Tool"], "mock_config_write");
  assert.equal(rows["Reason code"], "TRUST_LEVEL_INSUFFICIENT");
  assert.equal(rows["Source trust level"], "1 (user)");
  assert.equal(rows["Audit event"], "sequence 4");
  assert.match(withTrust.why, /need trust level 2/);
  for (const old of [undefined, null]) {
    assert.equal(Object.fromEntries(decisionFacts(ev({ tool_name: "t", actor_trust_level: old })).rows)["Source trust level"], "not recorded in this event");
  }
  assert.equal(trustText(0), "0 (untrusted)");
  const allowed = decisionFacts(ev({ event_type: "TOOL_CALL_EXECUTED", policy_outcome: "ALLOW" }));
  assert.match(allowed.result, /^Allowed/);
});

test("first difference text: scenario 1 names INJECTION_DETECTED and the policy that emits it, without inventing flags", () => {
  const a = { label: "Run A", mode: "undefended", event: ev({ event_type: "TOOL_CALL_PROPOSED", tool_name: "mock_data_exfiltrate" }) };
  const b = { label: "Run B", mode: "defended", event: ev({ event_type: "INJECTION_DETECTED" }) };
  const text = explainFirstDifference(a, b);
  assert.match(text, /Run B \(defended\) recorded INJECTION_DETECTED/);
  assert.match(text, /Run A \(undefended\) recorded TOOL_CALL_PROPOSED/);
  assert.doesNotMatch(text, /IMPERATIVE|KNOWN_INJECTION/);
  const swapped = explainFirstDifference({ ...b, label: "Run A" }, { ...a, label: "Run B" });
  assert.match(swapped, /Run A \(defended\) recorded INJECTION_DETECTED/);
  const tools = explainFirstDifference(
    { label: "Run A", mode: "undefended", event: ev({ event_type: "TOOL_CALL_EXECUTED", tool_name: "mock_config_write", policy_outcome: "ALLOW" }) },
    { label: "Run B", mode: "defended", event: ev({ event_type: "TOOL_CALL_DENIED", tool_name: "mock_config_write", policy_outcome: "DENY" }) });
  assert.match(tools, /TOOL_CALL_EXECUTED mock_config_write ALLOW/);
  assert.match(tools, /TOOL_CALL_DENIED mock_config_write DENY/);
});

test("the page says whether the first difference is the key decision", () => {
  const s2a = ev({ event_id: "a4", event_type: "TOOL_CALL_EXECUTED", sequence_number: 4 }), s2b = ev({ event_id: "b4", sequence_number: 4 });
  assert.deepEqual(relateFirstDifferenceToKeyDecision(s2a, s2b, s2a, s2b), { same: true, text: "The first event difference is the key decision." });
  const first = ev({ event_id: "inj", event_type: "INJECTION_DETECTED", sequence_number: 3 });
  const proposed = ev({ event_id: "p3", event_type: "TOOL_CALL_PROPOSED", sequence_number: 3 });
  const keyA = ev({ event_id: "ka", event_type: "TOOL_CALL_EXECUTED", sequence_number: 4 }), keyB = ev({ event_id: "kb", sequence_number: 5 });
  const relation = relateFirstDifferenceToKeyDecision(proposed, first, keyA, keyB);
  assert.equal(relation.same, false);
  assert.match(relation.text, /earlier than the key decision \(#4 in Run A and #5 in Run B\)/);
  assert.match(relateFirstDifferenceToKeyDecision(proposed, first, null, null).text, /Neither run reached/);
});

test("key decision sentence is built from the event and admits a missing decision", () => {
  assert.equal(keyDecisionSentence(ev({ tool_name: "mock_config_write", policy_reason_code: "TRUST_LEVEL_INSUFFICIENT" }), "mock_config_write"),
    "mock_config_write was denied by policy_defended_v1 (TRUST_LEVEL_INSUFFICIENT).");
  assert.match(keyDecisionSentence(null, "mock_config_write"), /No allow or deny decision for mock_config_write is recorded/);
});