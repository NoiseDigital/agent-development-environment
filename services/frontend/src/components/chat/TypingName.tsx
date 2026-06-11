'use client';

import { useEffect, useState } from 'react';

interface TypingNameProps {
  /** The final name to display. */
  name: string;
  /** When true, animate the displayed text from empty to `name` char-by-char.
   *  When false (or transitions back to false after typing finishes), the
   *  full name is shown instantly. Gate this on `aiRenamedIds.has(sessionId)`
   *  from useChat so the animation only plays for AI-generated renames. */
  animate: boolean;
  /** ms per character. ~28-36ms reads as deliberate but not slow. */
  speedMs?: number;
}

/** Renders `name` either instantly or with a typing animation. Used by the
 *  sidebar session list + chat header to reveal AI-generated session names
 *  letter by letter, so the rename feels alive instead of just popping in.
 *
 *  Animation lifecycle is keyed off (name + animate): when EITHER changes,
 *  the effect restarts. Cleanup clears the interval on unmount or restart. */
export default function TypingName({ name, animate, speedMs = 32 }: TypingNameProps) {
  const [shown, setShown] = useState(animate ? '' : name);

  useEffect(() => {
    if (!animate || !name) {
      setShown(name);
      return;
    }
    // Fresh animation — start blank, fill char by char.
    setShown('');
    let i = 0;
    const interval = window.setInterval(() => {
      i += 1;
      setShown(name.slice(0, i));
      if (i >= name.length) window.clearInterval(interval);
    }, speedMs);
    return () => window.clearInterval(interval);
  }, [name, animate, speedMs]);

  // Render a non-breaking space when shown is empty so the row's height
  // doesn't collapse for the one frame between mount and the first interval
  // tick. Looks like a brief flicker otherwise.
  return <>{shown || ' '}</>;
}
