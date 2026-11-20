import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGraph } from "./app/lib/graphUtils.ts";

test("graph shows only recorded executions, in audit order", () => {
  assert.equal(buildGraph([]).edges.length, 1);
  const events = [
    {event_id: "blocked", sequence_number: 4, event_type: "TOOL_CALL_DENIED", tool_name: "mock_write"},
    {event_id: "proposed", sequence_number: 3, event_type: "TOOL_CALL_PROPOSED", tool_name: "mock_write"},
    {event_id: "observed", sequence_number: 2, event_type: "INJECTION_DETECTED"},
    {event_id: "ran", sequence_number: 1, event_type: "TOOL_CALL_EXECUTED", tool_name: "mock_read"},
  ];
  const { nodes, edges } = buildGraph(events);
  assert.deepEqual(nodes.filter(node => node.data.event && !node.data.execution).map(node => node.data.event.event_id),
    ["ran", "observed", "proposed", "blocked"]);
  assert.deepEqual(nodes.filter(node => node.data.execution).map(node => node.data.event.event_id), ["ran"]);
  assert.deepEqual(edges.slice(1).map(({source, target}) => [source, target]), [["event-ran", "execution-ran"]]);
});
