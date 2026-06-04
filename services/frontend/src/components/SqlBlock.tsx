'use client';

import { useState, type ReactNode } from 'react';

// A read-only SQL block for the admin query view: lightweight BigQuery-SQL
// syntax highlighting plus a copy button. The highlighter is hand-rolled
// (keyword / string / number / comment / function tokens) to avoid pulling in
// a full highlighting library for one admin surface.

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AS', 'WITH', 'AND', 'OR', 'NOT', 'NULL', 'CASE',
  'WHEN', 'THEN', 'ELSE', 'END', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'JOIN', 'CROSS',
  'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'ON', 'USING', 'INTERVAL', 'IN', 'IS',
  'ASC', 'DESC', 'UNION', 'ALL', 'DISTINCT', 'HAVING', 'OVER', 'PARTITION',
  'BETWEEN', 'LIKE', 'EXISTS', 'TRUE', 'FALSE', 'DAY', 'WEEK', 'MONTH', 'YEAR',
  'HOUR',
]);

function highlightSql(sql: string): ReactNode[] {
  // comment | 'string' | `identifier` | number | word
  const re = /(--[^\n]*)|('(?:[^']|'')*')|(`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    if (m.index > last) out.push(sql.slice(last, m.index));
    const tok = m[0];
    const cls = m[1]
      ? 'text-disabled italic' // comment
      : m[2]
        ? 'text-positive' // string literal
        : m[3]
          ? 'text-muted' // `backtick identifier`
          : m[4]
            ? 'text-warning' // number
            : m[5] && SQL_KEYWORDS.has(m[5].toUpperCase())
              ? 'text-accent font-medium' // keyword
              : m[5] && sql[m.index + tok.length] === '('
                ? 'text-accent-300' // function call
                : ''; // plain identifier
    out.push(cls ? <span key={m.index} className={cls}>{tok}</span> : tok);
    last = m.index + tok.length;
  }
  if (last < sql.length) out.push(sql.slice(last));
  return out;
}

export default function SqlBlock({ name, sql }: { name: string; sql: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  };

  return (
    <div className="rounded-lg border border-line bg-surface-sunken overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-surface/60">
        <span className="text-[11px] font-mono font-medium text-muted">{name}</span>
        <button
          type="button"
          onClick={copy}
          title="Copy SQL"
          className="flex items-center gap-1 text-[10px] font-medium text-faint hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V5a2 2 0 012-2h10" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="px-3 py-2 text-[11px] leading-relaxed font-mono text-subtle overflow-x-auto whitespace-pre"><code>{highlightSql(sql)}</code></pre>
    </div>
  );
}
