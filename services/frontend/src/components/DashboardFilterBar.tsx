'use client';

// The report filter row — a dropdown per dashboard filter plus a date range.
// Presentational for now (mock dashboards don't filter yet); this is the slot
// real filtering wires into once dashboards are backed by live data.

function FilterField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <button
        type="button"
        className="flex w-36 items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700"
      >
        {value}
        <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
}

export default function DashboardFilterBar({ filters }: { filters?: string[] }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {(filters ?? []).map((f) => (
        <FilterField key={f} label={f} value="All" />
      ))}
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Date Range
        </p>
        <div className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300">
          <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Last 30 days
        </div>
      </div>
    </div>
  );
}
