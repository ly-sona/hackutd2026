"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import {
  assetTypes,
  impactTypes,
  impactStates,
  compromiseStates,
  relationshipTypes,
  readScope,
  type ScopeEntity,
  type ScopeAssessment,
} from "@/lib/scope";
import { useIncident } from "./incident-data";
import { useScope } from "./scope-data";
import { Editor, Field, Select, fieldClass } from "./incident-forms";
import { Input } from "./ui/input";
const val = (f: FormData, name: string) => String(f.get(name) ?? "");
function EvidenceChoices({ defaults = [] }: { defaults?: string[] }) {
  const d = useIncident();
  return (
    <fieldset className="max-h-40 overflow-y-auto rounded border border-border p-3">
      <legend className="px-1 text-sm">Existing supporting evidence</legend>
      {d.evidence.map((e) => (
        <label className="flex gap-2 py-1 text-xs" key={e.id}>
          <input
            name="evidenceIds"
            type="checkbox"
            value={e.id}
            defaultChecked={defaults.includes(e.id)}
          />
          {e.id.startsWith("EV-0") ? e.id : e.filename} · {e.description}
        </label>
      ))}
    </fieldset>
  );
}
export function AssetForm({ entity }: { entity?: ScopeEntity }) {
  const d = useScope();
  const old =
    entity &&
    d.assessments.find(
      (a) => a.entityId === entity.id && a.dimension === "Compromise",
    );
  return (
    <Editor
      title={entity ? "Update asset" : "Add asset"}
      trigger={entity ? "Update asset" : "Add asset"}
      description="Inventory and compromise are separate. Confirmed compromise requires evidence and an authorized verifier."
      onSubmit={(f) =>
        api("scope", {
          ...d.scope,
          action: entity ? "asset.update" : "asset.create",
          entityId: entity?.id,
          name: val(f, "name"),
          reference: val(f, "reference"),
          assetType: val(f, "assetType"),
          description: val(f, "description"),
          owner: val(f, "owner"),
          status: val(f, "status"),
          justification: val(f, "justification"),
          evidenceIds: f.getAll("evidenceIds"),
        })
      }
    >
      <Field label="Asset name">
        <Input
          name="name"
          required
          defaultValue={entity?.name}
          maxLength={200}
        />
      </Field>
      {!entity && (
        <>
          <Field label="Asset identifier">
            <Input
              name="reference"
              required
              maxLength={60}
              pattern="[A-Za-z0-9_.-]+"
            />
          </Field>
          <Select name="assetType" label="Asset type" values={assetTypes} />
        </>
      )}
      <Field label="Asset description">
        <textarea
          name="description"
          className={fieldClass}
          required
          maxLength={4000}
          defaultValue={entity?.description}
        />
      </Field>
      <Field label="Owner">
        <Input name="owner" maxLength={200} defaultValue={entity?.owner} />
      </Field>
      <Select
        name="status"
        label="Compromise investigation status"
        values={compromiseStates}
        value={old?.status ?? "Unassessed"}
      />
      <EvidenceChoices />
      <Field label="Assessment justification">
        <textarea
          name="justification"
          className={fieldClass}
          required
          maxLength={2000}
        />
      </Field>
    </Editor>
  );
}
export function AssociateAsset() {
  const d = useScope(),
    [inventory, setInventory] = useState<ScopeEntity[]>([]),
    [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="text-xs text-muted-foreground underline"
        onClick={() =>
          readScope<ScopeEntity[]>(d.scope, "inventory")
            .then(setInventory)
            .catch((e: Error) => setError(e.message))
        }
      >
        Load organization inventory
      </button>
      {error && <p role="alert">{error}</p>}
      {inventory.length > 0 && (
        <Editor
          title="Associate existing asset"
          trigger="Associate asset"
          description="Reuse inventory without copying assessments from another incident."
          onSubmit={(f) =>
            api("scope", {
              ...d.scope,
              action: "associate",
              entityId: val(f, "entityId"),
              justification: val(f, "justification"),
            })
          }
        >
          <Field label="Existing organization asset">
            <select className={fieldClass} name="entityId" required>
              <option value="">Select asset</option>
              {inventory
                .filter(
                  (e) => !d.entities.some((current) => current.id === e.id),
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.reference}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Association justification">
            <Input name="justification" required maxLength={2000} />
          </Field>
        </Editor>
      )}
    </div>
  );
}
export function AssessmentForm({
  entity,
  assessment,
}: {
  entity: ScopeEntity;
  assessment?: ScopeAssessment;
}) {
  const d = useScope(),
    incident = useIncident();
  const [dimension, setDimension] = useState(
    assessment?.dimension ??
      (["Account", "System"].includes(entity.kind)
        ? "Compromise"
        : "Exfiltration"),
  );
  const options = ["Account", "System", "Business Operation"].includes(
    entity.kind,
  )
    ? impactTypes
    : impactTypes.filter((v) => v !== "Compromise");
  const linked = assessment
    ? d.links
        .filter((l) => l.assessmentId === assessment.id)
        .map((l) => l.evidenceId)
    : [];
  return (
    <Editor
      title={assessment ? "Update impact assessment" : "Add impact assessment"}
      trigger={assessment ? "Update assessment" : "Add impact assessment"}
      description="Record only what the evidence supports. Confirmation records your identity and verification time; prior assessments stay in the timeline."
      onSubmit={(f) =>
        api("scope", {
          ...d.scope,
          action: "assessment",
          entityId: entity.id,
          dimension: val(f, "dimension"),
          status: val(f, "status"),
          description: val(f, "description"),
          justification: val(f, "justification"),
          findingId: val(f, "findingId"),
          annotation: val(f, "annotation"),
          excerpt: val(f, "excerpt"),
          evidenceIds: f.getAll("evidenceIds"),
        })
      }
    >
      <Field label="Impact dimension">
        <select
          name="dimension"
          value={dimension}
          className={fieldClass}
          onChange={(e) => setDimension(e.target.value)}
          disabled={!!assessment}
        >
          {options.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      {assessment && (
        <input name="dimension" type="hidden" value={assessment.dimension} />
      )}
      <Select
        key={dimension}
        name="status"
        label="Investigation status"
        values={dimension === "Compromise" ? compromiseStates : impactStates}
        value={
          assessment?.status ??
          (dimension === "Compromise" ? "Investigating" : "Suspected")
        }
      />
      <Field label="Impact description">
        <textarea
          name="description"
          required
          maxLength={4000}
          className={fieldClass}
          defaultValue={assessment?.description}
        />
      </Field>
      <Field label="Change / verification justification">
        <textarea
          name="justification"
          required
          maxLength={2000}
          className={fieldClass}
        />
      </Field>
      <EvidenceChoices defaults={linked} />
      <Field label="Related finding">
        <select
          name="findingId"
          defaultValue={assessment?.findingId ?? ""}
          className={fieldClass}
        >
          <option value="">None</option>
          {incident.findings.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Evidence annotation (optional)">
        <Input name="annotation" maxLength={2000} />
      </Field>
      <Field label="Relevant literal excerpt (optional)">
        <Input name="excerpt" maxLength={2000} />
      </Field>
      <p className="text-xs text-muted-foreground">
        A dataset or group assessment never automatically confirms its
        individual records. Encryption and exfiltration are separate dimensions.
      </p>
    </Editor>
  );
}
export function LinkScopeEvidence({ entity }: { entity: ScopeEntity }) {
  const d = useScope(),
    incident = useIncident();
  return (
    <Editor
      title="Link existing evidence"
      trigger="Link evidence"
      description="Link an original evidence file and preserve its source and annotation."
      onSubmit={(f) =>
        api("scope", {
          ...d.scope,
          action: "evidence.link",
          entityId: entity.id,
          evidenceId: val(f, "evidenceId"),
          assessmentId: val(f, "assessmentId"),
          annotation: val(f, "annotation"),
          excerpt: val(f, "excerpt"),
        })
      }
    >
      <Field label="Existing evidence">
        <select name="evidenceId" className={fieldClass} required>
          <option value="">Select evidence</option>
          {incident.evidence.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id} · {e.filename}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Assessment (optional)">
        <select name="assessmentId" className={fieldClass}>
          <option value="">Entity context only</option>
          {d.assessments
            .filter((a) => a.entityId === entity.id)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.dimension} · {a.status}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Evidence annotation">
        <textarea
          name="annotation"
          className={fieldClass}
          required
          maxLength={2000}
        />
      </Field>
      <Field label="Relevant literal excerpt (optional)">
        <Input name="excerpt" maxLength={2000} />
      </Field>
    </Editor>
  );
}
export function RelationshipForm({ source }: { source?: ScopeEntity }) {
  const d = useScope();
  return (
    <Editor
      title="Add relationship"
      trigger="Add relationship"
      description="Describe a documented relationship. Capability, ownership and potential paths do not establish observed access or compromise."
      onSubmit={(f) =>
        api("scope", {
          ...d.scope,
          action: "relationship",
          sourceId: val(f, "sourceId"),
          targetId: val(f, "targetId"),
          type: val(f, "type"),
          status: val(f, "status"),
          justification: val(f, "justification"),
          evidenceIds: f.getAll("evidenceIds"),
        })
      }
    >
      {["sourceId", "targetId"].map((name) => (
        <Field
          key={name}
          label={name === "sourceId" ? "Source entity" : "Target entity"}
        >
          <select
            name={name}
            className={fieldClass}
            defaultValue={name === "sourceId" ? source?.id : ""}
            required
          >
            <option value="">Select entity</option>
            {d.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.kind}
              </option>
            ))}
          </select>
        </Field>
      ))}
      <Select
        name="type"
        label="Relationship type"
        values={relationshipTypes}
      />
      <Select
        name="status"
        label="Relationship verification"
        values={["Unverified", "Suspected", "Confirmed", "Ruled Out"]}
      />
      <Field label="Source / relationship justification">
        <textarea
          name="justification"
          required
          maxLength={2000}
          className={fieldClass}
        />
      </Field>
      <EvidenceChoices />
    </Editor>
  );
}
