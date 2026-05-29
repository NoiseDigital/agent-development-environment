// GenUI component registry — the one place the agent's block catalog is wired
// to real React components. Add a block type by adding an entry here (and a
// member to the UIBlock union in types/genui).

import type { ReactNode } from 'react';
import type { UIBlock, UIComponent } from '../../types/genui';
import Choices from './Choices';
import Filters from './Filters';
import Suggestions from './Suggestions';
import Action from './Action';
import ChartBlock from './ChartBlock';
import TemplatedChartBlock from './TemplatedChartBlock';

/** Host-provided capabilities a block renderer may use. */
export interface RenderContext {
  /** Send a message back to the agent — used by interactive blocks. */
  onAction?: (text: string) => void;
  /** Parent message id (stable ADK event id once the turn completes). */
  messageId?: string;
  /** Index of this block within its parent message's `ui` array. */
  blockIndex?: number;
}

type Renderer<T extends UIComponent> = (
  props: Extract<UIBlock, { component: T }>['props'],
  ctx: RenderContext,
) => ReactNode;

export const registry: { [T in UIComponent]: Renderer<T> } = {
  chart: (props) => <ChartBlock spec={props} />,
  templated_chart: (props) => <TemplatedChartBlock props={props} />,
  choices: (props, ctx) => (
    <Choices
      props={props}
      onAction={ctx.onAction}
      messageId={ctx.messageId}
      blockIndex={ctx.blockIndex}
    />
  ),
  filters: (props, ctx) => (
    <Filters
      props={props}
      onAction={ctx.onAction}
      messageId={ctx.messageId}
      blockIndex={ctx.blockIndex}
    />
  ),
  suggestions: (props, ctx) => <Suggestions props={props} onAction={ctx.onAction} />,
  action: (props, ctx) => (
    <Action props={props} messageId={ctx.messageId} blockIndex={ctx.blockIndex} />
  ),
};
