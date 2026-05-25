'use client';

import { useMemo, useState } from 'react';
import type {
  FiltersProps,
  FilterField,
  ChoiceOption,
} from '../../types/genui';

// A levers block — drop it next to a chart and the user can adjust the
// inputs (metric / date / breakdown / threshold / freeform) then re-run the
// same question with the new params baked in. Submitting fires `onAction`
// with a single line per changed lever (`<label> → <value>`), the same shape
// Choices uses, so the agent reads it the way it reads a clarifying answer.

/** Coerce one select option (string or {label,value}) into a {label,value}. */
function toOption(o: unknown): ChoiceOption | null {
  if (typeof o === 'string') {
    const label = o.trim();
    return label ? { label, value: label } : null;
  }
  if (o && typeof (o as ChoiceOption).label === 'string') {
    const opt = o as ChoiceOption;
    return { label: opt.label, value: opt.value ?? opt.label };
  }
  return null;
}

/** Initial draft for one field — whatever the agent set, normalized. */
function initialValue(f: FilterField): string | number | undefined {
  if (f.kind === 'number') return f.value;
  return f.value;
}

export default function Filters({
  props,
  onAction,
}: {
  props: FiltersProps;
  onAction?: (text: string) => void;
}) {
  const fields = useMemo(
    () => (Array.isArray(props.fields) ? props.fields : []),
    [props.fields],
  );

  const [draft, setDraft] = useState<Record<string, string | number | undefined>>(
    () => Object.fromEntries(fields.map((f) => [f.key, initialValue(f)])),
  );
  const [submitted, setSubmitted] = useState<string | null>(null);

  if (fields.length === 0) return null;

  const patch = (key: string, value: string | number | undefined) => {
    if (submitted) return;
    setDraft((cur) => ({ ...cur, [key]: value }));
  };

  const apply = () => {
    if (submitted) return;
    // Render the user's submission as one line per changed lever — same shape
    // the Choices block uses so the agent can treat both uniformly.
    const lines = fields
      .map((f) => {
        const v = draft[f.key];
        if (v === undefined || v === '' || v === null) return null;
        return `${f.label} → ${v}`;
      })
      .filter((s): s is string => s !== null);
    if (lines.length === 0) return;
    const message = lines.join('\n');
    setSubmitted(message);
    onAction?.(message);
  };

  const reset = () => {
    if (submitted) return;
    setDraft(Object.fromEntries(fields.map((f) => [f.key, initialValue(f)])));
  };

  // Once applied, render a compact summary so the user sees what they sent.
  if (submitted) {
    return (
      <div className="bg-surface border border-line-strong rounded-xl p-4 mt-3">
        <p className="text-xs font-medium text-zinc-500 mb-2">Updated with</p>
        <ul className="space-y-1.5">
          {submitted.split('\n').map((line, i) => (
            <li key={i} className="text-xs text-zinc-200">{line}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line-strong rounded-xl p-4 mt-3">
      {props.title && (
        <p className="text-xs font-medium text-zinc-300 mb-3">{props.title}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <FieldControl
            key={f.key}
            field={f}
            value={draft[f.key]}
            onChange={(v) => patch(f.key, v)}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-line-strong bg-surface-sunken text-zinc-300 hover:border-zinc-600 transition-colors"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={apply}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-white text-black hover:bg-zinc-200 transition-colors"
        >
          {props.applyLabel ?? 'Update'}
        </button>
      </div>
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FilterField;
  value: string | number | undefined;
  onChange: (next: string | number | undefined) => void;
}) {
  const label = (
    <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
      {field.label}
    </span>
  );

  if (field.kind === 'select') {
    const opts = field.options
      .map(toOption)
      .filter((o): o is ChoiceOption => o !== null);
    return (
      <label className="flex flex-col gap-1">
        {label}
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="px-3 py-2 text-xs bg-surface-sunken border border-line rounded-lg text-white focus:outline-none focus:border-zinc-600"
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.value ?? o.label} value={o.value ?? o.label}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === 'date') {
    return (
      <label className="flex flex-col gap-1">
        {label}
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="px-3 py-2 text-xs bg-surface-sunken border border-line rounded-lg text-white focus:outline-none focus:border-zinc-600"
        />
      </label>
    );
  }

  if (field.kind === 'number') {
    return (
      <label className="flex flex-col gap-1">
        {label}
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={value === undefined ? '' : String(value)}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : Number(e.target.value))
          }
          className="px-3 py-2 text-xs bg-surface-sunken border border-line rounded-lg text-white focus:outline-none focus:border-zinc-600"
        />
      </label>
    );
  }

  // text
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        type="text"
        value={(value as string) ?? ''}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="px-3 py-2 text-xs bg-surface-sunken border border-line rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
      />
    </label>
  );
}
