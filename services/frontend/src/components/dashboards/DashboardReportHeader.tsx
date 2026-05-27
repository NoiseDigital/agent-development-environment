'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Dashboard } from '../../data/dashboards';
import { isClientDashboard } from '../../lib/dashboard-access';
import AccentColorPicker from './AccentColorPicker';

// The branded report header band — client logo, report title, latest delivery
// date, Refresh, share status, and the Noise mark. A client dashboard's title
// is simply the client (it shows all of that client's performance) and is not
// editable; internal dashboards carry an editable title and share status.
//
// `deliveryDate` is a fully-formatted display string ("Just now", "5 min ago",
// or an absolute date for older timestamps) — caller-prepared by
// `lib/dashboard-refresh.formatRefreshTime`. Do NOT re-parse it as a date
// here: that's how we ended up with "Invalid Date" when the value was a
// relative-time string.

/** Inline-editable report title — click to edit, Enter/blur commits, Esc cancels. */
function EditableTitle({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onCommit(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onCommit(draft);
            setEditing(false);
          } else if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-64 max-w-full rounded border border-white/30 bg-white/10 px-1.5 py-0.5 text-base font-semibold text-white outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Rename dashboard"
      className="group/title flex items-center gap-1.5 text-left"
    >
      <h1 className="truncate text-base font-semibold leading-tight text-white">{value}</h1>
      <svg
        className="h-3.5 w-3.5 shrink-0 text-white/40 opacity-0 transition-opacity group-hover/title:opacity-100"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </button>
  );
}

export default function DashboardReportHeader({
  dashboard,
  onBack,
  deliveryDate,
  refreshing,
  onRefresh,
  title,
  editableTitle,
  onTitleCommit,
  accentColor,
  editingAccent,
  onAccentChange,
}: {
  dashboard: Dashboard;
  onBack: () => void;
  deliveryDate: string;
  refreshing: boolean;
  onRefresh: () => void;
  title: string;
  editableTitle: boolean;
  onTitleCommit: (next: string) => void;
  /** Effective accent color — base × per-dashboard override. Owned by the
   *  parent so it can persist the override on change. */
  accentColor: string;
  /** Whether the dashboard is currently in edit mode — the color picker
   *  shows only then. Outside edit mode the header is read-only. */
  editingAccent: boolean;
  /** Fires whenever a swatch / custom color / reset is chosen. */
  onAccentChange: (hex: string) => void;
}) {
  const isClient = isClientDashboard(dashboard);
  const subtitle = isClient ? 'Performance Report' : dashboard.client;

  // In edit mode, the WHOLE banner becomes the swatch trigger. Click anywhere
  // on the band → popover opens. No dedicated button. Open state is local so
  // it doesn't leak into parent re-renders.
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div
      style={{ backgroundColor: accentColor }}
      onClick={editingAccent ? () => setPickerOpen((v) => !v) : undefined}
      className={`relative shrink-0 ${editingAccent ? 'cursor-pointer transition-shadow hover:shadow-[inset_0_-2px_0_rgba(255,255,255,0.25)]' : ''}`}
      title={editingAccent ? 'Click to change banner color' : undefined}
    >
      {editingAccent && (
        <AccentColorPicker
          open={pickerOpen}
          current={accentColor}
          defaultColor={dashboard.accentColor}
          onSelect={onAccentChange}
          onClose={() => setPickerOpen(false)}
        />
      )}
      <div className="flex items-center gap-4 px-6 py-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          aria-label="Back to dashboards"
          className="text-white/60 transition-colors hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Brand mark — same logo the listing card uses; falls back to the
            initials badge when the client has no logoPath. */}
        {dashboard.clientLogoPath ? (
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white/15">
            <Image
              src={dashboard.clientLogoPath}
              alt={dashboard.client}
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/15 text-sm font-bold text-white">
            {dashboard.clientInitials}
          </div>
        )}

        <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
          {editableTitle ? (
            <EditableTitle value={title} onCommit={onTitleCommit} />
          ) : (
            <h1 className="truncate text-base font-semibold leading-tight text-white">{title}</h1>
          )}
          <p className="truncate text-xs text-white/60">{subtitle}</p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">
              Latest Delivery
            </p>
            <p className="text-xs font-medium text-white">{deliveryDate}</p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh — load the latest delivered data"
            className="flex items-center gap-1.5 rounded-md border border-white/25 px-2.5 py-1.5 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 disabled:opacity-60"
          >
            <svg
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>

          <div className="flex items-center gap-3">
            <div className="leading-none">
              <span className="block text-[9px] text-white/50">powered by</span>
              <span className="text-sm font-bold tracking-tight text-white">NOISE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
