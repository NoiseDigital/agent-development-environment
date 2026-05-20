'use client';

interface ResizeHandleProps {
  /** Which edge of the (relative-positioned) panel the handle sits on. */
  side: 'left' | 'right';
  onPointerDown: (e: React.PointerEvent) => void;
}

// A thin drag strip docked on a panel edge for width resizing.
export default function ResizeHandle({ side, onPointerDown }: ResizeHandleProps) {
  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      className={`absolute top-0 ${
        side === 'right' ? 'right-0' : 'left-0'
      } z-20 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40 transition-colors`}
    />
  );
}
