'use client';

import { useEffect, useState } from 'react';
import type { ToolCall } from '../../hooks/useChat';
import { getToolCatalog, resolveSql, type ToolCatalog } from '../../lib/admin/tool-catalog';
import SqlBlock from '../SqlBlock';

// Admin-facing: a collapsible list of the SQL each MCP-toolbox tool call ran
// for this turn, reconstructed from tools.yaml (statement + bound parameters).
// Calls with no catalog entry — sub-agents, mcp-stats tools — are omitted, so
// this surfaces only real toolbox queries.
export default function ToolQueries({ calls }: { calls: ToolCall[] }) {
  const [catalog, setCatalog] = useState<ToolCatalog | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getToolCatalog()
      .then(c => { if (!cancelled) setCatalog(c); })
      .catch(() => { if (!cancelled) setCatalog({}); });
    return () => { cancelled = true; };
  }, []);

  if (!catalog) return null;
  const sqlCalls = calls.filter(c => catalog[c.name]);
  if (sqlCalls.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        {sqlCalls.length} {sqlCalls.length === 1 ? 'query' : 'queries'} executed
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {sqlCalls.map((call, i) => (
            <SqlBlock
              key={i}
              name={call.name}
              sql={resolveSql(catalog[call.name], call.args)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
