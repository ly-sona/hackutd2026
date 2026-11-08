import type { ReportSnapshot } from "../../shared/recovery";
export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function renderReport(r: ReportSnapshot) {
  const e = escapeHtml;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AEGIS ${e(r.incidentId)} — ${e(r.type)} v${r.version}</title><style>body{font:14px/1.5 system-ui,sans-serif;color:#111;background:white;max-width:1100px;margin:40px auto;padding:0 24px}h1{font-size:30px}h2{margin-top:32px;border-bottom:2px solid #222;padding-bottom:8px}h3{font-size:16px}p,td{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:16px 0;font-size:12px}td,th{border:1px solid #aaa;padding:8px;text-align:left;vertical-align:top}th{background:#eee}dt{font-weight:600;margin-top:10px}dd{margin:3px 0 12px;white-space:pre-wrap}small{color:#444}.notice{border:1px solid #777;padding:12px}a{color:#111}@media print{body{margin:0;max-width:none;font-size:10pt;padding:0}h2{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}.print-note{display:none}}@page{size:A4;margin:16mm}</style></head><body><header><p>AEGIS · ${e(r.confidentiality)}</p><h1>${e(r.type)} · Version ${r.version}</h1><h3>${e(r.incidentId)} — ${e(r.incidentTitle)}</h3><p>${e(r.organizationName)}<br>Generated ${e(r.generatedAt)} by ${e(r.generatedBy)}<br>Source cutoff ${e(r.sourceCutoff)}<br>Artifact ${e(r.reportId)}<br>Audience: ${e(r.audience)}</p><p class="notice">Interim incident documentation. Unknown and unverified information remains explicit. Synthetic incident scenario and deterministic infrastructure recovery simulation. No certification, automated legal determination or regulatory submission.</p><p class="print-note">Use your browser’s Print command to print or save as PDF. This saved HTML artifact is immutable; later evidence requires a new report version.</p></header><h2>Report Completeness Review</h2><p>Missing information does not block an interim report. No percentage score is assigned.</p><table><thead><tr><th>Field</th><th>State</th><th>Review note</th></tr></thead><tbody>${r.completeness.map((c) => `<tr><td>${e(c.label)}</td><td>${e(c.status)}</td><td>${e(c.detail)}</td></tr>`).join("")}</tbody></table>${r.sections.map((s) => `<section><h2>${e(s.title)}</h2><dl>${s.fields.map((f) => `<dt>${e(f.label)}</dt><dd>${e(f.value)}</dd>`).join("")}</dl>${s.tables.map((t) => `<h3>${e(t.title)}</h3><table><thead><tr>${t.columns.map((c) => `<th>${e(c)}</th>`).join("")}</tr></thead><tbody>${t.rows.length ? t.rows.map((row) => `<tr>${row.map((v) => `<td>${e(v)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${t.columns.length}">No records documented at this cutoff.</td></tr>`}</tbody></table>`).join("")}</section>`).join("")}<h2>Standards alignment and limits</h2><ul>${r.standards.map((s) => `<li><a href="${e(s.url)}">${e(s.name)}</a>: ${e(s.use)}</li>`).join("")}</ul><h2>Source references</h2><dl>${Object.entries(
    r.sourceIds,
  )
    .map(
      ([kind, ids]) =>
        `<dt>${e(kind)}</dt><dd>${e(ids.join(", ") || "None at cutoff")}</dd>`,
    )
    .join(
      "",
    )}</dl><footer><p>Historical snapshot. Source cutoff ${e(r.sourceCutoff)} · Report ${e(r.reportId)} · Version ${r.version}</p></footer></body></html>`;
}
