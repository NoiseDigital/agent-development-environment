// Small hoverable "ⓘ" marker that reveals a one-line explanation on hover.
// CSS-only (no JS state) so it stays cheap and SSR-safe; the tooltip opens to
// the right to avoid being clipped by scrollable control panels.

export default function InfoHint({ text }: { text: string }) {
  return (
    <span
      className="group/hint relative inline-flex shrink-0 align-middle"
      onClick={(e) => e.preventDefault()}
    >
      <svg
        className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 z-50 w-56
          rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5
          text-[11px] font-normal normal-case leading-relaxed tracking-normal text-zinc-300
          opacity-0 transition-opacity duration-150 group-hover/hint:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
