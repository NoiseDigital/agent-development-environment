'use client';

// SSE stream lifecycle + projected `messages` array.
//   - Owns the per-session in-flight streams map (a stream survives session
//     navigation; returning to its origin re-projects the bubble).
//   - Owns the SSE consumer (`sendMessage`) — opens the stream, accumulates
//     events, surfaces working-state / tool calls / partial UI fallbacks,
//     and snapshots the final reply onto the stream before the refetch.
//   - Owns the derivation effect that combines committed events + the
//     in-flight stream into the visible message list.
//
// Extracted from useChat. Session ownership lives in ./useSessions; the
// streaming layer reaches into it via the setters / fresh-session ref it
// receives as args.

import { useEffect, useRef, useState } from 'react';
import { adkApi, type AgentRunRequest, type Session } from '../lib/agent/adk-api';
import {
  dedupeToolCalls,
  extractToolCalls,
  phaseFromEvent,
  type ChatMessage,
  type ToolCall,
} from '../lib/agent/events';
import {
  deriveMessages,
  type InFlightStream,
} from '../lib/agent/projection';
import {
  parseAgentResponse,
  streamingDisplayText,
} from '../lib/agent/response';
import { setNeuralThinking } from '../lib/agent/neural-pulse';
import type { UIBlock } from '../types/genui';

const FALLBACK_REPLY =
  "I wasn't able to complete that — something went wrong on my end. " +
  'Please try again, or rephrase your question.';

interface UseChatStreamArgs {
  selectedApp: string | null;
  userId: string;
  currentSession: Session | null;
  supportsVisualization: boolean;
  /** Refetch the session after the agent finishes the turn — owned by the
   *  sessions hook so writes flow through the canonical state. */
  setAllSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setCurrentSession: React.Dispatch<React.SetStateAction<Session | null>>;
  /** Fresh-session ledger from the sessions hook. The streaming layer
   *  graduates the active session OFF the ledger on send. */
  localFreshSessions: React.MutableRefObject<Set<string>>;
  /** Naming hook side effect — fires on the 1st, 10th, 20th… exchanges. */
  autoRenameFromExchange: (sessionId: string, userMsg: string, agentMsg: string) => Promise<void>;
  /** Surface stream failures into the chat error banner. */
  onError: (message: string | null) => void;
}

export interface UseChatStream {
  /** Visible message list — committed events + in-flight bubble for the
   *  active session. Recomputed by an effect; consumers treat it as derived. */
  messages: ChatMessage[];
  isLoading: boolean;
  /** Open an SSE turn against the current session. `agentPrefix` is
   *  prepended to the text sent to the agent (e.g. an active-sources
   *  manifest) but NOT shown in the user's bubble. */
  sendMessage: (content: string, agentPrefix?: string) => Promise<void>;
}

export function useChatStream({
  selectedApp,
  userId,
  currentSession,
  supportsVisualization,
  setAllSessions,
  setCurrentSession,
  localFreshSessions,
  autoRenameFromExchange,
  onError,
}: UseChatStreamArgs): UseChatStream {
  const [inFlightStreams, setInFlightStreams] = useState<Record<string, InFlightStream>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Track the latest currentSession through a ref so the auto-rename + final
  // refetch don't have to re-render to see post-send updates.
  const currentSessionRef = useRef(currentSession);
  useEffect(() => { currentSessionRef.current = currentSession; }, [currentSession]);

  // Project committed events + the active in-flight stream into messages.
  useEffect(() => {
    setMessages(
      deriveMessages(
        currentSession,
        currentSession ? inFlightStreams[currentSession.id] : undefined,
        supportsVisualization,
      ),
    );
  }, [currentSession, inFlightStreams, supportsVisualization]);

  const sendMessage = async (content: string, agentPrefix?: string): Promise<void> => {
    if (!currentSession || !content.trim() || !selectedApp) return;
    // Pin the origin session id at send-time so every stream-state write
    // targets the originating session regardless of where the user has
    // navigated since.
    const originSessionId = currentSession.id;

    setIsLoading(true);
    setNeuralThinking(true);
    onError(null);
    // This session has content now — pull it off the auto-cleanup ledger.
    localFreshSessions.current.delete(originSessionId);

    const userMessageId = `user-${Date.now()}`;
    const streamingId = `streaming-${Date.now()}`;
    const startedAt = Date.now();

    // Snapshot the pre-send agent-message count for auto-rename triggers.
    const AUTO_RENAME_EVERY = 10;
    const agentMsgCountBefore = messages.filter((m) => m.author !== 'user').length;
    const newAgentCount = agentMsgCountBefore + 1;
    const shouldAutoRename = newAgentCount === 1 || newAgentCount % AUTO_RENAME_EVERY === 0;

    // Seed the in-flight stream. The projection effect re-derives messages
    // from this immediately.
    setInFlightStreams((prev) => ({
      ...prev,
      [originSessionId]: {
        userMessageId,
        userContent: content.trim(),
        streamingId,
        accumulated: '',
        agentAuthor: 'agent',
        working: '',
        uiKind: undefined,
        toolCalls: [],
        startedAt,
      },
    }));

    /** Patch the in-flight stream in place. No-op if the entry was already
     *  removed — leave the prev value unchanged so React skips a re-render. */
    const patchStream = (patch: Partial<InFlightStream>) => {
      setInFlightStreams((prev) => {
        const cur = prev[originSessionId];
        if (!cur) return prev;
        return { ...prev, [originSessionId]: { ...cur, ...patch } };
      });
    };

    try {
      const agentText = agentPrefix
        ? `${agentPrefix}\n\n${content.trim()}`
        : content.trim();
      const request: AgentRunRequest = {
        appName: selectedApp,
        userId,
        sessionId: currentSession.id,
        newMessage: { parts: [{ text: agentText }], role: 'user' },
        streaming: true,
      };

      let accumulated = '';
      let agentAuthor = 'agent';
      let finalEventId: string | null = null;
      // Reset accumulation on subagent transitions (root → worker → formatter).
      let lastTextAuthor: string | null = null;
      let working = '';
      let uiKind: 'chart' | 'choices' | 'filters' | undefined;
      const toolCalls: ToolCall[] = [];
      // Safety net: a subagent's UI block captured during the stream in case
      // the root agent paraphrases its envelope.
      let fallbackUi: UIBlock[] | undefined;

      for await (const event of adkApi.sendMessageSSE(request)) {
        if (event.author && event.author !== 'user') agentAuthor = event.author;

        const next = phaseFromEvent(event);
        if (next) {
          if (next.working) working = next.working;
          if (next.uiKind) uiKind = next.uiKind;
        }
        toolCalls.push(...extractToolCalls(event));

        const textPart = event.content?.parts?.find((p) => p.text);
        if (textPart?.text) {
          if (event.author && event.author !== lastTextAuthor) {
            accumulated = '';
            lastTextAuthor = event.author;
          }
          if (event.partial === true) {
            accumulated += textPart.text;
          } else {
            accumulated = textPart.text;
            finalEventId = event.id;
            // Subagent emitted its envelope as a standalone text event —
            // capture its UI as a fallback in case the root drops it.
            if (
              supportsVisualization &&
              event.author &&
              event.author !== 'user' &&
              event.author !== 'MediaPerformanceAgent'
            ) {
              const subParsed = parseAgentResponse(textPart.text);
              if (subParsed.ui?.length) fallbackUi = subParsed.ui;
            }
          }
        }

        // ADK's AgentTool wraps a subagent's output into the tool response
        // instead of streaming it as its own text. Pull that envelope out so
        // a Choices / Vega UI block reaches the bubble even when the root
        // emits no text after the tool call.
        if (supportsVisualization) {
          for (const part of event.content?.parts ?? []) {
            const fr = part.functionResponse as { response?: unknown } | undefined;
            const resp = fr?.response;
            if (!resp || typeof resp !== 'object') continue;
            const result = (resp as Record<string, unknown>).result;
            if (typeof result !== 'string') continue;
            const subParsed = parseAgentResponse(result);
            if (subParsed.ui?.length) fallbackUi = subParsed.ui;
            if (!accumulated.trim() && subParsed.content) {
              accumulated = subParsed.content;
            }
          }
        }

        patchStream({ accumulated, agentAuthor, working, uiKind, toolCalls: [...toolCalls], fallbackUi });

        if (event.turnComplete) break;
      }

      // Parse the completed response.
      const parsed = supportsVisualization
        ? parseAgentResponse(accumulated)
        : { content: accumulated, ui: undefined };
      // Final safety net: a malformed envelope that fell through the parser
      // — extract only the text via the streaming projector so a user never
      // sees raw JSON. Hitting this branch means parseAgentResponse couldn't
      // recognise the agent's output — log so a regression is visible.
      const looksLikeEnvelope =
        supportsVisualization &&
        /^\s*\{[\s\S]*"text"\s*:/.test(parsed.content);
      if (looksLikeEnvelope) {
        console.warn(
          '[useChatStream] envelope parser fell through to text; agent likely returned a malformed JSON envelope',
          { sample: parsed.content.slice(0, 200) },
        );
        parsed.content = streamingDisplayText(parsed.content);
      }
      if (!parsed.ui?.length && fallbackUi?.length) {
        parsed.ui = fallbackUi;
      }
      const finalText = parsed.content.trim() || (parsed.ui?.length ? '' : FALLBACK_REPLY);

      // Snapshot the parsed reply onto the in-flight stream BEFORE the
      // refetch. Even if the session refetch is slow / fails / races ADK's
      // event persistence, the projection still renders this snapshot.
      const dedupedTools = toolCalls.length ? dedupeToolCalls(toolCalls) : undefined;
      patchStream({
        completed: {
          content: finalText,
          ui: parsed.ui,
          eventId: finalEventId,
          toolCalls: dedupedTools,
        },
      });

      // Refetch the session — by now ADK has usually persisted the reply.
      let updatedSession: Session | null = null;
      try {
        updatedSession = await adkApi.getSession(selectedApp, userId, originSessionId);
      } catch (err) {
        console.warn(
          '[useChatStream] session refetch failed; in-flight snapshot is still visible',
          originSessionId,
          err,
        );
      }
      if (updatedSession) {
        setAllSessions((prev) =>
          prev.map((s) => (s.id === originSessionId ? updatedSession! : s)),
        );
        if (currentSessionRef.current?.id === originSessionId) {
          setCurrentSession(updatedSession);
        }
        const hasAgentEvent =
          !!finalEventId &&
          updatedSession.events.some((e) => e.id === finalEventId);
        if (hasAgentEvent) {
          setInFlightStreams((prev) => {
            const next = { ...prev };
            delete next[originSessionId];
            return next;
          });
        }
        // Else: the refetch raced persistence. Leave the `completed` snapshot
        // in place — the user sees the reply; a follow-up message triggers
        // another refetch that picks up the persisted event.
      }

      if (shouldAutoRename) {
        await autoRenameFromExchange(originSessionId, content.trim(), parsed.content);
        // Nudge the session list so the sidebar re-sorts with the new title.
        setAllSessions((prev) => prev.map((s) => s.id === originSessionId ? { ...s } : s));
      }
    } catch (err) {
      console.error('[useChatStream.sendMessage] stream failed for session', originSessionId, err);
      const msg = err instanceof Error ? err.message : '';
      let fallback = FALLBACK_REPLY;
      if (/\b429\b|RESOURCE_EXHAUSTED|Too Many/i.test(msg)) {
        fallback =
          'The model is rate-limiting requests right now (Vertex AI quota). ' +
          'Wait a minute and try again — your message will still be here.';
      } else if (/\b404\b/.test(msg)) {
        fallback =
          "Your chat session was lost (404). Please click 'New chat' to start a fresh session.";
      } else if (msg) {
        fallback = `${FALLBACK_REPLY}\n\n_Error: ${msg.slice(0, 200)}_`;
      }
      // Mark the in-flight stream as failed — the projection renders the
      // bubble as a non-streaming final message regardless of which session
      // the user is viewing.
      patchStream({ failed: fallback, working: '', uiKind: undefined });
    } finally {
      // The thinking pulse + isLoading are GLOBAL to the chat surface.
      setIsLoading(false);
      setNeuralThinking(false);
    }
  };

  return { messages, isLoading, sendMessage };
}
