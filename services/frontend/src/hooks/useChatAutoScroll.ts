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

/** Debounce window after a row's last growth event before we commit a
 *  follow-up scroll. Vega's first layout fires many ResizeObserver events
 *  in quick succession; scrolling on each one starts a new smooth-scroll
 *  animation and the page judders. We wait until growth has stopped for
 *  this long, then do ONE landing scroll. */
const GROWTH_SETTLE_MS = 180;

/** Always land the BOTTOM of the most recent reply at the bottom of the
 *  viewport. When the reply fits, the top is naturally visible too. When
 *  it doesn't, the top scrolls above the viewport — the user can scroll
 *  up to read it, but the visual payoff (chart / pills) is always
 *  on-screen. `instant` is used by the resize observer so it doesn't
 *  fight an in-flight smooth animation; 'smooth' is for the one-shot
 *  scroll after the reply finishes. */
function scrollMsgIntoView(
  lastMsgRef: RefObject<HTMLElement | null> | undefined,
  behavior: ScrollBehavior,
) {
  const node = lastMsgRef?.current;
  if (!node) return;
  node.scrollIntoView({ behavior, block: 'end' });
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
  // followStreamRef = live "distance to bottom < threshold" — only safe to
  // use as a scroll gate WHILE streaming, when scrollHeight grows slowly
  // alongside scrollTop. After a reply ends, a chart / choices block can
  // append hundreds of pixels of content in one paint, which makes
  // distanceFromBottom jump and flips this flag to false even though the
  // user hasn't moved. Use it ONLY for sticky-bottom-during-stream.
  const followStreamRef = useRef(true);
  // followReplyRef = "user intent to follow THIS reply." Captured ONCE per
  // reply (when streaming ends) from the live scrollTop at that moment, and
  // only invalidated when the user actually wheels / touches / keys the
  // chat container. Decoupled from live position so a chart growing under
  // us doesn't accidentally opt the user out of following.
  const followReplyRef = useRef(true);

  // 1) Session load — instant jump to newest.
  useEffect(() => {
    const firstId = messages[0]?.id ?? null;
    if (firstId && firstId !== lastLoadedFirstId.current) {
      lastLoadedFirstId.current = firstId;
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages, endRef]);

  // 2) Reply finished → one smooth scroll that lands the BOTTOM of the
  //    new reply at the bottom of the viewport.
  //
  //    We can't rely on the streaming → not-streaming transition alone.
  //    For replies that arrive in a SINGLE SSE event (the templated
  //    clarification fast path is the classic case), React 18 batches
  //    the two `patchStream` calls (one for accumulated, one for the
  //    completed snapshot) across the microtask boundary. The streaming
  //    bubble never actually renders, so `wasStreamingRef` stays false
  //    and `justFinished` never fires. Multi-event replies (chart path,
  //    where tool-call + tool-response + text are separate events) DO
  //    render the streaming bubble — which is why scroll works for
  //    visualizations and fails for choices.
  //
  //    Instead: scroll once per UNIQUE agent message id that has reached
  //    a "settled" shape (not streaming, has prose OR UI). Covers both
  //    paths uniformly; idempotent across re-renders.
  const lastSettledIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lastMsgRef) return;
    const last = messages[messages.length - 1];
    if (!last || last.author === 'user') return;
    const settled = !last.isStreaming && (last.content.trim() !== '' || (last.ui?.length ?? 0) > 0);
    if (!settled) return;
    if (lastSettledIdRef.current === last.id) return;
    lastSettledIdRef.current = last.id;
    if (!followReplyRef.current) return;
    // Fire IMMEDIATELY. A setTimeout(300ms) used to wrap this with the
    // intent of "let layout settle"; in practice it was a 300ms window
    // during which `messages` re-renders (the in-flight stream cleanup +
    // session refetch BOTH land within ~50ms) repeatedly fired this
    // effect's cleanup, calling clearTimeout, and the scroll silently
    // never executed. That's why the bug only showed up on choices
    // (single-event SSE → fast refetch) and not on charts (multi-event
    // SSE → slow refetch, timer fired before cancellation).
    //
    // Sync content (choices) is fully laid out by the time the snapshot
    // lands — no delay needed. Async content (chart) is handled by
    // Effect 2b's ResizeObserver on each layout step.
    scrollMsgIntoView(lastMsgRef, 'smooth');
  }, [messages, lastMsgRef]);

  // Keep `wasStreamingRef` in sync so the streaming-during-stream effect
  // can still inspect "is anything streaming right now" correctly. This
  // ref used to gate effect (2) but is now only retained for diagnostic
  // / future-use purposes — the settled-id approach above replaces it.
  useEffect(() => {
    wasStreamingRef.current = messages.some((m) => m.isStreaming);
  }, [messages]);

  // 2b) Late UI sizing — debounced ResizeObserver. Vega + a choices block
  //     append a lot of content in one paint AFTER the snapshot lands;
  //     without this, the post-stream scroll lands at a position that's
  //     immediately out-of-date.
  //
  //     CRITICAL: gate on `followReplyRef` (captured once at reply end),
  //     NOT `followStreamRef` (live distance-to-bottom). Chart growth
  //     itself enlarges distanceFromBottom by hundreds of pixels in one
  //     paint, flipping followStreamRef to false even though the user
  //     hasn't moved — and the late-sizing scroll never fires. Using the
  //     captured intent keeps the contract: "if the user was at the
  //     bottom when the reply came in, follow it down."
  useEffect(() => {
    if (!lastMsgRef) return;
    const lastId = messages[messages.length - 1]?.id ?? null;
    const node = lastMsgRef.current;
    if (!node || !lastId) return;
    let prevHeight = node.offsetHeight;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = entry.contentRect.height;
      const grew = next > prevHeight + 4; // ignore sub-pixel jitter
      prevHeight = next;
      if (!grew || !followReplyRef.current) return;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        scrollMsgIntoView(lastMsgRef, 'smooth');
      }, GROWTH_SETTLE_MS);
    });
    obs.observe(node);
    return () => {
      obs.disconnect();
      if (settleTimer) clearTimeout(settleTimer);
    };
    // Re-attach when the LAST message id changes — that's a new reply to
    // observe. Within one reply, the same observer keeps watching as the
    // chart finishes sizing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages[messages.length - 1]?.id, lastMsgRef]);

  // 3) User just sent → smooth scroll to bottom AND re-arm follow intent
  //    for the upcoming reply. The "send" gesture is unambiguous evidence
  //    the user wants to see the agent's response, regardless of any
  //    prior wheel/touch that might have opted them out.
  useEffect(() => {
    const prev = prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (messages.length <= prev) return;
    const userJustSent = messages.slice(prev).some((m) => m.author === 'user');
    if (userJustSent) {
      followReplyRef.current = true;
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, endRef]);

  // 4a) Track sticky-bottom (live distance to bottom) AND user intent.
  //     - `scroll`        → updates followStreamRef (used by 4b only).
  //     - `wheel/touch/key` → marks intent to opt out, clearing
  //       followReplyRef so late chart growth stops yanking the page.
  //     We DON'T clear followReplyRef from `scroll` events — programmatic
  //     scrolls fire scroll too, and a content-growth-driven distance jump
  //     would otherwise look indistinguishable from a real user scroll.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      followStreamRef.current = distanceFromBottom < PIN_THRESHOLD_PX;
    };
    const onUserIntent = () => {
      followReplyRef.current = false;
    };
    // keydown listener is SELECTIVE — only the keys that scroll the
    // viewport clear follow-intent. Otherwise the Enter / Tab / Space
    // the user presses while interacting with a Choices block (or any
    // in-message UI) would clobber the intent flag and the post-reply
    // scroll would silently skip. That's the bug we hit on choices but
    // not on charts: chart replies are sent via the input (outside the
    // scroll container), so its Enter key never reached this listener.
    const SCROLL_KEYS = new Set([
      'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'Space',
    ]);
    const onKeyboardScroll = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) followReplyRef.current = false;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('wheel', onUserIntent, { passive: true });
    container.addEventListener('touchstart', onUserIntent, { passive: true });
    container.addEventListener('keydown', onKeyboardScroll);
    return () => {
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('wheel', onUserIntent);
      container.removeEventListener('touchstart', onUserIntent);
      container.removeEventListener('keydown', onKeyboardScroll);
    };
  }, [containerRef]);

  // 4b) Sticky-bottom while streaming — only if the user was pinned.
  useEffect(() => {
    const streaming = messages.some((m) => m.isStreaming);
    if (!streaming || !followStreamRef.current) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, endRef]);
}
