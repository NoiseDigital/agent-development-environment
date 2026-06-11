// Renders an agent's UIBlock list from the component registry. Unknown
// components are skipped rather than crashing the message — so a frontend that
// is behind the agent's catalog degrades gracefully.

import type { ReactNode } from 'react';
import type { UIBlock } from '../../types/genui';
import { registry, type RenderContext } from './registry';
import BlockBoundary from './BlockBoundary';

export default function GenUIRenderer({
  blocks,
  onAction,
  messageId,
}: {
  blocks: UIBlock[];
  /** Lets interactive blocks send a message back to the agent. */
  onAction?: (text: string) => void;
  /** Parent message's ADK event id — interactive blocks key persisted state
   *  off this + their block index so "Answered" / "Applied" survives remounts. */
  messageId?: string;
}) {
  return (
    <>
      {blocks.map((block, i) => {
        const render = registry[block.component] as
          | ((props: unknown, ctx: RenderContext) => ReactNode)
          | undefined;
        if (!render) return null;
        const ctx: RenderContext = { onAction, messageId, blockIndex: i };
        return (
          <div key={block.id ?? `${block.component}-${i}`}>
            <BlockBoundary>{render(block.props, ctx)}</BlockBoundary>
          </div>
        );
      })}
    </>
  );
}
