"use client";
/**
 * ReactFlowGraph — thin wrapper around @xyflow/react.
 * Dynamically imported (ssr: false) from attack-lab and time-machine pages.
 */

import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Node, Edge } from "@xyflow/react";

interface Props {
  nodes: Node[];
  edges: Edge[];
}

export default function ReactFlowGraph({ nodes, edges }: Props) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: "var(--surface)" }}
      >
        <Background color="rgba(56,189,248,0.04)" gap={32} />
        <Controls
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6 }}
          showInteractive={false}
        />
        <MiniMap
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          nodeColor={(n) => (n.style?.border as string)?.replace("1.5px solid ", "") ?? "#555"}
          maskColor="rgba(11,16,32,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
