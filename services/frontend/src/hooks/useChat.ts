'use client';

import { useState, useEffect } from 'react';
import { adkApi, Session, AgentRunRequest } from '../lib/adk-api';
import { ChartData } from '../types/chart';
import type { AgentJsonResponse } from '../types/agent-response';

interface ChatMessage {
  id: string;
  content: string;
  author: string;
  timestamp: number;
  isStreaming?: boolean;
  charts?: ChartData[];
}

// ── Timestamp normalisation ──────────────────────────────────────────────────

const normalizeTimestamp = (timestamp: number | string): number => {
  let ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (ts < 1_000_000_000_000) ts *= 1000; // seconds → ms
  if (!ts || isNaN(ts) || ts <= 0) ts = Date.now();
  return ts;
};

// ── Session name persistence (localStorage) ──────────────────────────────────

const NAMES_KEY = 'agent-platform-session-names';

const loadStoredNames = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(NAMES_KEY) ?? '{}'); } catch { return {}; }
};

const persistName = (sessionId: string, name: string) => {
  try {
    const names = loadStoredNames();
    names[sessionId] = name;
    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
  } catch { /* ignore */ }
};

// ── Agent JSON response parser ───────────────────────────────────────────────
const parseAgentResponse = (text: string): { content: string; charts?: ChartData[] } => {
  try {
    // Clean up the text by removing markdown code block formatting
    let cleanText = text.trim();
    
    // Remove outer ```json at the beginning and ``` at the end if present
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    } else {
      // The LLM sometimes wraps the JSON in prose text — extract the embedded code block.
      const embedded = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
      if (embedded) {
        cleanText = embedded[1];
      }
    }
    
    // Try to parse as JSON
    const parsed: AgentJsonResponse = JSON.parse(cleanText);
    
    // Check if it has the expected structure
    if (parsed && typeof parsed === 'object') {
      // Handle the new format: { text: "...", visualization: {...} }
      if (parsed.text !== undefined) {
        let textContent = parsed.text;
        
        // If the text field itself contains JSON with backticks, clean it up
        if (typeof textContent === 'string' && textContent.includes('```json')) {
          // Remove nested JSON backticks from the text content
          textContent = textContent.replace(/```json\s*/, '').replace(/\s*```$/, '');
          
          // Try to parse the nested JSON if it exists
          try {
            const nestedParsed = JSON.parse(textContent);
            if (nestedParsed && typeof nestedParsed === 'object' && nestedParsed.text !== undefined) {
              // Use the nested structure instead
              const result: { content: string; charts?: ChartData[] } = {
                content: nestedParsed.text
              };
              
              // Check for visualization data in nested structure
              if (nestedParsed.visualization) {
                if (!Array.isArray(nestedParsed.visualization) && nestedParsed.visualization.type && nestedParsed.visualization.data) {
                  result.charts = [nestedParsed.visualization as ChartData];
                } else if (Array.isArray(nestedParsed.visualization)) {
                  result.charts = nestedParsed.visualization as ChartData[];
                }
              }
              
              return result;
            }
          } catch (nestedError) {
            console.log('Failed to parse nested JSON, using text as-is:', nestedError);
            // Fall through to use the text as-is
          }
        }
        
        const result: { content: string; charts?: ChartData[] } = {
          content: textContent
        };
        
        // Check for visualization data
        if (parsed.visualization) {
          // Handle single chart
          if (!Array.isArray(parsed.visualization) && parsed.visualization.type && parsed.visualization.data) {
            result.charts = [parsed.visualization as ChartData];
          }
          // Handle multiple charts
          else if (Array.isArray(parsed.visualization)) {
            result.charts = parsed.visualization as ChartData[];
          }
        }
        
        return result;
      }
    }
  } catch (error) {
    // If parsing fails, treat as plain text
    console.log('Response is not JSON, treating as plain text:', error);
  }
  
  // Fallback: treat as plain text
  return { content: text };
};

// Helper function to convert ADK events to chat messages
const eventsToMessages = (events: Event[]): ChatMessage[] => {
  return events
    .filter(event => event.content?.parts?.some(part => part.text))
    .map(event => {
      const part = event.content?.parts?.find(part => part.text);
      const rawText = part?.text || '';
      const parsedResponse = parseAgentResponse(rawText);
      return {
        id: event.id,
        content: parsedResponse.content,
        author: event.author,
        timestamp: normalizeTimestamp(event.timestamp),
        charts: parsedResponse.charts,
      };
    });
};

// Replace with auth to get userId
export function useChat(initialApp?: string, userId: string = 'user-1') {
  const [availableApps, setAvailableApps] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(initialApp ?? null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});

  // Load stored session names from localStorage on mount
  useEffect(() => {
    setSessionNames(loadStoredNames());
  }, []);

  const saveSessionName = (sessionId: string, name: string) => {
    persistName(sessionId, name);
    setSessionNames(prev => ({ ...prev, [sessionId]: name }));
  };

  // Load available apps on mount
  useEffect(() => {
    const loadApps = async () => {
      try {
        setIsLoadingApps(true);
        const apps = await adkApi.listApps();
        setAvailableApps(apps);
      } catch (err) {
        console.error('Failed to load apps:', err);
        setError(`Failed to load available apps: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoadingApps(false);
      }
    };
    loadApps();
  }, []);

  // Load sessions when app is selected
  useEffect(() => {
    const loadSessionsForApp = async () => {
      if (!selectedApp) return;
      
      try {
        console.log(`Loading sessions for app: ${selectedApp}`);
        const sessionList = await adkApi.listSessions(selectedApp, userId);
        console.log('Sessions loaded:', sessionList);
        setSessions(sessionList);
        
        // If no current session, select the first one or create a new one
        if (!currentSession && sessionList.length === 0) {
          // Don't auto-create session, let user do it manually
        } else if (!currentSession && sessionList.length > 0) {
          setCurrentSession(sessionList[0]);
        }
      } catch (err) {
        console.error('Failed to load sessions:', err);
        setError(`Failed to load sessions: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    loadSessionsForApp();
  }, [selectedApp, userId, currentSession]);

  // Update messages when current session changes
  useEffect(() => {
    if (currentSession) {
      const chatMessages = eventsToMessages(currentSession.events);
      setMessages(chatMessages);
    }
  }, [currentSession]);

  const loadAvailableApps = async () => {
    try {
      setIsLoadingApps(true);
      console.log('Fetching available apps from ADK server...');
      const apps = await adkApi.listApps();
      console.log('Available apps:', apps);
      setAvailableApps(apps);
      
      // Auto-select the first app if available
      if (apps.length > 0 && !selectedApp) {
        setSelectedApp(apps[0]);
      }
    } catch (err) {
      console.error('Failed to load apps:', err);
      setError(`Failed to load available apps: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingApps(false);
    }
  };

  const loadSessions = async () => {
    if (!selectedApp) return;
    
    try {
      console.log(`Loading sessions for app: ${selectedApp}`);
      const sessionList = await adkApi.listSessions(selectedApp, userId);
      console.log('Sessions loaded:', sessionList);
      setSessions(sessionList);
      
      // If no current session, select the first one or create a new one
      if (!currentSession && sessionList.length === 0) {
        // Don't auto-create session, let user do it manually
      } else if (!currentSession && sessionList.length > 0) {
        setCurrentSession(sessionList[0]);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setError(`Failed to load sessions: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const createNewSession = async () => {
    if (!selectedApp) return;
    
    try {
      const sessionId = `session-${Date.now()}`;
      const newSession = await adkApi.createSession(selectedApp, userId, sessionId);
      setSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      setMessages([]);
      setError(null);
    } catch (err) {
      setError(`Failed to create session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const sendMessage = async (content: string) => {
    if (!currentSession || !content.trim() || !selectedApp) return;

    setIsLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      content: content.trim(),
      author: 'user',
      timestamp: Date.now(),
    };

    const streamingId = `streaming-${Date.now()}`;
    const streamingPlaceholder: ChatMessage = {
      id: streamingId,
      content: '',
      author: 'agent',
      timestamp: Date.now(),
      isStreaming: true,
    };

    // Capture whether this is the first exchange (for auto-naming)
    const isFirstMessage = messages.filter(m => m.author !== 'user').length === 0;

    setMessages(prev => [...prev, userMessage, streamingPlaceholder]);

    try {
      const request: AgentRunRequest = {
        appName: selectedApp,
        userId,
        sessionId: currentSession.id,
        newMessage: { parts: [{ text: content.trim() }], role: 'user' },
        streaming: true,
      };

      let accumulated = '';
      let agentAuthor = 'agent';

      for await (const event of adkApi.sendMessageSSE(request)) {
        if (event.author && event.author !== 'user') agentAuthor = event.author;
        const textPart = event.content?.parts?.find(p => p.text);
        if (textPart?.text) {
          accumulated += textPart.text;
          setMessages(prev =>
            prev.map(m =>
              m.id === streamingId ? { ...m, content: accumulated, author: agentAuthor } : m
            )
          );
        }
        if (event.turnComplete) break;
      }

      // Parse the completed response for charts / JSON wrapper
      const parsed = parseAgentResponse(accumulated);
      setMessages(prev =>
        prev.map(m =>
          m.id === streamingId
            ? { ...m, content: parsed.content, charts: parsed.charts, isStreaming: false }
            : m
        )
      );

      // Sync session state
      const updatedSession = await adkApi.getSession(selectedApp, userId, currentSession.id);
      setCurrentSession(updatedSession);

      // Auto-name the session after the first exchange if it has no stored name
      if (isFirstMessage && !sessionNames[currentSession.id]) {
        try {
          const name = await adkApi.nameSession(selectedApp, [
            { content: content.trim(), role: 'user' },
            { content: parsed.content.slice(0, 300), role: 'model' },
          ]);
          saveSessionName(currentSession.id, name);
          setSessions(prev =>
            prev.map(s => s.id === currentSession.id ? { ...s } : s)
          );
        } catch { /* non-fatal */ }
      }

    } catch (err) {
      setError(`Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setMessages(prev => prev.filter(m => m.id !== streamingId && m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const renameSession = async (sessionId: string) => {
    if (!selectedApp) return;
    try {
      const session = sessions.find(s => s.id === sessionId);
      if (!session) return;
      const textEvents = session.events.filter(e => e.content?.parts?.some(p => p.text));
      const msgs = textEvents.slice(0, 8).map(e => ({
        content: e.content!.parts.find(p => p.text)!.text!.slice(0, 300),
        role: e.author === 'user' ? 'user' : 'model',
      }));
      if (msgs.length === 0) return;
      const name = await adkApi.nameSession(selectedApp, msgs);
      saveSessionName(sessionId, name);
    } catch (err) {
      setError(`Failed to rename session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const selectSession = async (sessionId: string) => {
    if (!selectedApp) return;
    
    try {
      const session = await adkApi.getSession(selectedApp, userId, sessionId);
      setCurrentSession(session);
      setError(null);
    } catch (err) {
      setError(`Failed to select session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!selectedApp) return;
    
    try {
      await adkApi.deleteSession(selectedApp, userId, sessionId);
      
      // Remove the session from the local list
      setSessions(prev => prev.filter(session => session.id !== sessionId));
      
      // If the deleted session was the current one, clear it
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        setMessages([]);
      }
      
      setError(null);
    } catch (err) {
      setError(`Failed to delete session: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return {
    availableApps,
    selectedApp,
    setSelectedApp,
    sessions,
    currentSession,
    messages,
    isLoading,
    isLoadingApps,
    error,
    sessionNames,
    sendMessage,
    createNewSession,
    selectSession,
    deleteSession,
    renameSession,
    saveSessionName,
    refreshSessions: loadSessions,
    refreshApps: loadAvailableApps,
  };
}
