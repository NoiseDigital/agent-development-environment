// GenUI component registry — the one place the agent's block catalog is wired
// to real React components. Add a block type by adding an entry here (and a
// member to the UIBlock union in types/genui).

import type { ReactNode } from 'react';
import type { UIBlock, UIComponent } from '../../types/genui';
import ChartVisualization from '../ChartVisualization';
import Choices from './Choices';
import Recommendation from './Recommendation';
import VegaChart from '../VegaChart';

/** Host-provided capabilities a block renderer may use. */
export interface RenderContext {
  /** Send a message back to the agent — used by interactive blocks. */
  onAction?: (text: string) => void;
}

type Renderer<T extends UIComponent> = (
  props: Extract<UIBlock, { component: T }>['props'],
  ctx: RenderContext,
) => ReactNode;

export const registry: { [T in UIComponent]: Renderer<T> } = {
  chart: (props) => <ChartVisualization chart={props} saveable />,
  choices: (props, ctx) => <Choices props={props} onAction={ctx.onAction} />,
  recommendation: (props) => <Recommendation {...props} />,
  vega: (props) => <VegaChart spec={props} />,
};
