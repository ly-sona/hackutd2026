"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAccess } from "./workspace-provider";
import { useIncident } from "./incident-data";
import { Editor, Field, Select, fieldClass } from "./incident-forms";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  findingStates,
  incidentTime,
  highlightExcerpt,
  localDateValue,
  type Evidence,
} from "@/lib/incident-model";
import { api } from "@/lib/api";
export function AttachEvidence({ findingId = "" }: { findingId?: string }) {
  const a = useAccess();
  return (
    <Editor
      title="Attach evidence"
      trigger="Attach evidence"
      description="Private original files, up to 5 MiB. Evidence is untrusted; a hash records integrity, not authenticity."
      onSubmit={async (form) => {
        form.set("findingId", findingId);
        const collected = String(form.get("collectionTime") ?? "");
        form.set(
          "collectedAt",
          collected ? String(new Date(collected).getTime()) : "",
        );
        const res = await fetch(
          `/api/incident/evidence?${new URLSearchParams({ organizationId: a.organizationId, incidentId: a.incidentId })}`,
          { method: "POST", body: form },
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        return body;
      }}
    >
      <Field label="File (TXT, LOG, JSON, PDF, PNG, JPEG)">
        <Input
          name="file"
          type="file"
          accept=".txt,.log,.json,.pdf,.png,.jpg,.jpeg"
        />
      </Field>
      <Field label="Or create a text evidence note">
        <textarea name="note" className={fieldClass} maxLength={50000} />
      </Field>
      <Field label="Evidence description">
        <textarea
          name="description"
          required
          className={fieldClass}
          maxLength={4000}
        />
      </Field>
      <Field label="Evidence source">
        <Input name="source" required maxLength={1000} />
      </Field>
      <Field label="Collection time (your local time, optional)">
        <Input
          name="collectionTime"
          type="datetime-local"
          defaultValue={localDateValue()}
        />
      </Field>
      <Select
        name="status"
        label="Investigation status"
        values={findingStates}
        value="Unverified"
      />
      <Field label="Annotation (optional)">
        <Input name="annotation" maxLength={2000} />
      </Field>
      <Field label="Relevant literal excerpt (optional)">
        <Input name="excerpt" maxLength={2000} />
      </Field>
      <p className="text-xs text-muted-foreground">
        Uploads preserve original bytes. Executables and HTML files are not
        accepted. PDF files download without an embedded preview. Signature
        checks do not guarantee malware-free content.
      </p>
    </Editor>
  );
}
export function EvidenceButton({
  evidence,
  findingId = "",
}: {
  evidence: Evidence;
  findingId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Review evidence ·{" "}
        {evidence.id.startsWith("EV-0") ? evidence.id : evidence.filename}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{evidence.filename}</DialogTitle>
            <DialogDescription>
              {evidence.id} · {evidence.status}
            </DialogDescription>
          </DialogHeader>
          {open && <EvidenceViewer evidence={evidence} findingId={findingId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
function EvidenceViewer({
  evidence: e,
  findingId,
}: {
  evidence: Evidence;
  findingId: string;
}) {
  const d = useIncident(),
    a = useAccess();
  const [preview, setPreview] = useState<{
    text?: string;
    image?: string;
    error?: string;
  }>({});
  const url = `/api/evidence/${encodeURIComponent(e.id)}`;
  const links = d.links.filter(
    (l) => l.evidenceId === e.id && (!findingId || l.findingId === findingId),
  );
  const excerpt = links.find((l) => l.excerpt)?.excerpt ?? "";
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    if (e.contentType !== "application/pdf")
      fetch(`${url}?preview=1`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error((await res.json()).error);
          if (e.contentType.startsWith("image/")) {
            objectUrl = URL.createObjectURL(await res.blob());
            if (active) setPreview({ image: objectUrl });
          } else {
            const text = await res.text();
            if (active) setPreview({ text });
          }
        })
        .catch((error: Error) => {
          if (active) setPreview({ error: error.message });
        });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, e.contentType]);
  const parts =
    preview.text !== undefined ? highlightExcerpt(preview.text, excerpt) : [];
  return (
    <div className="min-w-0 space-y-4 text-sm">
      <p>{e.description}</p>
      <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 text-xs">
        <dt>Source</dt>
        <dd>{e.source}</dd>
        <dt>Uploader</dt>
        <dd>
          {d.members.find((m) => m.userId === e.uploadedBy)?.name ??
            e.uploadedBy}
        </dd>
        <dt>Collected</dt>
        <dd>{incidentTime(e.collectedAt)}</dd>
        <dt>Uploaded</dt>
        <dd>{incidentTime(e.uploadedAt)}</dd>
        <dt>Size</dt>
        <dd>
          {e.size} bytes · {e.contentType}
        </dd>
        <dt>SHA-256</dt>
        <dd className="break-all font-mono">{e.sha256}</dd>
      </dl>
      {links.map((l) => (
        <div key={l.id} className="border-l border-border pl-3 text-xs">
          <p>{l.annotation}</p>
          {l.findingId && (
            <p className="mt-1 text-muted-foreground">
              Finding:{" "}
              {d.findings.find((f) => f.id === l.findingId)?.title ??
                l.findingId}
            </p>
          )}
          {l.excerpt && <p className="mt-1">Relevant excerpt: {l.excerpt}</p>}
        </div>
      ))}
      {preview.error && (
        <p role="alert" className="text-red-400">
          {preview.error}
        </p>
      )}
      {preview.text !== undefined && (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border p-4 text-xs leading-6">
          {parts.length === 3 ? (
            <>
              {parts[0]}
              <mark className="bg-amber-300/25 text-amber-200">{parts[1]}</mark>
              {parts[2]}
            </>
          ) : (
            preview.text
          )}
        </pre>
      )}
      {preview.image && (
        /* Authorized blob URL, cleaned on unmount; no remote optimization. */ <Image
          unoptimized
          width={1000}
          height={700}
          src={preview.image}
          alt="Untrusted evidence screenshot"
          className="max-h-96 max-w-full object-contain"
        />
      )}
      <Button variant="outline" asChild>
        <a href={url}>Download original</a>
      </Button>
      <p className="text-xs text-muted-foreground">
        Integrity hash does not establish authenticity or validate the claim.
        Uploaded content is untrusted.
      </p>
      {findingId && a.can("evidence:upload") && (
        <Editor
          title="Annotate evidence"
          trigger="Add annotation"
          description="Append a separate annotation; original bytes remain unchanged."
          onSubmit={(f) =>
            api("incident/link", {
              organizationId: a.organizationId,
              incidentId: a.incidentId,
              evidenceId: e.id,
              findingId,
              annotation: String(f.get("annotation")),
              excerpt: String(f.get("excerpt") ?? ""),
            })
          }
        >
          <Field label="Annotation">
            <textarea
              name="annotation"
              className={fieldClass}
              required
              maxLength={2000}
            />
          </Field>
          <Field label="Literal excerpt">
            <Input name="excerpt" maxLength={2000} />
          </Field>
        </Editor>
      )}
    </div>
  );
}
