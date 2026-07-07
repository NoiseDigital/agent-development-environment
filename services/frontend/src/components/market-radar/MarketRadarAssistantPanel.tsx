'use client';

// Market Radar's embedded assistant — a thin config over the shared
// <AssistantPanel> (components/agent/AssistantPanel.tsx). Only the copy + agent
// id live here; all behaviour is shared with AutoCorr's panel so the two can't
// drift.

import AssistantPanel, { type AssistantPanelConfig } from '../agent/AssistantPanel';

const CONFIG: AssistantPanelConfig = {
  agent: 'market_radar_assistant_agent',
  title: 'Market Radar Assistant',
  readySubtitle: 'Guiding your estimate',
  greetTrigger: 'I just selected a data source — what should I do, and which mode fits?',
  introTrigger:
    'No data source is selected yet. Greet me in 1-2 short sentences as the Market Radar ' +
    'assistant, say in plain terms what this estimator does, and ask me to pick a data ' +
    'source on the left to begin. Do not invent any data, brands, or markets.',
  narratePrompt:
    'The estimate just ran. In 2-4 short lines, tell me what stands out — the ' +
    'leaders, any share shifts, and anything worth a closer look.',
  placeholder: 'Ask about your competitors or this estimate…',
  emptyNotReady: {
    heading: 'Pick a data source',
    body:
      "Choose a competitive export on the left and I'll greet you, check your columns, " +
      'recommend basic vs advanced mode, and explain the estimates once you run them.',
  },
  emptyReady: {
    hint: "I'm grounded in your current estimate + share-of-voice.",
    suggestions: [
      'What should I do first with this data?',
      'Which competitor spends the most — and can I trust it?',
      'What does the model-support score actually mean?',
      'Where is share of voice most contested?',
    ],
  },
};

interface Props {
  contextPrefix: string;
  sourceKey: string;
  runSignal?: number;
}

export default function MarketRadarAssistantPanel(props: Props) {
  return <AssistantPanel config={CONFIG} {...props} />;
}
