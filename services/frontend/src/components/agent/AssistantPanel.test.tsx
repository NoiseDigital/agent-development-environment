// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import AssistantPanel, { type AssistantPanelConfig } from './AssistantPanel';
import { AGENT_SILENT_PREFIX } from '../../lib/agent/silent';

// The unit under test is the shared panel's wiring (greeting, narrate, empty
// states, sends) — not the chat transport or the layout chrome. Mock those.
const sendMessage = vi.fn();
const createNewSession = vi.fn(() => Promise.resolve('sess-1'));

vi.mock('../../hooks/useChat', () => ({
  useChat: () => ({
    messages: [],
    isLoading: false,
    error: null,
    feedback: {},
    rateMessage: vi.fn(),
    sendMessage,
    createNewSession,
    sessions: [],
    sessionNames: {},
    selectSession: vi.fn(),
  }),
}));
vi.mock('../../hooks/useChatAutoScroll', () => ({ useChatAutoScroll: () => {} }));
vi.mock('../../contexts/SidebarContext', () => ({ useSidebarCollapsed: () => [false, vi.fn()] }));
vi.mock('../ui/CollapsiblePanel', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../chat/ChatMessage', () => ({ default: () => <div data-testid="msg" /> }));
vi.mock('../chat/SessionHistoryMenu', () => ({ default: () => null, toMs: () => 0 }));

const CONFIG: AssistantPanelConfig = {
  agent: 'test_assistant_agent',
  title: 'Test Assistant',
  readySubtitle: 'Guiding you',
  greetTrigger: 'GREET_ME',
  introTrigger: 'INTRO_ME',
  narratePrompt: 'NARRATE_ME',
  placeholder: 'Ask…',
  emptyNotReady: { heading: 'Pick a data source', body: 'body copy' },
  emptyReady: { hint: 'grounded hint', suggestions: ['First question?', 'Second question?'] },
};

beforeEach(() => {
  cleanup();
  sendMessage.mockClear();
  createNewSession.mockClear();
});

describe('AssistantPanel — shared embedded assistant', () => {
  it('opens a session and sends a SILENT intro on mount', async () => {
    render(<AssistantPanel config={CONFIG} contextPrefix="" sourceKey="" />);
    expect(createNewSession).toHaveBeenCalledWith('test_assistant_agent');
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(AGENT_SILENT_PREFIX + 'INTRO_ME', ''),
    );
  });

  it('shows the not-ready empty state before a source is selected', () => {
    render(<AssistantPanel config={CONFIG} contextPrefix="" sourceKey="" />);
    expect(screen.getByText('Pick a data source')).toBeInTheDocument();
    expect(screen.getByText('body copy')).toBeInTheDocument();
  });

  it('renders suggestion chips when ready and sends the prompt WITH context on click', async () => {
    render(<AssistantPanel config={CONFIG} contextPrefix="[ctx]" sourceKey="src-1" />);
    // The per-source silent greet fires with the context preamble.
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(AGENT_SILENT_PREFIX + 'GREET_ME', '[ctx]'),
    );
    fireEvent.click(screen.getByText('First question?'));
    // A user-visible suggestion (no silent prefix) sent with the context preamble.
    expect(sendMessage).toHaveBeenCalledWith('First question?', '[ctx]');
  });

  it('narrates once when runSignal changes (silent prompt + context)', async () => {
    const { rerender } = render(
      <AssistantPanel config={CONFIG} contextPrefix="[ctx]" sourceKey="src-1" runSignal={0} />,
    );
    sendMessage.mockClear();
    rerender(
      <AssistantPanel config={CONFIG} contextPrefix="[ctx]" sourceKey="src-1" runSignal={1} />,
    );
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(AGENT_SILENT_PREFIX + 'NARRATE_ME', '[ctx]'),
    );
    // The same signal must not re-narrate.
    const narrateCalls = sendMessage.mock.calls.filter(
      (c) => c[0] === AGENT_SILENT_PREFIX + 'NARRATE_ME',
    );
    expect(narrateCalls).toHaveLength(1);
  });
});
