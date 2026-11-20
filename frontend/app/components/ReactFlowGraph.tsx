"use client";

import { useEffect, useMemo } from "react";
import { Background, Handle, Position, ReactFlow, useReactFlow, useStore, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { buildGraph, GRAPH_WIDTH, type AuditNode } from "../lib/graphUtils";
import type { AgentEvent } from "../lib/types";

type SelectableNode = AuditNode & { data: AuditNode["data"] & {
  active?: boolean;
  onSelect?: (id: string) => void;
} };

function AuditGraphNode({ data, positionAbsoluteX, positionAbsoluteY, width, height }: NodeProps<SelectableNode>) {
  const { label, event, execution, active, onSelect } = data;
  const { getZoom, setCenter } = useReactFlow();

  return (
    <>
      <Handle type="target" position={Position.Left} />
      {event && !execution ? (
        <button
          type="button"
          className="graph-node nodrag nopan"
          data-event-id={event.event_id}
          data-kind={event.event_type}
          aria-pressed={active}
          aria-controls="audit-event-detail"
          onFocus={({ currentTarget }) => {
            if (!currentTarget.matches(":focus-visible") || !width || !height) return;
            const frame = currentTarget.closest(".graph-frame")?.getBoundingClientRect();
            const node = currentTarget.getBoundingClientRect();
            if (frame && (node.top < frame.top || node.bottom > frame.bottom || node.left < frame.left || node.right > frame.right)) {
              const zoom = Math.min(getZoom(), (frame.width - 16) / width);
              void setCenter(positionAbsoluteX + width / 2, positionAbsoluteY + height / 2, { zoom });
            }
          }}
          onClick={() => onSelect?.(event.event_id)}
        >
          <strong>#{event.sequence_number} {label}{event.policy_outcome ? ` · ${event.policy_outcome}` : ""}</strong>
          {event.tool_name && <code>{event.tool_name}</code>}
        </button>
      ) : (
        <div className="graph-node" data-executed-event-id={execution ? event?.event_id : undefined}>
          <strong>{label}</strong>
          {event?.tool_name && <code>{event.tool_name}</code>}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </>
  );
}
const nodeTypes = { audit: AuditGraphNode };

function GraphControls() {
  const { setViewport, zoomIn, zoomOut, fitView } = useReactFlow();
  const width = useStore((state) => state.width);

  useEffect(() => {
    if (width > 0) void setViewport({ x: 12, y: 12, zoom: Math.min(1, (width - 24) / GRAPH_WIDTH) });
  }, [setViewport, width]);

  return (
    <div className="graph-controls" role="group" aria-label="Graph view">
      <button type="button" className="action" aria-label="Zoom in" onClick={() => void zoomIn()}>+</button>
      <button type="button" className="action" aria-label="Zoom out" onClick={() => void zoomOut()}>−</button>
      <button type="button" className="action" onClick={() => void fitView({ padding: 0.12, maxZoom: 1 })}>Fit graph</button>
    </div>
  );
}

export default function ReactFlowGraph({ events, selectedId, onSelect }: {
  events: AgentEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { nodes, edges } = useMemo(() => buildGraph(events), [events]);
  const selectableNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    height: 62,
    handles: [
      { type: "target" as const, position: Position.Left, x: 0, y: 30 },
      { type: "source" as const, position: Position.Right, x: node.width ?? 0, y: 30 },
    ],
    data: { ...node.data, active: node.data.event?.event_id === selectedId, onSelect },
  })), [nodes, selectedId, onSelect]);

  return (
    <ReactFlow<SelectableNode>
      nodes={selectableNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      disableKeyboardA11y
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      minZoom={0.35}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--border)" gap={24} />
      <GraphControls />
    </ReactFlow>
  );
}
