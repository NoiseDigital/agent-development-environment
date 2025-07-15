'use client';

import { useState, useEffect } from 'react';
import { adkApi, Session, Event, AgentRunRequest } from '../lib/adk-api';

interface ChatMessage {
  id: string;
  content: string;
  author: string;
  timestamp: number;
  isStreaming?: boolean;
}

// Helper function to convert ADK timestamp to JavaScript timestamp
const normalizeTimestamp = (timestamp: number | string): number => {
  let normalizedTimestamp = timestamp;
  
  // If timestamp is a string, try to parse it
  if (typeof normalizedTimestamp === 'string') {
    normalizedTimestamp = new Date(normalizedTimestamp).getTime();
  }
  
  // If timestamp seems to be in seconds instead of milliseconds (Unix timestamp)
  if (normalizedTimestamp < 1000000000000) { // Less than year 2001 in milliseconds
    normalizedTimestamp = normalizedTimestamp * 1000;
  }
  
  // Fallback to current time if timestamp is invalid
  if (!normalizedTimestamp || isNaN(normalizedTimestamp) || normalizedTimestamp <= 0) {
    console.warn('Invalid timestamp detected, using current time:', timestamp);
    normalizedTimestamp = Date.now();
  }
  
  return normalizedTimestamp;
};

// Helper function to convert ADK events to chat messages
const eventsToMessages = (events: Event[]): ChatMessage[] => {
  return events
    .filter(event => event.content?.parts?.some(part => part.text))
    .map(event => {
      // Debug logging to see what we're getting
      console.log('Event timestamp:', event.timestamp, 'Type:', typeof event.timestamp);
      
      return {
        id: event.id,
        content: event.content?.parts?.find(part => part.text)?.text || '',
        author: event.author,
        timestamp: normalizeTimestamp(event.timestamp),
      };
    });
};

// Replace with auth to get userId
export function useChat(userId: string = 'user-1') {
  const [availableApps, setAvailableApps] = useState<string[]>([]);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingApps, setIsLoadingApps] = useState(true);

  // Load available apps on mount  
  useEffect(() => {
    const loadApps = async () => {
      try {
        setIsLoadingApps(true);
        console.log('Fetching available apps from ADK server...');
        const apps = await adkApi.listApps();
        console.log('Available apps:', apps);
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

    try {
      // Add user message immediately to UI
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        content: content.trim(),
        author: 'user',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMessage]);

      // Prepare request for ADK API
      const request: AgentRunRequest = {
        appName: selectedApp,
        userId,
        sessionId: currentSession.id,
        newMessage: {
          parts: [{ text: content.trim() }],
          role: 'user'
        },
        streaming: false
      };

      // Send message to ADK
      await adkApi.sendMessage(request);
      
      // Refresh the session to get all events
      const updatedSession = await adkApi.getSession(selectedApp, userId, currentSession.id);
      setCurrentSession(updatedSession);

    } catch (err) {
      setError(`Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}`);
      
      // Remove the user message if sending failed
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
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
    sendMessage,
    createNewSession,
    selectSession,
    deleteSession,
    refreshSessions: loadSessions,
    refreshApps: loadAvailableApps,
  };
}
