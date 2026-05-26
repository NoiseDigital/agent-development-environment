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

  // Compact pill layout — fields flow horizontally, labels inline, all on one
  // row when possible. The card chrome was clunky for what's effectively a
  // toolbar; this reads as a footer beneath the chart.
  return (
    <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2">
      {props.title && (
        <span className="self-center text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {props.title}
        </span>
      )}
      {fields.map((f) => (
        <FieldControl
          key={f.key}
          field={f}
          value={draft[f.key]}
          onChange={(v) => patch(f.key, v)}
        />
      ))}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={reset}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={apply}
          className="rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-black transition-colors hover:bg-zinc-200"
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
  // Inline label + control on one line — reads as a "Metric: spend" pill.
  const inputCls =
    'rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-white focus:border-zinc-600 focus:outline-none';

  if (field.kind === 'select') {
    const opts = field.options
      .map(toOption)
      .filter((o): o is ChoiceOption => o !== null);
    return (
      <label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {field.label}
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={`${inputCls} normal-case`}
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
      <label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {field.label}
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={`${inputCls} normal-case`}
        />
      </label>
    );
  }

  if (field.kind === 'number') {
    return (
      <label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {field.label}
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={value === undefined ? '' : String(value)}
          onChange={(e) =>
            onChange(e.target.value === '' ? undefined : Number(e.target.value))
          }
          className={`${inputCls} w-16`}
        />
      </label>
    );
  }

  // text
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
      {field.label}
      <input
        type="text"
        value={(value as string) ?? ''}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={`${inputCls} placeholder-zinc-600 normal-case`}
      />
    </label>
  );
}
