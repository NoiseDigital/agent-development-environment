'use client';

import { useState, useEffect } from 'react';
import { adkApi, Session, Event, AgentRunRequest } from '../lib/adk-api';
import { ChartData } from '../types/chart';
import type { AgentJsonResponse } from '../types/agent-response';

interface ChatMessage {
  id: string;
  content: string;
  author: string;
  timestamp: number;
  isStreaming?: boolean;
  charts?: ChartData[]; // Add charts to message interface
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

// Helper function to parse agent JSON response
const parseAgentResponse = (text: string): { content: string; charts?: ChartData[] } => {
  try {
    // Try to parse as JSON first
    const parsed: AgentJsonResponse = JSON.parse(text);
    
    // Check if it has the expected structure
    if (parsed && typeof parsed === 'object') {
      // Handle the new format: { text: "...", visualization: {...} }
      if (parsed.text !== undefined) {
        const result: { content: string; charts?: ChartData[] } = {
          content: parsed.text
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
      // Debug logging to see what we're getting
      console.log('Event timestamp:', event.timestamp, 'Type:', typeof event.timestamp);
      
      const part = event.content?.parts?.find(part => part.text);
      const rawText = part?.text || '';
      
      // Parse the agent's response (could be JSON or plain text)
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

      // DEMO MODE: Simulate agent returning JSON string responses
      // TODO: Remove this demo logic once the backend agent returns structured JSON responses
      // Demo mode: Check for chart keywords and add example responses
      const lowerContent = content.toLowerCase();
      let demoJsonResponse = null;
      
      // Check for trend/time-based queries first (most specific)
      if (lowerContent.includes('trend') || lowerContent.includes('over time') || lowerContent.includes('performance trend')) {
        demoJsonResponse = JSON.stringify({
          text: "Here's the media performance trend analysis you requested. The data shows interesting patterns in your campaign performance.",
          visualization: {
            type: 'line',
            title: 'Media Performance Trend',
            insight: 'Performance shows a steady upward trend with a significant spike in week 4, indicating successful campaign optimization.',
            data: [
              { name: 'Week 1', value: 2400 },
              { name: 'Week 2', value: 1398 },
              { name: 'Week 3', value: 9800 },
              { name: 'Week 4', value: 3908 },
              { name: 'Week 5', value: 4800 },
              { name: 'Week 6', value: 3800 }
            ]
          }
        });
      } 
      // Check for distribution/share queries
      else if (lowerContent.includes('distribution') || lowerContent.includes('share') || lowerContent.includes('audience')) {
        demoJsonResponse = JSON.stringify({
          text: "Here's the audience distribution analysis showing how your viewers are distributed across different platforms and devices.",
          visualization: {
            type: 'pie',
            title: 'Audience Distribution',
            insight: 'Mobile users dominate our audience at 45%, followed by desktop users. Tablet usage remains minimal.',
            data: [
              { name: 'Mobile', value: 45 },
              { name: 'Desktop', value: 35 },
              { name: 'Tablet', value: 8 },
              { name: 'Smart TV', value: 12 }
            ]
          }
        });
      } 
      // Check for comparison/breakdown queries (less specific, so checked last)
      else if (lowerContent.includes('compare') || lowerContent.includes('breakdown') || lowerContent.includes('categories')) {
        demoJsonResponse = JSON.stringify({
          text: "I've analyzed your media channels and created a comparison breakdown. Here are the key performance differences across channels.",
          visualization: {
            type: 'bar',
            title: 'Media Channel Performance',
            insight: 'Social media and video content are the top performers, while display ads show lower engagement rates.',
            data: [
              { name: 'Social Media', value: 4000 },
              { name: 'Video Content', value: 3000 },
              { name: 'Blog Posts', value: 2000 },
              { name: 'Email', value: 2780 },
              { name: 'Display Ads', value: 1890 }
            ]
          }
        });
      }

      if (demoJsonResponse) {
        // Simulate the agent response being processed by our parsing logic
        setTimeout(() => {
          const parsedResponse = parseAgentResponse(demoJsonResponse);
          const demoMessage: ChatMessage = {
            id: `agent-${Date.now()}`,
            content: parsedResponse.content,
            author: 'agent',
            timestamp: Date.now(),
            charts: parsedResponse.charts,
          };
          setMessages(prev => [...prev, demoMessage]);
          setIsLoading(false);
        }, 1500);
        return;
      }

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
