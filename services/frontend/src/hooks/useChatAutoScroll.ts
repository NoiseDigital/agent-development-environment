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

/** Pixel buffer kept around a "fitting" message so a near-viewport-height
 *  reply doesn't sit jammed against the top/bottom edges. */
const FIT_PADDING_PX = 24;

/** The one place we decide WHERE to land a finished reply.
 *    - Fits in the viewport → block:'end' (whole reply visible at bottom).
 *    - Overflows the viewport → block:'start' (top visible, scrollable down).
 *  Used by both the "reply just finished" effect and the resize observer
 *  that catches late chart sizing. */
function smartScrollLastMsg(
  lastMsgRef: RefObject<HTMLElement | null> | undefined,
  containerRef: RefObject<HTMLElement | null>,
) {
  const node = lastMsgRef?.current;
  const container = containerRef.current;
  if (!node) return;
  const viewportH = container?.clientHeight ?? window.innerHeight;
  const fits = node.offsetHeight + FIT_PADDING_PX <= viewportH;
  node.scrollIntoView({ behavior: 'smooth', block: fits ? 'end' : 'start' });
}

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

  // 2) Reply finished → smooth-scroll so the reader lands at the right spot.
  //    Single rule applied across every reply (text, chart, choices, mixed):
  //      • If the whole message FITS the viewport → bottom of message at
  //        bottom of viewport. Reader sees the entire reply in one frame.
  //      • If the message OVERFLOWS → top of message at top of viewport.
  //        Reader starts at the beginning and can scroll down — nothing
  //        is cut off behind the fold.
  //    Why this rule: scrolling to `end` on a too-tall reply pushes the
  //    intro / chart title above the viewport; scrolling to `start` on
  //    a short reply leaves wasted space below. One rule, the right
  //    answer in both cases.
  useEffect(() => {
    if (!lastMsgRef) return;
    const streaming = messages.some((m) => m.isStreaming);
    const justFinished = wasStreamingRef.current && !streaming;
    wasStreamingRef.current = streaming;
    if (!justFinished) return;
    const id = setTimeout(() => smartScrollLastMsg(lastMsgRef, containerRef), FINISH_SCROLL_DELAY_MS);
    return () => clearTimeout(id);
  }, [messages, lastMsgRef, containerRef]);

  // 2b) Late UI sizing — a single ResizeObserver on the last message row
  //     catches every height-growth event AFTER streaming ends:
  //       • templated_chart envelope finishing assembly (sub-frame growth)
  //       • Vega taking 500-1500ms to do its first layout
  //       • crosshair / brush layers adding height on first paint
  //       • suggestions / follow-up pills rendering after the chart
  //     Re-applies the same fit-vs-overflow rule whenever the row grows
  //     AND the user is still pinned near the bottom (followStreamRef).
  //     Without this, the initial 300ms scroll fires before Vega has
  //     measured the SVG — the row "ends" before the chart is visible.
  useEffect(() => {
    if (!lastMsgRef) return;
    const lastId = messages[messages.length - 1]?.id ?? null;
    const node = lastMsgRef.current;
    if (!node || !lastId) return;
    let prevHeight = node.offsetHeight;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = entry.contentRect.height;
      const grew = next > prevHeight + 4; // ignore sub-pixel jitter
      prevHeight = next;
      if (!grew || !followStreamRef.current) return;
      smartScrollLastMsg(lastMsgRef, containerRef);
    });
    obs.observe(node);
    return () => obs.disconnect();
    // Re-attach when the LAST message id changes — that's a new reply to
    // observe. Within one reply, the same observer keeps watching as the
    // chart finishes sizing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages[messages.length - 1]?.id, lastMsgRef, containerRef]);

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
