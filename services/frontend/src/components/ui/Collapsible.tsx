import { type ReactNode } from 'react';

/**
 * Height + fade animation for an expand/collapse section. Uses the grid-rows
 * trick — animating `grid-template-rows` from `0fr` to `1fr` — so it eases
 * to/from `height: auto` without measuring the DOM. Children stay mounted;
 * visibility is driven by `open`.
 */
export default function Collapsible({
  open,
  children,
  className = '',
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid transition-all duration-300 ease-in-out ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      } ${className}`}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
    </div>
  );
}
