"use client";
import { useEffect, useState } from "react";
import { useScope, type RecordPage } from "./scope-data";
import { fieldClass } from "./incident-forms";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { impactTypes, impactStates, readScope } from "@/lib/scope";
export function RecordBrowser({
  groupId,
  close,
  select,
}: {
  groupId: string;
  close: () => void;
  select: (id: string) => Promise<void>;
}) {
  const d = useScope(),
    [query, setQuery] = useState(""),
    [dimension, setDimension] = useState(""),
    [status, setStatus] = useState(""),
    [offset, setOffset] = useState(0),
    [result, setResult] = useState<RecordPage>(),
    [error, setError] = useState("");
  const group = d.entities.find((e) => e.id === groupId);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        readScope<RecordPage>(d.scope, "records", {
          groupId,
          query,
          dimension,
          status,
          offset,
          limit: 25,
        })
          .then((result) => {
            if (active) {
              setResult(result);
              setError("");
            }
          })
          .catch((e: Error) => {
            if (active) setError(e.message);
          }),
      150,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [d.scope, groupId, query, dimension, status, offset]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Browse records · {group?.name}</DialogTitle>
          <DialogDescription>
            Inventory membership is not proof of compromise. Results are
            authorized and paginated by the backend.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          <Input
            aria-label="Search record ID"
            placeholder="Search C-1044…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
          />
          <select
            aria-label="Record impact dimension"
            className={`${fieldClass} max-w-48`}
            value={dimension}
            onChange={(e) => {
              setDimension(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All impact dimensions</option>
            {impactTypes
              .filter((v) => v !== "Compromise")
              .map((v) => (
                <option key={v}>{v}</option>
              ))}
          </select>
          <select
            aria-label="Record investigation status"
            className={`${fieldClass} max-w-48`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All investigation states</option>
            {impactStates.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-[560px] w-full text-left text-base">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3">Record</th>
                <th>Category</th>
                <th>Sensitivity</th>
                <th>Individual assessment</th>
              </tr>
            </thead>
            <tbody>
              {result?.records.map((record) => (
                <tr key={record.id} className="border-b border-border">
                  <td className="py-3">
                    <button
                      className="underline underline-offset-4"
                      onClick={() => select(record.id)}
                    >
                      {record.reference}
                    </button>
                  </td>
                  <td>{record.dataCategory}</td>
                  <td>{record.sensitivity}</td>
                  <td>
                    {d.assessments
                      .filter(
                        (a) =>
                          a.entityId === record.id && a.status !== "Unassessed",
                      )
                      .map((a) => `${a.dimension}: ${a.status}`)
                      .join(" · ") || "Not individually assessed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!result && !error && <p role="status">Loading records…</p>}
        <div className="flex items-center justify-between gap-3 text-xs">
          <span>
            {result
              ? `${result.total.toLocaleString("en-US")} matching / ${result.totalInGroup.toLocaleString("en-US")} ${group?.countKnown ? "group records" : "enumerated records; total group inventory unknown"}`
              : "Loading…"}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Previous records
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!result || offset + 25 >= result.total}
              onClick={() => setOffset(offset + 25)}
            >
              Next records
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
