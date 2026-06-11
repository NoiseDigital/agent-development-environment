// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ChatMessage from './ChatMessage';
import type { ChatMessage as ChatMessageData } from '../../hooks/useChat';

// Mock GenUIRenderer — the bubble-rendering contract is the unit under test,
// not the chart/choices renderers themselves.
vi.mock('../genui/GenUIRenderer', () => ({
  default: () => <div data-testid="gen-ui" />,
}));

beforeEach(() => {
  cleanup();
});

function agent(overrides: Partial<ChatMessageData> = {}): ChatMessageData {
  return {
    id: 'm1',
    content: '',
    author: 'MediaPerformanceAgent',
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

describe('ChatMessage — no ghost bubble for invisible/empty content', () => {
  it('skips the row entirely when an agent message is empty AND has no UI', () => {
    const { container } = render(<ChatMessage message={agent({ content: '' })} />);
    // ChatMessage returns null in this case — the row is absent from the DOM.
    expect(container.querySelector('.animate-message-in')).toBeNull();
  });

  it('does NOT render a prose bubble for whitespace-only streaming content', () => {
    // The classic ghost bar: streaming with content that .trim()s to empty.
    // Should fall through to the inline LoadingRow spinner, not a wide bubble.
    render(
      <ChatMessage
        message={agent({ content: '\n\n   ', isStreaming: true })}
        loadingLabel="Thinking"
      />,
    );
    expect(document.querySelector('.rounded-2xl')).toBeNull();
    expect(screen.getByText(/Thinking/)).toBeInTheDocument();
  });

  it('does NOT render a prose bubble for zero-width-char-only streaming content', () => {
    // The OTHER ghost bar: ZWSP (U+200B) + bidi marks survive String.trim()
    // so the older `content.trim() !== ''` check fired hasContent=true and
    // drew an empty bubble + cursor. The stricter INVISIBLE_RE in ChatMessage
    // catches them.
    const ghosts = [
      '​',                 // zero-width space alone
      '​‌‍',     // zero-width space + non-joiner + joiner
      '﻿',                 // byte order mark
      '‪ hidden ‬',   // bidi-wrapped content that's effectively empty? No: 'hidden' is visible
      '​   ​',        // ZWSPs around whitespace
    ];
    for (const ghost of ghosts.filter((g) => !/[a-z]/i.test(g))) {
      cleanup();
      render(
        <ChatMessage
          message={agent({ content: ghost, isStreaming: true })}
          loadingLabel="Thinking"
        />,
      );
      // No bubble.
      expect(document.querySelector('.rounded-2xl'), `bubble leaked for ${JSON.stringify(ghost)}`)
        .toBeNull();
    }
  });

  it('catches less-common invisible chars too (variation selectors, soft hyphen, Hangul fillers)', () => {
    // The Default_Ignorable_Code_Point upgrade should cover every variant
    // that renders to nothing but survives .trim(). These are the ones the
    // older char-class regex MISSED:
    const exotics = [
      '­',          // soft hyphen
      '️',          // variation selector-16
      'ᅟ',          // Hangul Choseong filler
      '᠎',          // Mongolian vowel separator
      '͏',          // combining grapheme joiner
      '­­​', // mixed exotics + ZWSP
    ];
    for (const ghost of exotics) {
      cleanup();
      render(
        <ChatMessage
          message={agent({ content: ghost, isStreaming: true })}
          loadingLabel="Thinking"
        />,
      );
      expect(document.querySelector('.rounded-2xl'), `bubble leaked for ${JSON.stringify(ghost)}`)
        .toBeNull();
    }
  });

  it('DOES render a prose bubble when content has even one visible character', () => {
    render(<ChatMessage message={agent({ content: 'hi' })} />);
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(document.querySelector('.rounded-2xl')).not.toBeNull();
  });

  it('renders the UI blocks without an empty prose bubble when content is whitespace-only', () => {
    // Mixed: empty/whitespace prose + a chart block. The bubble should be
    // skipped; the chart still renders. (User-facing: pure-UI replies don't
    // get a ghost bubble above them.)
    render(
      <ChatMessage
        message={agent({
          content: '   ',
          ui: [{ component: 'chart', props: { mark: 'bar', encoding: {} } }],
        })}
      />,
    );
    expect(document.querySelector('.rounded-2xl')).toBeNull();
    expect(screen.getByTestId('gen-ui')).toBeInTheDocument();
  });
});
