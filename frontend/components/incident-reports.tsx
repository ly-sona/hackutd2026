"use client";
import { useState } from "react";
import { useRecovery, useRecoveryCommand } from "./recovery-data";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import { useCoordination } from "./coordination-data";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Editor, Field, Select, fieldClass } from "./incident-forms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { incidentTime, localDateValue } from "@/lib/incident-model";
import {
  reportTypes,
  reportSourcePermissions,
  attackVectors,
  actorCategories,
  actionCategories,
  techniqueCatalog,
} from "../../shared/recovery";
export function ReportHistory() {
  const a = useAccess(),
    d = useRecovery(),
    run = useRecoveryCommand(),
    [error, setError] = useState("");
  return (
    <section className="my-7 border-t border-border pt-5">
      <h2 className="text-xl font-semibold">Incident report history</h2>
      <p className="my-2 text-xs text-muted-foreground">
        Each artifact preserves its original source cutoff, contents and
        SHA-256. New evidence requires a new version. Opening or downloading
        rechecks current source permissions.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {d.reports.map((r) => {
        const url = `/api/reports/${r.id}?organizationId=${encodeURIComponent(a.organizationId)}&incidentId=${encodeURIComponent(a.incidentId)}`;
        return (
          <div key={r.id} className="border-b border-border py-4 grid gap-2">
            <div className="flex flex-wrap justify-between gap-3">
              <strong className="text-sm">
                Version {r.version} · {r.type} · {r.status}
              </strong>
              {r.status === "Preparing" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      setError("");
                      await run("report.resume", { reportId: r.id });
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Resume version {r.version}
                </Button>
              )}
              {r.status === "Ready" && (
                <div className="flex gap-4 text-sm">
                  <a
                    className="underline"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open version {r.version}
                  </a>
                  <a className="underline" href={url + "&download=1"}>
                    Download version {r.version}
                  </a>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Generated {incidentTime(r.generatedAt)} by {r.generatedBy} ·
              Source cutoff {incidentTime(r.sourceCutoff)}
              {r.includeLegal ? " · Includes restricted legal review" : ""}
            </p>
            <p className="text-[10px] text-muted-foreground break-all">
              SHA-256: {r.sha256 || "Artifact preparation pending"}
            </p>
          </div>
        );
      })}
      {!d.reports.length && (
        <p className="text-sm text-muted-foreground mt-4">
          No saved reports available to your current role.
        </p>
      )}
    </section>
  );
}
function ClassificationEditor() {
  const a = useAccess(),
    d = useRecovery(),
    i = useIncident(),
    coordination = useCoordination(),
    run = useRecoveryCommand(),
    m = d.metadata;
  if (!a.can("classification:edit")) return null;
  return (
    <Editor
      title="Incident reporting metadata"
      trigger="Edit classification and discovery"
      description="Human-authored classifications are separate from findings and scope certainty. Unknown is valid. Optional ATT&CK mappings require a finding and evidence."
      onSubmit={(f) => {
        const fields = [
            "detectionSource",
            "initialObservation",
            "attackVector",
            "actorCategory",
            "actionCategory",
            "assetCategory",
            "impactCategory",
            "rootCause",
            "lessonsLearned",
          ],
          values = Object.fromEntries(
            fields.map((k) => [k, String(f.get(k) ?? "")]),
          ),
          techniqueId = String(f.get("techniqueId") ?? ""),
          evidenceIds = f.getAll("evidenceIds");
        return run("classification", {
          ...values,
          reportedAt: new Date(String(f.get("reportedAt"))).getTime(),
          evidenceIds,
          mitreMappings: techniqueId
            ? [
                {
                  techniqueId,
                  findingId: String(f.get("findingId")),
                  evidenceIds,
                },
              ]
            : JSON.parse(m?.mitreMappings ?? "[]"),
        });
      }}
    >
      <Field label="Detection source">
        <Input
          name="detectionSource"
          defaultValue={m?.detectionSource}
          required
          maxLength={300}
        />
      </Field>
      <Field label="Reported at">
        <Input
          type="datetime-local"
          name="reportedAt"
          defaultValue={localDateValue(
            Number(m?.reportedAt ?? i.incident?.createdAt ?? 0),
          )}
          required
        />
      </Field>
      <Field label="Initial observation">
        <textarea
          name="initialObservation"
          className={fieldClass}
          defaultValue={m?.initialObservation}
          required
          maxLength={3000}
        />
      </Field>
      <Select
        name="attackVector"
        label="Attack vector"
        values={attackVectors}
        value={m?.attackVector}
      />
      <Select
        name="actorCategory"
        label="Actor category"
        values={actorCategories}
        value={m?.actorCategory}
      />
      <Select
        name="actionCategory"
        label="Action category"
        values={actionCategories}
        value={m?.actionCategory}
      />
      {(["assetCategory", "impactCategory"] as const).map((k) => (
        <Field
          key={k}
          label={k === "assetCategory" ? "Asset category" : "Impact category"}
        >
          <Input
            name={k}
            defaultValue={m?.[k] ?? "Unknown"}
            required
            maxLength={300}
          />
        </Field>
      ))}
      <Field label="Root cause (leave blank if not established)">
        <textarea
          name="rootCause"
          className={fieldClass}
          defaultValue={m?.rootCause}
          maxLength={3000}
        />
      </Field>
      <Field label="Lessons learned">
        <textarea
          name="lessonsLearned"
          className={fieldClass}
          defaultValue={m?.lessonsLearned}
          maxLength={3000}
        />
      </Field>
      <Field label="Optional ATT&CK technique">
        <select name="techniqueId" className={fieldClass}>
          <option value="">Keep current mappings</option>
          {Object.entries(techniqueCatalog).map(([id, name]) => (
            <option key={id} value={id}>
              {id} · {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Supporting shared finding (conversation-derived sources excluded)">
        <select name="findingId" className={fieldClass}>
          {i.findings
            .filter(
              (f) =>
                !coordination.findingSources.some(
                  (source) => source.id === f.id,
                ),
            )
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
        </select>
      </Field>
      <fieldset>
        <legend className="text-sm">Classification evidence</legend>
        {i.evidence.map((e) => (
          <label className="block text-xs mt-2" key={e.id}>
            <input
              name="evidenceIds"
              type="checkbox"
              value={e.id}
              defaultChecked={(
                JSON.parse(m?.classificationEvidenceIds ?? "[]") as string[]
              ).includes(e.id)}
            />{" "}
            {e.id} · {e.filename}
          </label>
        ))}
      </fieldset>
    </Editor>
  );
}
function LegalEditor() {
  const a = useAccess(),
    d = useRecovery(),
    run = useRecoveryCommand();
  if (!a.can("legal:edit")) return null;
  const fields = {
    jurisdictions: "Applicable jurisdictions",
    informationCategories: "Information categories",
    obligations: "Contractual / legal obligations",
    notificationAssessment: "Notification assessment",
    legalHold: "Legal hold",
    evidencePreservation: "Evidence preservation",
    clientNotification: "Client notification status",
    regulatoryNotification: "Regulatory notification status",
    confidentiality: "Confidentiality",
    privilegeDesignation: "Explicit privilege designation",
  } as const;
  return (
    <Editor
      title="Restricted legal review"
      trigger="Edit legal review"
      description="Authorized human assessment only. AEGIS does not infer privilege, legal deadlines or regulatory obligations."
      onSubmit={(f) =>
        run(
          "legal",
          Object.fromEntries(
            [...Object.keys(fields), "reviewStatus"].map((k) => [
              k,
              String(f.get(k) ?? ""),
            ]),
          ),
        )
      }
    >
      {Object.entries(fields).map(([k, label]) => (
        <Field key={k} label={label}>
          <textarea
            name={k}
            className={fieldClass}
            defaultValue={
              d.legal?.[k as keyof typeof fields] ?? "Not yet assessed"
            }
            maxLength={3000}
            required
          />
        </Field>
      ))}
      <Select
        name="reviewStatus"
        label="Review status"
        values={["Under review", "Completed", "Not assessed"]}
        value={d.legal?.reviewStatus}
      />
    </Editor>
  );
}
export function IncidentReports() {
  const a = useAccess(),
    run = useRecoveryCommand(),
    [open, setOpen] = useState(false),
    [type, setType] = useState<string>(reportTypes[0]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [generated, setGenerated] = useState("");
  const allowed =
    reportSourcePermissions.every((p) => a.can(p)) && a.can("legal:view");
  async function generate() {
    setBusy(true);
    setError("");
    setGenerated("");
    try {
      const result = await run<{ reportId: string }>("report.generate", {
        type,
        includeLegal: true,
      });
      setGenerated(result.reportId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={!allowed}
        title={
          allowed
            ? "Generate an immutable report including restricted legal review"
            : "All source permissions, including legal access, are required to generate incident-wide reports"
        }
        onClick={() => {
          setError("");
          setGenerated("");
          setOpen(true);
        }}
      >
        Generate report
      </Button>
      <Dialog
        open={open && allowed}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Generate incident report</DialogTitle>
            <DialogDescription>
              Generate a versioned HTML artifact. Print or Save as PDF from the
              saved report. Restricted legal review is included automatically;
              opening or downloading requires legal access. Missing information
              remains explicit and does not prevent interim documentation.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-3">
            <ClassificationEditor />
            <LegalEditor />
          </div>
          <Field label="Report type">
            <select
              className={fieldClass}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {reportTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <Button disabled={busy} onClick={generate}>
            {busy ? "Generating…" : "Generate"}
          </Button>
          {generated && (
            <p role="status" className="text-sm text-emerald-400">
              Report saved. Open or download it from Incident report history
              in Timeline.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
