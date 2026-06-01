'use client';

interface TextTileProps {
  text: string;
  editing: boolean;
  onChange: (text: string) => void;
}

// A free-text element that can live on the dashboard grid alongside charts.
// In edit mode it becomes an inline textarea; the `no-drag` class lets the user
// select/type without the grid treating it as a tile drag.
export default function TextTile({ text, editing, onChange }: TextTileProps) {
  if (editing) {
    return (
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type text…"
        className="no-drag w-full h-full bg-transparent resize-none text-sm leading-relaxed text-zinc-200 placeholder-zinc-600 outline-none"
      />
    );
  }

  return (
    <div className="h-full overflow-auto text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
      {text || <span className="text-zinc-600 italic">Empty text block</span>}
    </div>
  );
}
