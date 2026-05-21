'use client';

import { useState } from 'react';
import type { ChoicesProps } from '../../types/genui';

// An agent-surfaced clarifying question. The user picks option(s) and/or types
// a custom answer; submitting sends it back to the agent as the next message —
// the GenUI feedback loop in its simplest interactive form.
export default function Choices({
  props,
  onAction,
}: {
  props: ChoicesProps;
  onAction?: (text: string) => void;
}) {
  const { question, options, multiSelect = false, allowCustom = false } = props;
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  const valueOf = (o: { label: string; value?: string }) => o.value ?? o.label;

  const toggle = (val: string) => {
    if (submitted) return;
    setSelected((cur) =>
      multiSelect
        ? cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val]
        : cur.includes(val) ? [] : [val],
    );
  };

  const answer = [...selected, custom.trim()].filter(Boolean).join(', ');
  const canSubmit = !submitted && answer.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    setSubmitted(answer);
    onAction?.(answer);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mt-3">
      <p className="text-sm font-medium text-white mb-3">{question}</p>

      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const val = valueOf(o);
          const active = selected.includes(val);
          return (
            <button
              key={val}
              type="button"
              disabled={!!submitted}
              onClick={() => toggle(val)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                active
                  ? 'border-blue-500 bg-blue-500/15 text-white'
                  : 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-600'
              } ${submitted ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {allowCustom && !submitted && (
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="Or type your own answer…"
          className="mt-3 w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
      )}

      {submitted ? (
        <p className="mt-3 text-xs text-zinc-500">
          Answered: <span className="text-zinc-300">{submitted}</span>
        </p>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="mt-3 px-4 py-1.5 text-xs font-semibold rounded-lg bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      )}
    </div>
  );
}
