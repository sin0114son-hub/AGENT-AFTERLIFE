/**
 * Converts AgentEvent[] into React Flow nodes and edges.
 * Layout is deterministic — positions are computed from sequence_number.
 */

import type { Node, Edge } from "@xyflow/react";
import type { AgentEvent } from "./types";

/** Fixed anchor nodes always present */
export const STATIC_NODES: Node[] = [
  {
    id: "source",
    type: "default",
    position: { x: 60, y: 240 },
    data: { label: "🌐 Untrusted Source" },
    style: {
      background: "rgba(251,113,133,0.15)",
      border: "1.5px solid #FB7185",
      color: "#FB7185",
      borderRadius: 10,
      padding: "10px 16px",
      fontSize: 13,
      fontWeight: 600,
    },
  },
  {
    id: "agent",
    type: "default",
    position: { x: 300, y: 240 },
    data: { label: "🤖 Synthetic Agent" },
    style: {
      background: "rgba(56,189,248,0.15)",
      border: "1.5px solid #38BDF8",
      color: "#38BDF8",
      borderRadius: 10,
      padding: "10px 16px",
      fontSize: 13,
      fontWeight: 600,
    },
  },
  {
    id: "policy",
    type: "default",
    position: { x: 540, y: 120 },
    data: { label: "🛡 Policy Engine" },
    style: {
      background: "rgba(52,211,153,0.15)",
      border: "1.5px solid #34D399",
      color: "#34D399",
      borderRadius: 10,
      padding: "10px 16px",
      fontSize: 13,
      fontWeight: 600,
    },
  },
  {
    id: "tools",
    type: "default",
    position: { x: 540, y: 360 },
    data: { label: "🔧 Mock Tools" },
    style: {
      background: "rgba(251,191,36,0.15)",
      border: "1.5px solid #FBBF24",
      color: "#FBBF24",
      borderRadius: 10,
      padding: "10px 16px",
      fontSize: 13,
      fontWeight: 600,
    },
  },
];

function colorForEvent(type: string): string {
  if (type === "TOOL_CALL_DENIED" || type === "TRUST_CHECK_FAILED") return "#FB7185";
  if (type === "INJECTION_DETECTED") return "#F97316";
  if (type === "TOOL_CALL_EXECUTED") return "#34D399";
  if (type === "RUN_COMPLETE") return "#38BDF8";
  if (type === "RUN_ERROR" || type === "EXECUTION_LIMIT_REACHED") return "#F43F5E";
  return "#94A3B8";
}

function labelForEvent(ev: AgentEvent): string {
  const short: Record<string, string> = {
    TOOL_CALL_PROPOSED: `📤 Propose: ${ev.tool_name ?? "?"}`,
    TOOL_CALL_EXECUTED: `✅ Executed: ${ev.tool_name ?? "?"}`,
    TOOL_CALL_DENIED: `🚫 Denied: ${ev.tool_name ?? "?"}`,
    INJECTION_DETECTED: "⚠️ Injection",
    TRUST_CHECK_FAILED: "🔴 Trust fail",
    EXECUTION_LIMIT_REACHED: "⏱ Limit",
    RUN_COMPLETE: "🏁 Complete",
    RUN_ERROR: "💥 Error",
  };
  return short[ev.event_type] ?? ev.event_type;
}

export function buildGraph(events: AgentEvent[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [...STATIC_NODES];
  const edges: Edge[] = [
    { id: "src-agent", source: "source", target: "agent", animated: true, style: { stroke: "#FB7185", strokeDasharray: "5 3" } },
    { id: "agent-policy", source: "agent", target: "policy", style: { stroke: "#38BDF8" } },
    { id: "agent-tools", source: "agent", target: "tools", style: { stroke: "#FBBF24" } },
  ];

  events.forEach((ev, i) => {
    const col = Math.floor(i / 4);
    const row = i % 4;
    const x = 820 + col * 200;
    const y = 60 + row * 120;
    const color = colorForEvent(ev.event_type);

    nodes.push({
      id: ev.event_id,
      type: "default",
      position: { x, y },
      data: { label: labelForEvent(ev) },
      style: {
        background: `${color}1A`,
        border: `1.5px solid ${color}`,
        color,
        borderRadius: 8,
        padding: "6px 12px",
        fontSize: 11,
        fontWeight: 600,
        maxWidth: 160,
      },
    });

    // Connect to policy or tools based on event type
    const sourceNode =
      ev.event_type === "TOOL_CALL_PROPOSED" ||
      ev.event_type === "TOOL_CALL_DENIED" ||
      ev.event_type === "TRUST_CHECK_FAILED" ||
      ev.event_type === "INJECTION_DETECTED"
        ? "policy"
        : ev.event_type === "TOOL_CALL_EXECUTED"
        ? "tools"
        : "agent";

    edges.push({
      id: `edge-${ev.event_id}`,
      source: sourceNode,
      target: ev.event_id,
      style: { stroke: color, opacity: 0.6 },
    });
  });

  return { nodes, edges };
}
