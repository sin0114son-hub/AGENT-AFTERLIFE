import assert from "node:assert/strict";
import { test } from "node:test";
import { navModeLabel, experimentModeLabel, NEUTRAL_LABEL } from "./app/lib/modeLabel.ts";
import { FEEDBACK_SCOPE, FEEDBACK_SAVED, GEMINI_DISCLOSURE, SIMULATION_DISCLOSURE } from "./app/lib/playgroundCopy.ts";

test("guided routes say GUIDED", () => {
  for (const p of ["/attack-lab", "/time-machine", "/evidence", "/attack-lab/x"]) assert.equal(navModeLabel(p), "MODE A · GUIDED");
});

test("playground never says GUIDED or SIMULATED in the global badge", () => {
  for (const p of ["/playground", "/playground/"]) {
    const label = navModeLabel(p);
    assert.equal(label, "EXPERIMENT");
    assert.doesNotMatch(label, /GUIDED|SIMULATED/);
  }
});

test("unknown, missing and lookalike routes are neutral", () => {
  for (const p of [undefined, null, "", "/", "/other", "/attack-labs", "/playgroundx"]) {
    const label = navModeLabel(p);
    assert.equal(label, NEUTRAL_LABEL);
    assert.doesNotMatch(label, /GUIDED|SIMULATED/);
  }
});

test("experiment label matches the selected mode only", () => {
  assert.match(experimentModeLabel("simulated"), /^SIMULATED/);
  assert.doesNotMatch(experimentModeLabel("simulated"), /GEMINI|GUIDED/);
  assert.match(experimentModeLabel("gemini"), /^GEMINI LIVE/);
  assert.doesNotMatch(experimentModeLabel("gemini"), /SIMULATED|GUIDED/);
  for (const m of [undefined, null, "", "Gemini", "live", 1]) assert.equal(experimentModeLabel(m), NEUTRAL_LABEL);
});

test("feedback and disclosure copy is accurate", () => {
  assert.match(FEEDBACK_SCOPE, /only in this browser tab/);
  assert.match(FEEDBACK_SCOPE, /not sent to the team/);
  assert.match(FEEDBACK_SAVED, /browser tab only/);
  assert.match(FEEDBACK_SAVED, /not sent to the team/);
  assert.match(GEMINI_DISCLOSURE, /sent to Google/);
  assert.match(SIMULATION_DISCLOSURE, /not on the text/);
  assert.match(SIMULATION_DISCLOSURE, /does not detect attacks or prove security/);
});
