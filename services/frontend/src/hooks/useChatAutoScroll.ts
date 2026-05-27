'use client';

// Shared chat scroll behaviour — used by both the full-chat panel and the
// floating assistant so a reader's experience is identical across surfaces.
//
// Four coordinated behaviours, gated on the right signal:
//
//   1. Conversation load (refresh / session swap) → jump straight to the
//      newest message (no smooth scroll — instant). Keyed off the FIRST
//      message's id so it fires once per conversation, not per token.
//
//   2. User just hit send → smooth scroll to the bottom so the user sees
//      their own message land + the agent's reply appear.
//
//   3. Reply finished streaming → smooth-scroll the TOP of that reply to
//      the top of the viewport so the reader starts at the beginning. A
//      short delay lets a chart finish sizing before the scroll target
//      resolves. `block: 'start'` is browser-clamped — short replies just
//      sit fully visible.
//
//   4. Sticky-bottom while the agent streams → follow only when the user
//      is already pinned near the bottom. If they scrolled up to re-read,
//      we don't yank them back on every token.
//
// API: three refs and the message list. Provide all three refs from the
// caller (one to the scroll container, one to a bottom sentinel, one to
// the last message row). Each is optional in the sense that null refs are
// no-ops — but skipping a ref skips its corresponding behaviour.

import { useEffect, useRef, type RefObject } from 'react';
import type { ChatMessage } from './useChat';

interface UseChatAutoScrollArgs {
  /** The scrollable element holding the messages. */
  containerRef: RefObject<HTMLElement | null>;
  /** A zero-height sentinel placed AFTER the last message — scroll target
   *  for "jump to bottom" behaviours. */
  endRef: RefObject<HTMLElement | null>;
  /** Optional ref to the LAST message's row. When provided, enables the
   *  "scroll new reply to its top" behaviour after streaming finishes. */
  lastMsgRef?: RefObject<HTMLElement | null>;
  messages: ChatMessage[];
}

/** How close to the bottom (px) counts as "pinned" — controls whether the
 *  sticky-follow effect engages. Tuned to forgive a small accidental scroll. */
const PIN_THRESHOLD_PX = 120;

/** Delay before scrolling a finished reply to its top — gives the renderer
 *  a chance to settle (a chart that's still measuring would move under us). */
const FINISH_SCROLL_DELAY_MS = 300;

export function useChatAutoScroll({
  containerRef,
  endRef,
  lastMsgRef,
  messages,
}: UseChatAutoScrollArgs): void {
  const wasStreamingRef = useRef(false);
  const prevLengthRef = useRef(messages.length);
  const lastLoadedFirstId = useRef<string | null>(null);
  const followStreamRef = useRef(true);

  // 1) Session load — instant jump to newest.
  useEffect(() => {
    const firstId = messages[0]?.id ?? null;
    if (firstId && firstId !== lastLoadedFirstId.current) {
      lastLoadedFirstId.current = firstId;
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages, endRef]);

  // 2) Reply finished → smooth-scroll its top to the top of the viewport.
  useEffect(() => {
    if (!lastMsgRef) return;
    const streaming = messages.some((m) => m.isStreaming);
    const justFinished = wasStreamingRef.current && !streaming;
    wasStreamingRef.current = streaming;
    if (!justFinished) return;
    const id = setTimeout(() => {
      lastMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, FINISH_SCROLL_DELAY_MS);
    return () => clearTimeout(id);
  }, [messages, lastMsgRef]);

  // 3) User just sent → smooth scroll to bottom.
  useEffect(() => {
    const prev = prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (messages.length <= prev) return;
    const userJustSent = messages.slice(prev).some((m) => m.author === 'user');
    if (userJustSent) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, endRef]);

  // 4a) Track whether the user is pinned to the bottom — only set up once
  //     per container; the listener is passive so it doesn't fight scroll.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      followStreamRef.current = distanceFromBottom < PIN_THRESHOLD_PX;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  // 4b) Sticky-bottom while streaming — only if the user was pinned.
  useEffect(() => {
    const streaming = messages.some((m) => m.isStreaming);
    if (!streaming || !followStreamRef.current) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, endRef]);
}
