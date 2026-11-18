import assert from "node:assert/strict";
import { test } from "node:test";
import { describeLiveFailure, presetById, PRESETS } from "./app/lib/playgroundScenarios.ts";

test("each live failure code maps to its own message without provider text", () => {
  const codes = ["not_configured", "consent_required", "access_denied", "usage_limit", "quota_unavailable", "provider_rate_limit", "timeout", "no_response", "provider_error"];
  const messages = codes.map(code => describeLiveFailure(500, { detail: { code, message: "PRIVATE" } }).message);
  assert.equal(new Set(messages).size, codes.length);
  for (const m of messages) assert.doesNotMatch(m, /PRIVATE/);
});

test("unknown or malformed error bodies get a generic message", () => {
  for (const body of [null, {}, { detail: "x" }, { detail: { code: "nope" } }, "text"]) {
    assert.equal(describeLiveFailure(502, body).code, "unknown");
  }
  assert.equal(describeLiveFailure(422, { detail: [] }).code, "invalid_input");
});

test("guided presets match the two server scenarios and custom is last", () => {
  assert.deepEqual(PRESETS.map(p => p.id), ["scenario_01_prompt_injection", "scenario_02_trust_escalation", "custom"]);
  assert.equal(presetById("custom").text, "");
});
