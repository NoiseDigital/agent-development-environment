'use client';

// Proactive follow-up pills the agent drops beneath a reply. Each chip is a
// one-click "ask this" — sends the chip's text as the next user message.
// No state, no submit button — fast, low-friction next-step nudges so the
// chat reads as a guided exploration rather than a sterile Q&A.

import type { SuggestionsProps } from '../../types/genui';

export default function Suggestions({
  props,
  onAction,
}: {
  props: SuggestionsProps;
  onAction?: (text: string) => void;
}) {
  const items = Array.isArray(props.items) ? props.items.filter(Boolean) : [];
  if (items.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {props.title && (
        <span className="self-center pr-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {props.title}
        </span>
      )}
      {items.map((text, i) => (
        <button
          key={`${i}-${text}`}
          type="button"
          onClick={() => onAction?.(text)}
          className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-accent-400/60 hover:bg-accent-400/10 hover:text-white"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
