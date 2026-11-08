"use client";
import { ScopeSummaryStrip } from "./scope-summary";
import { EntityDetails } from "./scope-details";
import { RecordBrowser } from "./scope-record-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ReactFlow,
  Background,
  BaseEdge,
  getSmoothStepPath,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type NodeProps,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import {
  Database,
  UserRound,
  Layers3,
  FileText,
  Settings2,
  MoreHorizontal,
  SlidersHorizontal,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import { useAccess } from "./workspace-provider";
import { useScope } from "./scope-data";
import { AssetForm, AssociateAsset, RelationshipForm } from "./scope-forms";
import { fieldClass, Field } from "./incident-forms";
import { Button } from "./ui/button";
import { PageHeading } from "./workspace-ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  entityKinds,
  impactTypes,
  sensitivities,
  isConfirmed,
  isPending,
  type ScopeEntity,
} from "@/lib/scope";
type GraphNode = Node<
  {
    entity: ScopeEntity;
    status: string;
    dimension: string;
    potential: boolean;
  },
  "scope"
>;
const nodeTypes = { scope: EntityNode };
const edgeTypes = { scope: RelationshipEdge };
const columnGap = 144;
const columnWidths = [250, 250, 192, 250, 160];
const columnOffsets = columnWidths.map((_, index) =>
  columnWidths.slice(0, index).reduce((x, width) => x + width + columnGap, 0),
);
function RelationshipEdge(props: EdgeProps) {
  const vertical = props.sourcePosition === Position.Top;
  // Labels stay in the gaps between cards, including links that skip columns.
  const centerX =
    props.targetX +
    (props.targetPosition === Position.Right ? columnGap / 2 : -columnGap / 2);
  const centerY = props.sourceY - columnGap / 2;
  const [path, labelX, labelY] = getSmoothStepPath({
    ...props,
    ...(vertical ? { centerY } : { centerX }),
    offset: columnGap / 2,
  });
  return (
    <BaseEdge
      id={props.id}
      path={path}
      markerEnd={props.markerEnd}
      style={props.style}
      label={props.label}
      labelX={vertical ? labelX : centerX}
      labelY={vertical ? centerY : labelY}
      labelStyle={props.labelStyle}
      labelBgStyle={props.labelBgStyle}
      labelBgPadding={[6, 4]}
    />
  );
}
function EntityNode({ data, selected }: NodeProps<GraphNode>) {
  const e = data.entity,
    Icon =
      e.kind === "Account"
        ? UserRound
        : e.kind === "System"
          ? Database
          : e.kind === "Dataset" || e.kind === "Record Group"
            ? Layers3
            : e.kind === "Business Operation"
              ? Settings2
              : FileText;
  return (
    <div
      data-testid={`scope-node-${e.reference}`}
      data-entity-kind={e.kind}
      className={`${e.kind === "Record" ? "w-40" : e.kind === "Dataset" ? "w-48" : "w-[250px]"} rounded-md border bg-[#0d0d0d] p-4 ${selected ? "border-2 border-white" : "border-neutral-600"}`}
    >
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        style={{ top: "30%" }}
        className="opacity-0"
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        style={{ top: "30%" }}
        className="opacity-0"
      />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        style={{ top: "70%" }}
        className="opacity-0"
      />
      <Handle
        id="target-right"
        type="target"
        position={Position.Right}
        style={{ top: "70%" }}
        className="opacity-0"
      />
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        className="opacity-0"
      />
      <Handle
        id="bottom-left"
        type="target"
        position={Position.Bottom}
        style={{ left: "35%" }}
        className="opacity-0"
      />
      <Handle
        id="bottom-right"
        type="target"
        position={Position.Bottom}
        style={{ left: "65%" }}
        className="opacity-0"
      />
      <div className="flex items-start gap-2">
        <Icon size={19} className="shrink-0" />
        <div className="min-w-0 flex-1 break-words">
          <p className="line-clamp-2 text-lg font-semibold" title={e.name}>
            {e.kind === "Evidence" ? e.reference : e.name}
          </p>
          <p className="mt-1 text-[13px] uppercase text-muted-foreground">
            {e.kind}
          </p>
          {e.countKnown && ["Dataset", "Record Group"].includes(e.kind) && (
            <p className="mt-2 text-[13px]">
              {e.recordCount.toLocaleString("en-US")} records · inventory
            </p>
          )}
          <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground" title={e.name}>
            {e.kind !== "Evidence" && data.status !== "Unassessed" && (
              <span
                aria-hidden="true"
                className={`mr-1.5 inline-block size-2 rounded-full ${isConfirmed(data.status) ? "bg-red-400" : data.status === "Ruled Out" ? "bg-emerald-400" : "bg-amber-400"}`}
              />
            )}
            {e.kind === "Evidence"
              ? e.name
              : data.dimension
                ? data.dimension === "Compromise"
                  ? `Compromised: ${data.status.replace(/ Compromise$/, "")}`
                  : `${data.dimension}: ${data.status}`
                : data.status}
          </p>
        </div>
      </div>
    </div>
  );
}
export function ScopeWorkspace() {
  const a = useAccess();
  if (!a.can("scope:view"))
    return (
      <>
        <PageHeading
          title="Scope & evidence"
          description="Trace access, evidence, and business dependencies."
        />
        <p className="mt-8 border border-border p-6 text-sm">
          Scope access is restricted. Your role can review authorized impact
          summaries on Overview.
        </p>
      </>
    );
  return <ScopeCanvas />;
}
function ScopeCanvas() {
  const a = useAccess(),
    d = useScope(),
    params = useSearchParams(),
    requested = params.get("entity");
  const [selectedId, setSelectedId] = useState<string | null>(requested),
    [extra, setExtra] = useState<string[]>([]),
    [collapsed, setCollapsed] = useState<string[]>([]),
    [filterOpen, setFilterOpen] = useState(false),
    [toolsOpen, setToolsOpen] = useState(false),
    [detailOpen, setDetailOpen] = useState(false),
    [group, setGroup] = useState<string | null>(null),
    [error, setError] = useState("");
  const [filters, setFilters] = useState({
    kind: "",
    status: "",
    impact: "",
    sensitivity: "",
    evidence: "",
  });
  const loadRecord = d.loadRecord;
  const canRecords = a.can("scope:records");
  useEffect(() => {
    if (!requested || !canRecords) return;
    let active = true;
    loadRecord(requested)
      .then(() => {
        if (active) setExtra((old) => [...new Set([...old, requested])]);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [requested, canRecords, loadRecord]);
  const selected =
    d.entities.find((e) => e.id === selectedId) ??
    d.entities.find((e) => e.kind === "Record") ??
    d.entities.find((e) => e.defaultVisible) ??
    d.entities[0];
  const browseCount =
    selected?.kind === "Record Group"
      ? selected.recordCount
      : (d.entities.find(
          (e) => e.kind === "Record Group" && e.countKnown && e.recordCount > 0,
        )?.recordCount ?? 0);
  const browseText =
    selected?.kind === "Record Group" && !selected.countKnown
      ? "Browse enumerated records →"
      : `Browse ${browseCount.toLocaleString("en-US")} records →`;
  const choose = useCallback((e: ScopeEntity) => {
    setSelectedId(e.id);
    setExtra((old) => [...new Set([...old, e.id])]);
    setCollapsed((old) => old.filter((id) => id !== e.id));
    if (window.matchMedia("(max-width:1279px)").matches) setDetailOpen(true);
  }, []);
  const statusFor = useCallback(
    (entity: ScopeEntity) => {
      const assessments = d.assessments.filter((v) => v.entityId === entity.id);
      return (
        assessments.find((v) => v.dimension === "Compromise")?.status ??
        assessments.find((v) => isConfirmed(v.status))?.status ??
        assessments.find((v) => isPending(v.status))?.status ??
        assessments.find((v) => v.status === "Ruled Out")?.status ??
        "Unassessed"
      );
    },
    [d.assessments],
  );
  const graph = useMemo(() => {
    const focused = d.entities.filter(
      (e) =>
        ((e.defaultVisible && !["Finding", "Incident"].includes(e.kind)) ||
          !!filters.kind ||
          extra.includes(e.id) ||
          e.id === selected?.id) &&
        !collapsed.includes(e.id),
    );
    const entities = focused.filter(
      (e) =>
        (!filters.kind || e.kind === filters.kind) &&
        (!filters.sensitivity || e.sensitivity === filters.sensitivity) &&
        (!filters.status ||
          d.assessments.some(
            (s) =>
              s.entityId === e.id &&
              (!filters.impact || s.dimension === filters.impact) &&
              (filters.status === "Confirmed"
                ? isConfirmed(s.status)
                : filters.status === "Suspected"
                  ? isPending(s.status)
                  : s.status === filters.status),
          ) ||
          (filters.status === "Unassessed" &&
            !d.assessments.some(
              (s) =>
                s.entityId === e.id &&
                (!filters.impact || s.dimension === filters.impact),
            ))) &&
        (!filters.impact ||
          d.assessments.some(
            (s) => s.entityId === e.id && s.dimension === filters.impact,
          )) &&
        (!filters.evidence ||
          (filters.evidence === "linked") ===
            (e.kind === "Evidence" ||
              d.links.some((l) => l.entityId === e.id))),
    );
    const limited = entities.slice(0, 50);
    const ids = new Set(limited.map((e) => e.id));
    const positions: Record<string, number> = {
      Incident: 0,
      Account: 0,
      System: 1,
      Dataset: 2,
      "Record Group": 3,
      Record: 4,
      Evidence: 1,
      "Business Operation": 1,
      Finding: 3,
    };
    const lowerKinds = ["Evidence", "Business Operation"];
    const assetCounts = new Map<number, number>();
    for (const entity of limited) {
      if (lowerKinds.includes(entity.kind)) continue;
      const column = positions[entity.kind] ?? 0;
      assetCounts.set(column, (assetCounts.get(column) ?? 0) + 1);
    }
    const lowerY = 160 + Math.max(1, ...assetCounts.values()) * 280;
    const evidenceX = Math.max(
      columnOffsets[1] + 80,
      120 + limited.filter((e) => e.kind === "Business Operation").length * (250 + columnGap),
    );
    const counts = new Map<string, number>();
    const nodes: GraphNode[] = limited.map((e) => {
      const col = positions[e.kind] ?? 0;
      const key = ["Evidence", "Business Operation"].includes(e.kind)
        ? e.kind
        : String(col);
      const row = counts.get(key) ?? 0;
      counts.set(key, row + 1);
      return {
        id: e.id,
        type: "scope",
        position:
          e.kind === "Business Operation"
            ? { x: 120 + row * (250 + columnGap), y: lowerY }
            : e.kind === "Evidence"
              ? { x: evidenceX + row * (250 + columnGap), y: lowerY }
              : {
                  x: columnOffsets[col] ?? col * 394,
                  y: 80 + row * 280,
                },
        selected: e.id === selected?.id,
        data: {
          entity: e,
          status: statusFor(e),
          dimension:
            d.assessments.find(
              (a) => a.entityId === e.id && a.status === statusFor(e),
            )?.dimension ?? "",
          potential: d.leads.some((l) => l.entityId === e.id),
        },
      };
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edges: Edge[] = d.relationships
      .filter((r) => ids.has(r.sourceId) && ids.has(r.targetId))
      .map((r) => {
        const source = byId.get(r.sourceId)!;
        const target = byId.get(r.targetId)!;
        const vertical = lowerKinds.includes(source.data.entity.kind) &&
          target.data.entity.kind === "System";
        return {
          id: r.id,
          source: r.sourceId,
          target: r.targetId,
          sourceHandle: vertical
            ? "top"
            : source.position.x > target.position.x ? "source-left" : "source-right",
          targetHandle: vertical
            ? source.data.entity.kind === "Evidence" ? "bottom-right" : "bottom-left"
            : source.position.x >= target.position.x ? "target-right" : "target-left",
          type: "scope",
          label: r.type.toLowerCase().replaceAll("_", " "),
          markerEnd: { type: MarkerType.ArrowClosed, color: "#a1a1aa" },
          style: {
            stroke: r.status === "Confirmed" ? "#a1a1aa" : "#8a8a8a",
            strokeDasharray: r.status === "Confirmed" ? undefined : "5 4",
          },
          labelStyle: { fill: "#ddd", fontSize: 14 },
          labelBgStyle: { fill: "#0b0b0d" },
          data: { status: r.status },
        };
      });
    return { nodes, edges };
  }, [
    d.entities,
    d.relationships,
    d.assessments,
    d.links,
    d.leads,
    extra,
    collapsed,
    filters,
    selected?.id,
    statusFor,
  ]);
  const related = selected
    ? d.relationships.flatMap((r) =>
        r.sourceId === selected.id
          ? [r.targetId]
          : r.targetId === selected.id
            ? [r.sourceId]
            : [],
      )
    : [];
  const browse = (id: string) => {
    setGroup(id);
    setDetailOpen(false);
  };
  const selectRecord = async (id: string) => {
    try {
      const e = await d.loadRecord(id);
      setGroup(null);
      choose(e);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageHeading
        title="Scope & evidence"
        description="Trace access, evidence, and business dependencies."
        actions={
          <>
            <Button variant="outline" onClick={() => setFilterOpen(true)}>
              <SlidersHorizontal size={18} />
              Filter
            </Button>
            <Button
              variant="ghost"
              aria-label="Graph tools"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen(!toolsOpen)}
            >
              <MoreHorizontal size={22} />
            </Button>
          </>
        }
      />
      {toolsOpen && (
        <section
          aria-label="Graph tools"
          className="mb-6 space-y-5 rounded-lg border border-border p-5"
        >
          <div className="flex flex-wrap gap-3">
            {a.can("scope:edit") && (
              <>
                <AssetForm />
                <RelationshipForm />
                <AssociateAsset />
              </>
            )}
          </div>
          <ScopeSummaryStrip summary={d.summary} />
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              aria-label="Find scope entity"
              className={`${fieldClass} max-w-80`}
              value={selected?.id ?? ""}
              onChange={(e) => {
                const entity = d.entities.find((v) => v.id === e.target.value);
                if (entity) choose(entity);
              }}
            >
              {d.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.kind}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setExtra((old) => [
                  ...new Set([...old, ...related.slice(0, 25)]),
                ]);
                setCollapsed((old) =>
                  old.filter((id) => !related.includes(id)),
                );
              }}
            >
              Expand related
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setCollapsed((old) => [
                  ...new Set([
                    ...old,
                    ...related.filter((id) => id !== selected?.id),
                  ]),
                ])
              }
            >
              Collapse related
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setExtra([]);
                setCollapsed([]);
                setFilters({
                  kind: "",
                  status: "",
                  impact: "",
                  sensitivity: "",
                  evidence: "",
                });
              }}
            >
              Reset focus
            </Button>
            <span className="text-xs text-muted-foreground">
              {graph.nodes.length} nodes shown · dashed links are unverified or
              suspected
            </span>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div
          className="relative h-[540px] min-w-0 overflow-hidden rounded-md border border-border lg:h-[620px]"
          aria-label="Incident context graph"
          data-testid="scope-graph"
        >
          <ReactFlow
            key={`${a.incidentId}:${filters.kind}:${filters.status}:${filters.impact}:${filters.sensitivity}:${filters.evidence}`}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode="dark"
            style={{ background: "#090909" }}
            fitView
            fitViewOptions={{ padding: 0.05 }}
            minZoom={0.2}
            maxZoom={1.8}
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(_, node) => choose(node.data.entity)}
          >
            <Background color="#686868" gap={18} size={0.85} />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
          {a.can("scope:records") && (
            <button
              className="absolute bottom-5 left-5 rounded bg-background/90 px-2 py-1 text-xs underline underline-offset-4"
              onClick={() => {
                const selectedGroup =
                  selected?.kind === "Record Group"
                    ? selected
                    : d.entities.find(
                        (e) =>
                          e.kind === "Record Group" &&
                          e.countKnown &&
                          e.recordCount > 0,
                      );
                if (selectedGroup) browse(selectedGroup.id);
              }}
            >
              {browseText}
            </button>
          )}
          {!d.ready && (
            <p role="status" className="absolute top-4 left-4 text-sm">
              Loading authorized graph…
            </p>
          )}
          {d.ready && !d.entities.length && (
            <p className="absolute top-4 left-4 text-sm text-muted-foreground">
              No scope inventory is associated yet. Add an asset to begin.
            </p>
          )}
        </div>
        <aside
          className="hidden min-w-0 border-l border-border pl-6 xl:block xl:max-h-[620px] xl:overflow-y-auto xl:pr-2"
          data-testid="scope-detail"
        >
          {selected && (
            <EntityDetails
              entity={selected}
              select={choose}
              browse={browse}
              compact
              expand={() => setDetailOpen(true)}
            />
          )}
        </aside>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          Dashed links are uncertain. Access paths do not prove record impact.
        </span>
      </div>
      <Button
        variant="outline"
        className="mt-4 xl:hidden"
        onClick={() => setDetailOpen(true)}
      >
        Open selected entity details
      </Button>
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Entity investigation</DialogTitle>
            <DialogDescription>
              Incident-specific assessments and original evidence.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <EntityDetails entity={selected} select={choose} browse={browse} />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filter incident graph</DialogTitle>
            <DialogDescription>
              Filters change this view, not stored incident data.
            </DialogDescription>
          </DialogHeader>
          {(
            [
              { key: "kind", label: "Entity type", values: entityKinds },
              {
                key: "status",
                label: "Investigation status",
                values: [
                  "Unassessed",
                  "Investigating",
                  "Suspected",
                  "Confirmed",
                  "Ruled Out",
                ],
              },
              { key: "impact", label: "Impact type", values: impactTypes },
              {
                key: "sensitivity",
                label: "Sensitivity",
                values: sensitivities,
              },
              {
                key: "evidence",
                label: "Evidence availability",
                values: ["linked", "unlinked"],
              },
            ] as const
          ).map((f) => (
            <Field key={f.key} label={f.label}>
              <select
                className={fieldClass}
                aria-label={`Filter ${f.label.toLowerCase()}`}
                value={filters[f.key]}
                onChange={(e) =>
                  setFilters((old) => ({ ...old, [f.key]: e.target.value }))
                }
              >
                <option value="">All</option>
                {f.values.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
          ))}
          <Button onClick={() => setFilterOpen(false)}>Apply filters</Button>
        </DialogContent>
      </Dialog>
      {group && (
        <RecordBrowser
          groupId={group}
          close={() => setGroup(null)}
          select={selectRecord}
        />
      )}
    </>
  );
}
