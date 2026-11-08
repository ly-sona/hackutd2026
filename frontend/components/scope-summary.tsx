import type { ScopeSummary } from "@/lib/scope";
export function ScopeSummaryStrip({ summary: s }: { summary?: ScopeSummary }) {
  if (!s) return null;
  return (
    <div
      className="my-5 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border py-4 text-xs sm:grid-cols-4 xl:grid-cols-7"
      data-testid="scope-summary"
    >
      {[
        { label: "Systems to investigate", value: s.systemsUnderInvestigation },
        { label: "Confirmed systems", value: s.confirmedSystems },
        { label: "Datasets at risk", value: s.datasetsAtRisk },
        { label: "Groups to investigate", value: s.groupsUnderInvestigation },
        {
          label: "Inventory records",
          value: s.totalRecords,
          test: "inventory-record-count",
        },
        {
          label: "Potential records",
          value: s.potentialRecords,
          test: "potential-record-count",
        },
        {
          label: "Individually confirmed",
          value: s.individuallyConfirmedRecords,
          test: "confirmed-record-count",
        },
      ].map((m) => (
        <div key={m.label}>
          <p className="mb-1 text-xl font-semibold" data-testid={m.test}>
            {m.value.toLocaleString("en-US")}
          </p>
          <p className="text-muted-foreground">{m.label}</p>
        </div>
      ))}
      <p className="col-span-full text-[11px] text-muted-foreground">
        {s.enumeratedRecords.toLocaleString("en-US")} records enumerated ·{" "}
        {s.notIndividuallyAssessed.toLocaleString("en-US")} not individually
        assessed. Potential counts use unique records across overlapping groups
        and exclude individually confirmed records. Each confirmed count
        represents at least one individually verified impact, not every impact
        dimension. Unknown inventory counts are excluded from the inventory
        total. Inventory and potential exposure do not establish individual
        access.
      </p>
    </div>
  );
}
