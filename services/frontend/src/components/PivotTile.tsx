'use client';

import { useState, type ReactNode } from 'react';
import type { PivotTile as PivotTileData, PivotRow } from '../data/mock-dashboard-data';

// A grouped, expandable detail table — the report's pivot. Group rows expand to
// reveal their children; the totals row is pinned in bold at the bottom. The
// `no-drag` class keeps scrolling and expand clicks from starting a tile drag.
export default function PivotTile({ tile }: { tile: PivotTileData }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Flatten the row tree into <tr> elements, honouring which groups are open.
  const flatRows: ReactNode[] = [];
  const pushRow = (row: PivotRow, depth: number, key: string) => {
    const hasChildren = !!row.children?.length;
    const expanded = open.has(key);
    flatRows.push(
      <tr key={key} className="border-t border-zinc-800/70 hover:bg-zinc-800/30">
        <td className="py-1.5 pr-3" style={{ paddingLeft: 8 + depth * 18 }}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => hasChildren && toggle(key)}
              className={`flex items-center gap-1.5 text-left ${
                hasChildren ? 'no-drag cursor-pointer' : 'cursor-default'
              }`}
            >
              <span className="w-3 text-zinc-500">
                {hasChildren ? (
                  <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>
                    ▸
                  </span>
                ) : null}
              </span>
              <span className={depth === 0 ? 'font-medium text-zinc-200' : 'text-zinc-400'}>
                {row.label}
              </span>
            </button>
            {row.delta && (
              <span
                className={`flex items-center gap-0.5 text-[10px] font-medium ${
                  row.delta.good ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {row.delta.value.trim().startsWith('-') ? '▼' : '▲'}
                {row.delta.value}
              </span>
            )}
          </div>
        </td>
        {tile.columns.map((c) => (
          <td key={c.key} className="px-3 py-1.5 text-right tabular-nums text-zinc-300">
            {row.values[c.key] ?? '—'}
          </td>
        ))}
      </tr>,
    );
    if (hasChildren && expanded) {
      row.children!.forEach((child, i) => pushRow(child, depth + 1, `${key}.${i}`));
    }
  };
  tile.rows.forEach((row, i) => pushRow(row, 0, String(i)));

  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 shrink-0 text-sm font-medium text-white">{tile.title}</p>
      <div className="no-drag flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500">
              <th className="py-1.5 pr-3 text-left font-medium">{tile.rowHeader}</th>
              {tile.columns.map((c) => (
                <th key={c.key} className="px-3 py-1.5 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flatRows}
            <tr className="border-t-2 border-zinc-700 font-semibold text-white">
              <td className="py-2 pr-3" style={{ paddingLeft: 8 }}>
                {tile.total.label}
              </td>
              {tile.columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-right tabular-nums">
                  {tile.total.values[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
