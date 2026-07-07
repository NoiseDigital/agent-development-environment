'use client';

// AutoCorr's embedded assistant — a thin config over the shared <AssistantPanel>
// (components/agent/AssistantPanel.tsx). Only the copy + agent id live here; all
// behaviour (silent greeting, per-source re-greet, narrate-on-run, history,
// collapse) is shared so it can't drift from Market Radar's panel.

import AssistantPanel, { type AssistantPanelConfig } from '../agent/AssistantPanel';

const CONFIG: AssistantPanelConfig = {
  agent: 'autocorr_assistant_agent',
  title: 'AutoCorr Assistant',
  readySubtitle: 'Guiding your analysis',
  greetTrigger: 'I just selected a data source — what should I analyze, and how?',
  introTrigger:
    'No data source is selected yet. Greet me in 1-2 short sentences as the AutoCorr ' +
    'assistant, say in plain terms what this tool does, and ask me to pick a data ' +
    'source on the left to begin. Do not invent any data or column names.',
  narratePrompt:
    'The analysis just ran. In 2-4 short lines, tell me what stands out in the ' +
    'results — the strongest signals and anything worth a closer look.',
  placeholder: 'Ask about your data or this analysis…',
  emptyNotReady: {
    heading: 'Pick a data source',
    body:
      "Choose a source on the left and I'll greet you, suggest which columns are " +
      'drivers vs KPIs, and walk you through running the analysis.',
  },
  emptyReady: {
    hint: "I'm grounded in your current heatmap + top signals.",
    suggestions: [
      'Which signals are worth focusing on?',
      'Why is the strongest correlation strong?',
      'What should I try next — different method, lag, or preprocessing?',
      'Are any of these correlations just leakage?',
    ],
  },
};

interface Props {
  contextPrefix: string;
  sourceKey: string;
  runSignal?: number;
}

export default function AutocorrAssistantPanel(props: Props) {
  return <AssistantPanel config={CONFIG} {...props} />;
}
