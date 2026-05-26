'use client';

import { useMemo, useState } from 'react';
import type { ChoicesProps, ChoiceQuestion, ChoiceOption } from '../../types/genui';

/** A clarifying question after normalization — options are always objects. */
interface CleanQuestion {
  question: string;
  options: ChoiceOption[];
  multiSelect?: boolean;
  allowCustom?: boolean;
}

// An agent-surfaced set of clarifying questions, grouped into one tabbed block.
// The user moves between questions (tabs / Back-Next), picks option(s) or types
// a custom answer for each, and submits once — the combined answers go back to
// the agent as the next message. This is the GenUI feedback loop's richest
// interactive form: many ambiguities resolved in a single pass.

const valueOf = (o: ChoiceOption) => o.value ?? o.label;

/** Per-question working state: chosen option values plus any free-text. */
interface Draft {
  selected: string[];
  custom: string;
}

/** Coerce one option into a {label,value} object. Agents may send a bare
 *  string ("Revenue") or an object — both are valid; junk is dropped. As a
 *  safety net, a string that is itself a JSON {label,value} object (an agent
 *  serialization slip) is unwrapped rather than shown raw. */
function toOption(o: unknown): ChoiceOption | null {
  if (typeof o === 'string') {
    const label = o.trim();
    if (!label) return null;
    if (label.startsWith('{') && label.endsWith('}')) {
      try {
        const parsed = JSON.parse(label);
        if (parsed && typeof parsed.label === 'string') {
          return { label: parsed.label, value: parsed.value ?? parsed.label };
        }
      } catch {
        /* not JSON — fall through and use the raw string */
      }
    }
    return { label, value: label };
  }
  if (o && typeof (o as ChoiceOption).label === 'string') {
    const opt = o as ChoiceOption;
    return { label: opt.label, value: opt.value ?? opt.label };
  }
  return null;
}

/** A `choices` block may arrive in shapes the UI must survive — a legacy
 *  single-question payload ({ question, options }), string options, a missing
 *  `options` array, junk entries. Coerce whatever we get into a clean question
 *  list so a bad payload (e.g. an old saved message) degrades instead of
 *  crashing the whole chat. */
type LooseChoicesProps = ChoicesProps &
  Partial<Pick<ChoiceQuestion, 'question' | 'options' | 'multiSelect' | 'allowCustom'>>;

function normalizeQuestions(props: LooseChoicesProps): CleanQuestion[] {
  const raw: unknown[] = Array.isArray(props.questions)
    ? props.questions
    : props.question
      ? [props]
      : [];
  return raw
    .filter(
      (q): q is ChoiceQuestion =>
        !!q && typeof (q as ChoiceQuestion).question === 'string',
    )
    .map((q) => ({
      question: q.question,
      multiSelect: q.multiSelect,
      allowCustom: q.allowCustom,
      options: (Array.isArray(q.options) ? q.options : [])
        .map(toOption)
        .filter((o): o is ChoiceOption => o !== null),
    }));
}

export default function Choices({
  props,
  onAction,
}: {
  props: ChoicesProps;
  onAction?: (text: string) => void;
}) {
  const questions = useMemo(
    () => normalizeQuestions(props as LooseChoicesProps),
    [props],
  );

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    questions.map(() => ({ selected: [], custom: '' })),
  );
  const [activeRaw, setActive] = useState(0);
  const [submitted, setSubmitted] = useState<string | null>(null);

  if (questions.length === 0) return null;

  const intro = (props as LooseChoicesProps).intro;
  const active = Math.max(0, Math.min(activeRaw, questions.length - 1));

  /** The resolved answer for question `i` — selections and custom text joined. */
  const answerFor = (i: number) => {
    const d = drafts[i] ?? { selected: [], custom: '' };
    return [...d.selected, d.custom.trim()].filter(Boolean).join(', ');
  };
  const isAnswered = (i: number) => answerFor(i).length > 0;
  const answeredCount = questions.filter((_, i) => isAnswered(i)).length;
  const allAnswered = answeredCount === questions.length;

  const q = questions[active];
  const draft = drafts[active] ?? { selected: [], custom: '' };

  const patch = (i: number, next: Partial<Draft>) => {
    if (submitted) return;
    setDrafts((cur) => {
      // Backfill in case state predates the normalized question list.
      const base =
        cur.length === questions.length
          ? cur
          : questions.map((_, idx) => cur[idx] ?? { selected: [], custom: '' });
      return base.map((d, idx) => (idx === i ? { ...d, ...next } : d));
    });
  };

  const toggle = (val: string) => {
    if (submitted) return;
    const cur = draft.selected;
    const next = q.multiSelect
      ? cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val]
      : cur.includes(val) ? [] : [val];
    patch(active, { selected: next });
  };

  const submit = () => {
    if (submitted || !allAnswered) return;
    const combined = questions
      .map((qq, i) => `${qq.question} → ${answerFor(i)}`)
      .join('\n');
    setSubmitted(combined);
    onAction?.(combined);
  };

  // Once submitted the block locks to a compact read-only summary.
  if (submitted) {
    return (
      <div className="bg-surface border border-line-strong rounded-xl p-4 mt-3">
        <p className="text-xs font-medium text-zinc-500 mb-2">Answered</p>
        <ul className="space-y-1.5">
          {questions.map((qq, i) => (
            <li key={i} className="text-xs text-zinc-400">
              {qq.question}{' '}
              <span className="text-zinc-200">{answerFor(i)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line-strong rounded-xl p-4 mt-3">
      {intro && <p className="text-sm text-zinc-300 mb-3">{intro}</p>}

      {/* Tab bar — one tab per question, with an answered dot. Multiple tabs
          let the user jump around and revise before the single submit. */}
      {questions.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {questions.map((_, i) => {
            const isActive = i === active;
            const done = isAnswered(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-500/15 border border-accent-500 text-white'
                    : 'bg-surface-sunken border border-line text-zinc-400 hover:border-line-strong'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    done ? 'bg-emerald-400' : 'bg-zinc-600'
                  }`}
                />
                Q{i + 1}
              </button>
            );
          })}
        </div>
      )}

      {/* Active question header. Multi-select hint + bulk actions sit on the
          same row so the affordances are discoverable without crowding. */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-white">{q.question}</p>
        {q.multiSelect && (
          <div className="flex shrink-0 items-center gap-2 text-[10px]">
            <span className="font-medium uppercase tracking-wider text-zinc-500">
              Pick all that apply
            </span>
            <button
              type="button"
              onClick={() => patch(active, { selected: q.options.map(valueOf) })}
              className="rounded px-1.5 py-0.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => patch(active, { selected: [] })}
              className="rounded px-1.5 py-0.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Option chips. The first 1-3 options are the agent's recommended
          starts; subsequent ones live in a softer row so the eye lands on
          the recommendations first. */}
      {(() => {
        const RECOMMEND_COUNT = Math.min(3, q.options.length);
        const recs = q.options.slice(0, RECOMMEND_COUNT);
        const rest = q.options.slice(RECOMMEND_COUNT);
        const renderChip = (o: ChoiceOption, recommended: boolean) => {
          const val = valueOf(o);
          const isActive = draft.selected.includes(val);
          return (
            <button
              key={val}
              type="button"
              onClick={() => toggle(val)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'border-accent-500 bg-accent-500/15 text-white'
                  : recommended
                    ? 'border-accent-500/40 bg-accent-500/5 text-zinc-200 hover:border-accent-500/70'
                    : 'border-line-strong bg-surface-sunken text-zinc-300 hover:border-zinc-600'
              }`}
            >
              {q.multiSelect ? (
                <span
                  className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${
                    isActive ? 'border-accent-500 bg-accent-500' : 'border-zinc-600'
                  }`}
                >
                  {isActive && (
                    <svg className="h-2.5 w-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              ) : (
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    isActive ? 'bg-accent-500 ring-2 ring-accent-500/30' : 'border border-zinc-600'
                  }`}
                />
              )}
              <span>{o.label}</span>
            </button>
          );
        };
        return (
          <>
            {recs.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-accent-300/80">
                  Recommended
                </p>
                <div className="flex flex-wrap gap-2">
                  {recs.map((o) => renderChip(o, true))}
                </div>
              </div>
            )}
            {rest.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  More options
                </p>
                <div className="flex flex-wrap gap-2">
                  {rest.map((o) => renderChip(o, false))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* "Type your own" — always visible when allowCustom is set, with a
          subtle divider so it reads as the catch-all path. */}
      {q.allowCustom && (
        <div className="mt-3 border-t border-zinc-800/60 pt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Or type your own
          </p>
          <input
            type="text"
            value={draft.custom}
            onChange={(e) => patch(active, { custom: e.target.value })}
            placeholder="Enter a custom answer…"
            className="w-full rounded-lg border border-line bg-surface-sunken px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
        </div>
      )}

      {/* Footer — Back/Next nav, progress counter, and the gated Submit. */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setActive((i) => Math.max(0, i - 1))}
            disabled={active === 0}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-line-strong bg-surface-sunken text-zinc-300 hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setActive((i) => Math.min(questions.length - 1, i + 1))}
            disabled={active === questions.length - 1}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-line-strong bg-surface-sunken text-zinc-300 hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {answeredCount}/{questions.length} answered
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
