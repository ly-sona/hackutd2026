"use client";
import { TaskForm } from "./coordination-tasks";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useAccess } from "./workspace-provider";
import { useScope } from "./scope-data";
import { useIncident } from "./incident-data";
import { FindingForm } from "./incident-forms";
import {
  AssetForm,
  AssessmentForm,
  LinkScopeEvidence,
  RelationshipForm,
} from "./scope-forms";
import { EvidenceButton, AttachEvidence } from "./evidence-panel";
import { Button } from "./ui/button";
import {
  impactTypes,
  isConfirmed,
  type ScopeEntity,
  type ScopeAssessment,
} from "@/lib/scope";
import { incidentBase } from "@/lib/roles";
import { incidentTime } from "@/lib/incident-model";
export function EntityDetails({
  entity: e,
  select,
  browse,
}: {
  entity: ScopeEntity;
  select: (e: ScopeEntity) => void;
  browse: (id: string) => void;
}) {
  const a = useAccess(),
    d = useScope(),
    incident = useIncident(),
    base = incidentBase(a.organizationId, a.incidentId);
  const assessments = d.assessments.filter((v) => v.entityId === e.id),
    links = d.links.filter((l) => l.entityId === e.id),
    lead = d.leads.find((l) => l.entityId === e.id),
    relationships = d.relationships.filter(
      (r) => r.sourceId === e.id || r.targetId === e.id,
    ),
    evidence =
      e.kind === "Evidence"
        ? incident.evidence.find((item) => item.id === e.reference)
        : undefined;
  const findings = new Set([
    ...assessments.map((v) => v.findingId).filter(Boolean),
    ...relationships.flatMap((r) => {
      const other = r.sourceId === e.id ? r.targetId : r.sourceId;
      return other.startsWith("finding:") ? [other.slice(8)] : [];
    }),
  ]);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase text-muted-foreground">{e.kind}</p>
        <h2 className="mt-2 break-words text-2xl font-semibold">{e.name}</h2>
        <p className="mt-2 text-xs text-muted-foreground">{e.reference}</p>
      </div>
      <p className="border-y border-border py-4 text-sm leading-6">
        {e.description}
      </p>
      {e.owner && (
        <p className="text-xs text-muted-foreground">Owner · {e.owner}</p>
      )}
      {["Dataset", "Record Group", "Record"].includes(e.kind) && (
        <div className="space-y-2 text-xs">
          <p>
            {e.dataCategory} · {e.sensitivity}
          </p>
          {e.countKnown && e.kind !== "Record" && (
            <p>
              <strong>{e.recordCount.toLocaleString("en-US")}</strong> inventory
              records · not a verified impact count
            </p>
          )}
          {e.kind === "Record" && (
            <p className="text-amber-300">
              Individual access is unconfirmed unless supported by a specific
              verified assessment.
            </p>
          )}
          {[e.parentId, e.datasetId]
            .filter((id, index, all) => id && all.indexOf(id) === index)
            .map((id) => {
              const parent = d.entities.find((v) => v.id === id);
              return (
                parent && (
                  <button
                    key={id}
                    className="block underline underline-offset-4"
                    onClick={() => select(parent)}
                  >
                    {parent.kind}: {parent.name}
                  </button>
                )
              );
            })}
        </div>
      )}
      {lead && (
        <div className="border-l-2 border-amber-400/70 pl-3">
          <h3 className="text-xs font-semibold text-amber-300">
            Potential impact lead
          </h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {lead.explanation}
          </p>
        </div>
      )}
      {[
        "Account",
        "System",
        "Dataset",
        "Record Group",
        "Record",
        "Business Operation",
      ].includes(e.kind) && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Incident assessments</h3>
          {(["Account", "System", "Business Operation"].includes(e.kind)
            ? impactTypes
            : impactTypes.filter((v) => v !== "Compromise")
          ).map((dimension) => {
            const assessment = assessments.find(
              (s) => s.dimension === dimension,
            );
            return (
              <div
                key={dimension}
                className="border-b border-border py-3"
                data-testid={`assessment-${dimension}`}
              >
                <div className="flex justify-between gap-2 text-xs">
                  <span>{dimension}</span>
                  <span
                    className={
                      assessment && isConfirmed(assessment.status)
                        ? "text-red-400"
                        : assessment?.status === "Ruled Out"
                          ? "text-emerald-400"
                          : "text-amber-300"
                    }
                  >
                    {assessment?.status ?? "Unassessed"}
                  </span>
                </div>
                {assessment && (
                  <AssessmentDetail assessment={assessment} entity={e} />
                )}
              </div>
            );
          })}
        </section>
      )}
      {evidence && (
        <>
          <dl className="grid grid-cols-[80px_1fr] gap-2 text-xs">
            <dt>Source</dt>
            <dd>{evidence.source}</dd>
            <dt>Uploaded</dt>
            <dd>{incidentTime(evidence.uploadedAt)}</dd>
          </dl>
          <EvidenceButton evidence={evidence} annotations={links} />
        </>
      )}
      {e.kind === "Finding" && (
        <Button variant="outline" asChild>
          <Link
            href={`${base}/overview?finding=${encodeURIComponent(e.reference)}`}
          >
            Open Phase 2 finding
          </Link>
        </Button>
      )}
      <details open className="border-y border-border py-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Evidence · {new Set(links.map((l) => l.evidenceId)).size} linked
          originals
        </summary>
        <div className="mt-3 space-y-3">
          {[...new Set(links.map((l) => l.evidenceId))].map((id) => {
            const ev = incident.evidence.find((v) => v.id === id);
            return (
              ev && (
                <div key={id}>
                  <EvidenceButton
                    evidence={ev}
                    annotations={links.filter((l) => l.evidenceId === id)}
                  />
                  {links
                    .filter((l) => l.evidenceId === id)
                    .map((l) => (
                      <p
                        key={l.id}
                        className="mt-2 text-[11px] leading-5 text-muted-foreground"
                      >
                        {l.annotation}
                      </p>
                    ))}
                </div>
              )
            );
          })}
          {!links.length && (
            <p className="text-xs text-muted-foreground">
              No supporting evidence linked to this entity yet.
            </p>
          )}
        </div>
      </details>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Related entities</h3>
        {relationships.slice(0, 20).map((r) => {
          const target = d.entities.find(
            (v) => v.id === (r.sourceId === e.id ? r.targetId : r.sourceId),
          );
          return (
            target && (
              <button
                className="flex w-full items-center gap-2 border-b border-border py-3 text-left text-xs"
                key={r.id}
                onClick={() => select(target)}
              >
                <span>
                  <span className="block">{target.name}</span>
                  <span className="mt-1 block text-muted-foreground">
                    {r.type} · {r.status}
                    <br />
                    {r.justification}
                  </span>
                </span>
                <ChevronRight size={13} className="ml-auto shrink-0" />
              </button>
            )
          );
        })}
      </section>
      {findings.size > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Related findings</h3>
          {[...findings].map((id) => (
            <Link
              className="mb-2 block text-xs underline"
              key={id}
              href={`${base}/overview?finding=${encodeURIComponent(id)}`}
            >
              {incident.findings.find((f) => f.id === id)?.title ?? id}
            </Link>
          ))}
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        {!["Evidence", "Finding", "Incident"].includes(e.kind) && (
          <TaskForm
            title={`Investigate ${e.name}`}
            description={e.description}
            references={[{ kind: "scope", id: e.id }]}
          />
        )}
        {e.kind === "Record Group" && a.can("scope:records") && (
          <Button size="sm" variant="outline" onClick={() => browse(e.id)}>
            {e.countKnown
              ? `Browse ${e.recordCount.toLocaleString("en-US")} records`
              : "Browse enumerated records"}
          </Button>
        )}
        {a.can("scope:edit") &&
          !["Evidence", "Finding", "Incident"].includes(e.kind) && (
            <>
              <AssessmentForm key={e.id} entity={e} />
              <LinkScopeEvidence entity={e} />
              <FindingForm scopeEntityId={e.id} relatedSystem={e.name} />
              {["Account", "System", "Business Operation"].includes(e.kind) && (
                <AssetForm entity={e} />
              )}
              <RelationshipForm source={e} />
            </>
          )}
        {a.can("evidence:upload") && <AttachEvidence />}
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        Upload through the existing evidence action, then link the resulting
        artifact. No graph action executes containment, approval or recovery.
      </p>
    </div>
  );
}
function AssessmentDetail({
  assessment: s,
  entity,
}: {
  assessment: ScopeAssessment;
  entity: ScopeEntity;
}) {
  const a = useAccess();
  return (
    <>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        {s.description}
      </p>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Assessed by {s.assessedBy} · {incidentTime(s.updatedAt)}
        {s.verifiedBy && (
          <>
            {" "}
            · Verified by {s.verifiedBy} at {incidentTime(s.verifiedAt)}
          </>
        )}
      </p>
      <div className="mt-2">
        <TaskForm
          title={`Review ${entity.name}: ${s.dimension}`}
          description={s.description}
          references={[
            { kind: "assessment", id: s.id },
            { kind: "scope", id: entity.id },
          ]}
        />
      </div>
      {a.can("scope:edit") && (
        <div className="mt-2">
          <AssessmentForm key={s.id} entity={entity} assessment={s} />
        </div>
      )}
    </>
  );
}
