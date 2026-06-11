'use client';

import { Component, type ReactNode } from 'react';

// Isolates one GenUI block: if its renderer throws (a malformed payload, a
// legacy saved message), this swallows the error so the rest of the chat keeps
// rendering instead of the whole page crashing. Same spirit as GenUIRenderer
// skipping unknown components — a bad block degrades, it does not break.
export default class BlockBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('GenUI block failed to render:', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="mt-3 text-xs text-faint italic">
          A part of this response could not be displayed.
        </p>
      );
    }
    return this.props.children;
  }
}
