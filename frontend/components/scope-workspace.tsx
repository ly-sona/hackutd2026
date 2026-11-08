"use client";
import { ScopeSummaryStrip } from "./scope-summary";
import { EntityDetails } from "./scope-details";
import { RecordBrowser } from "./scope-record-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type NodeProps,
  type Edge,
} from "@xyflow/react";
import {
  Database,
  UserRound,
  Layers3,
  FileText,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import { useAccess } from "./workspace-provider";
import { ScopeDataProvider, useScope } from "./scope-data";
import { AssetForm, AssociateAsset, RelationshipForm } from "./scope-forms";
import { fieldClass, Field } from "./incident-forms";
import { Button } from "./ui/button";
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
      className={`w-48 rounded-md border bg-[#0d0d0f] p-3 ${selected ? "border-2 border-white" : "border-neutral-600"}`}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
      <div className="flex items-start gap-2">
        <Icon size={19} className="shrink-0" />
        <div>
          <p className="text-sm font-semibold">{e.name}</p>
          <p className="mt-1 text-[10px] uppercase text-muted-foreground">
            {e.kind}
          </p>
          {e.countKnown && ["Dataset", "Record Group"].includes(e.kind) && (
            <p className="mt-2 text-[10px]">
              {e.recordCount.toLocaleString("en-US")} records · inventory
            </p>
          )}
          <p
            className={`mt-2 text-[10px] ${isConfirmed(data.status) ? "text-red-400" : data.status === "Ruled Out" ? "text-emerald-400" : "text-amber-300"}`}
          >
            {data.dimension ? `${data.dimension}: ${data.status}` : data.status}
          </p>
          {data.potential && (
            <p className="mt-1 text-[10px] text-amber-300">
              Potential path · investigate
            </p>
          )}
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
        <h1 className="text-3xl font-semibold">Scope & evidence</h1>
        <p className="mt-3 text-muted-foreground">
          Trace access, evidence, and business dependencies.
        </p>
        <p className="mt-8 border border-border p-6 text-sm">
          Scope access is restricted. Your role can review authorized impact
          summaries on Overview.
        </p>
      </>
    );
  return (
    <ScopeDataProvider key={`${a.organizationId}:${a.incidentId}`}>
      <ScopeCanvas />
    </ScopeDataProvider>
  );
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
        (e.defaultVisible || extra.includes(e.id) || e.id === selected?.id) &&
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
    const counts = new Map<number, number>();
    const nodes: GraphNode[] = limited.map((e) => {
      const col = positions[e.kind] ?? 0;
      const row = counts.get(col) ?? 0;
      counts.set(col, row + 1);
      return {
        id: e.id,
        type: "scope",
        position: { x: col * 265, y: row * 175 },
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
    const edges: Edge[] = d.relationships
      .filter((r) => ids.has(r.sourceId) && ids.has(r.targetId))
      .map((r) => ({
        id: r.id,
        source: r.sourceId,
        target: r.targetId,
        type: "smoothstep",
        label: r.type.toLowerCase().replaceAll("_", " "),
        markerEnd: { type: MarkerType.ArrowClosed, color: "#a1a1aa" },
        style: {
          stroke: r.status === "Confirmed" ? "#a1a1aa" : "#d6aa47",
          strokeDasharray: r.status === "Confirmed" ? undefined : "5 4",
        },
        labelStyle: { fill: "#ddd", fontSize: 11 },
        labelBgStyle: { fill: "#0b0b0d" },
        data: { status: r.status },
      }));
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Scope & evidence
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Trace access, evidence, and business dependencies.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.can("scope:edit") && (
            <>
              <AssetForm />
              <RelationshipForm />
            </>
          )}
          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal size={15} />
            Filter
          </Button>
        </div>
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
            setExtra((old) => [...new Set([...old, ...related.slice(0, 25)])]);
            setCollapsed((old) => old.filter((id) => !related.includes(id)));
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
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div
          className="relative h-[570px] min-w-0 rounded-md border border-border lg:h-[640px]"
          aria-label="Incident context graph"
          data-testid="scope-graph"
        >
          <ReactFlow
            key={`${a.incidentId}:${filters.kind}:${filters.status}:${filters.impact}:${filters.sensitivity}:${filters.evidence}`}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            colorMode="dark"
            fitView
            fitViewOptions={{ padding: 0.1 }}
            minZoom={0.2}
            maxZoom={1.8}
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(_, node) => choose(node.data.entity)}
          >
            <Background color="#454549" gap={18} size={0.6} />
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
          className="hidden min-w-0 border-l border-border pl-6 xl:block xl:max-h-[640px] xl:overflow-y-auto xl:pr-2"
          data-testid="scope-detail"
        >
          {selected && (
            <EntityDetails entity={selected} select={choose} browse={browse} />
          )}
        </aside>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          Solid: documented relationship · Dashed: uncertainty · Potential paths
          do not prove impact.
        </span>
        {a.can("scope:edit") && <AssociateAsset />}
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
