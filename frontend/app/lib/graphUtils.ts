import type { Edge, Node } from "@xyflow/react";
import type { AgentEvent, EventType } from "./types";

export const EVENT_LABEL: Record<EventType, string> = {
  TOOL_CALL_PROPOSED: "Action proposed",
  TOOL_CALL_EXECUTED: "Policy decision",
  TOOL_CALL_DENIED: "Tool call blocked",
  INJECTION_DETECTED: "Injection detected",
  TRUST_CHECK_FAILED: "Trust check failed",
  EXECUTION_LIMIT_REACHED: "Execution limit reached",
  RUN_COMPLETE: "Run complete",
  RUN_ERROR: "Run error",
};

export type AuditNode = Node<{
  label: string;
  event?: AgentEvent;
  execution?: boolean;
}, "audit">;

export const GRAPH_WIDTH = 424;

export function buildGraph(events: readonly AgentEvent[]): { nodes: AuditNode[]; edges: Edge[] } {
  const nodes: AuditNode[] = [
    { id: "source", type: "audit", position: { x: 0, y: 0 }, data: { label: "Input source" }, width: 205 },
    { id: "agent", type: "audit", position: { x: 240, y: 0 }, data: { label: "Synthetic agent" }, width: 184 },
  ];
  const edges: Edge[] = [{
    id: "input-context", source: "source", target: "agent", className: "context-edge",
    type: "straight", selectable: false,
  }];

  [...events].sort((a, b) => a.sequence_number - b.sequence_number).forEach((event, index) => {
    const y = 61 + index * 70;
    const id = `event-${event.event_id}`;
    nodes.push({
      id, type: "audit", position: { x: 0, y }, width: 205,
      data: { label: EVENT_LABEL[event.event_type], event },
    });

    // This branch represents two facts from the same record.
    if (event.event_type === "TOOL_CALL_EXECUTED") {
      const target = `execution-${event.event_id}`;
      nodes.push({
        id: target, type: "audit", position: { x: 240, y }, width: 184,
        data: { label: "Mock tool executed", event, execution: true },
      });
      edges.push({ id: target, source: id, target, type: "straight", className: "execution-edge", selectable: false });
    }
  });

  return { nodes, edges };
}
