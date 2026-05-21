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
}: {
  blocks: UIBlock[];
  /** Lets interactive blocks send a message back to the agent. */
  onAction?: (text: string) => void;
}) {
  const ctx: RenderContext = { onAction };
  return (
    <>
      {blocks.map((block, i) => {
        const render = registry[block.component] as
          | ((props: unknown, ctx: RenderContext) => ReactNode)
          | undefined;
        if (!render) return null;
        return (
          <div key={block.id ?? `${block.component}-${i}`}>
            <BlockBoundary>{render(block.props, ctx)}</BlockBoundary>
          </div>
        );
      })}
    </>
  );
}
