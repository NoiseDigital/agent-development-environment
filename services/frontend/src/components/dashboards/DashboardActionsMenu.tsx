'use client';

import { useState } from 'react';

// The dashboard's single actions menu — one "⋯" entry point for share, copy,
// codify, flag, edit, fullscreen, instead of a row of buttons. The owning view
// passes the actions; this component is just the dropdown.

export interface DashboardAction {
  label: string;
  /** SVG path `d` for a 24×24 stroked icon. */
  icon: string;
  onClick: () => void;
  /** Visual tone — defaults to neutral; destructive flips to red so a Delete
   *  entry reads at a glance and a misclick takes more deliberate intent. */
  tone?: 'neutral' | 'destructive';
}

export default function DashboardActionsMenu({ actions }: { actions: DashboardAction[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Dashboard actions"
        className="flex h-[30px] w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-foreground"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-line-strong bg-surface py-1 shadow-xl">
            {actions.map((action) => {
              const destructive = action.tone === 'destructive';
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    action.onClick();
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                    destructive
                      ? 'text-danger hover:bg-danger/10 hover:text-danger'
                      : 'text-muted hover:bg-surface-raised hover:text-foreground'
                  }`}
                >
                  <svg
                    className={`h-3.5 w-3.5 shrink-0 ${destructive ? 'text-danger' : 'text-faint'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
                  </svg>
                  {action.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
