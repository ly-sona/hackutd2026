"use client";
import { useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import {
  UserRound,
  Database,
  Layers3,
  FileText,
  Settings2,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import { Button } from "./ui/button";
import { useAccess } from "./workspace-provider";
type RecordNode = Node<
  {
    title: string;
    kind: string;
    description: string;
    status?: string;
    tone?: string;
  },
  "record"
>;
const initialNodes: RecordNode[] = [
  {
    id: "account",
    position: { x: 0, y: 80 },
    data: {
      title: "Administrator A-09",
      kind: "ACCOUNT",
      description: "Synthetic account under investigation",
      status: "Compromise suspected",
      tone: "bg-red-400",
    },
    type: "record",
  },
  {
    id: "database",
    position: { x: 290, y: 80 },
    data: {
      title: "Customer Database",
      kind: "SYSTEM",
      description: "Containment report is disputed",
      status: "Containment disputed",
      tone: "bg-amber-400",
    },
    type: "record",
  },
  {
    id: "customers",
    position: { x: 580, y: 80 },
    data: {
      title: "October customers",
      kind: "RECORD GROUP",
      description: "1,240 records · Potential exposure",
    },
    type: "record",
  },
  {
    id: "record",
    position: { x: 860, y: 80 },
    data: {
      title: "C-1044",
      kind: "CUSTOMER RECORD",
      description: "Possible access path. Record access is not confirmed.",
    },
    type: "record",
  },
  {
    id: "operation",
    position: { x: 130, y: 310 },
    data: {
      title: "Customer support",
      kind: "OPERATION",
      description: "Business operation",
      status: "Restricted",
      tone: "bg-amber-400",
    },
    type: "record",
  },
  {
    id: "evidence",
    position: { x: 470, y: 310 },
    data: {
      title: "EV-018",
      kind: "EVIDENCE",
      description: "Network traffic log",
    },
    type: "record",
  },
];
const edges: Edge[] = [
  ["account", "database", "Can access"],
  ["database", "customers", "Contains"],
  ["customers", "record", "Contains"],
  ["operation", "database", "Depends on"],
  ["evidence", "database", "Supports claim"],
].map(([source, target, label]) => ({
  id: `${source}-${target}`,
  source,
  target,
  type: "smoothstep",
  sourceHandle:
    source === "operation" || source === "evidence" ? "top" : "right",
  targetHandle:
    source === "operation" || source === "evidence" ? "bottom" : "left",
  label,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#a1a1aa",
    width: 18,
    height: 18,
  },
  style: { stroke: "#a1a1aa", strokeWidth: 1.3 },
  labelStyle: { fill: "#ddd", fontSize: 12 },
  labelBgStyle: { fill: "#0b0b0d" },
}));
function ContextNode({ data, selected }: NodeProps<RecordNode>) {
  const Icon =
    data.kind === "ACCOUNT"
      ? UserRound
      : data.kind === "SYSTEM"
        ? Database
        : data.kind === "RECORD GROUP"
          ? Layers3
          : data.kind === "OPERATION"
            ? Settings2
            : FileText;
  return (
    <div
      className={`min-w-44 rounded-md border bg-[#0d0d0f] p-4 ${selected ? "border-2 border-white" : "border-neutral-600"}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="opacity-0"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        className="opacity-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="opacity-0"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        className="opacity-0"
      />
      <div className="flex items-start gap-3">
        <Icon size={21} strokeWidth={1.5} />
        <div>
          <p className="text-sm font-semibold">{data.title}</p>
          {data.kind !== "CUSTOMER RECORD" && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {data.kind}
            </p>
          )}
          {data.status ? (
            <p className="mt-2 flex items-center gap-1.5 text-[10px]">
              <span className={`size-2 rounded-full ${data.tone}`} />
              {data.status}
            </p>
          ) : (
            data.kind !== "CUSTOMER RECORD" && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                {data.description}
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}
const nodeTypes = { record: ContextNode };
export function ScopeGraph() {
  const access = useAccess();
  const [selectedId, setSelectedId] = useState("record");
  const selected = initialNodes.find((n) => n.id === selectedId)!;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div
        className="relative h-[510px] min-w-0 rounded-md border border-border lg:h-[570px]"
        aria-label="Synthetic context graph"
      >
        <ReactFlow
          nodes={initialNodes.map((n) => ({
            ...n,
            selected: n.id === selectedId,
          }))}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.07 }}
          minZoom={0.35}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={(_, node) => setSelectedId(node.id)}
        >
          <Background color="#454549" gap={18} size={0.6} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
        <button
          disabled
          className="absolute bottom-5 left-6 text-xs text-muted-foreground underline underline-offset-4"
          title="Record investigations are planned for Phase 3"
        >
          Browse 1,240 records →
        </button>
      </div>
      <aside className="space-y-5 border-t border-border pt-5 xl:border-t-0 xl:border-l xl:pt-4 xl:pl-6">
        <div>
          <p className="text-xs">{selected.data.kind}</p>
          <h2 className="mt-2 text-2xl font-semibold">{selected.data.title}</h2>
          <p className="mt-2 text-sm text-amber-300">● Under investigation</p>
        </div>
        <p className="border-y border-border py-4 text-sm leading-6">
          {selected.data.description}
        </p>
        <div className="flex justify-between text-sm">
          <span>Exfiltration</span>
          <span className="text-muted-foreground">Potential</span>
        </div>
        <details className="border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Other impacts
          </summary>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Customer support is restricted while containment remains unverified.
          </p>
        </details>
        <details className="border-y border-border py-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Evidence · 1 item
          </summary>
          <p className="mt-3 flex items-center gap-2 text-xs">
            <FileText size={13} />
            EV-018 · Network traffic log
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Synthetic evidence; no live validation.
          </p>
        </details>
        <Button
          disabled
          className="mt-3"
          title={
            access.can("scope:edit")
              ? "Investigations are planned for Phase 3"
              : "Your role has no scope editing permission"
          }
        >
          Assign investigation
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          Fixed synthetic context graph. Investigation actions are not
          implemented; the graph is a Phase 3 preview.
        </p>
      </aside>
    </div>
  );
}
