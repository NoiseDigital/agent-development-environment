// API client for ADK server
const API_BASE_URL = 'https://agent-a2a-orchestrator-192748761045.us-central1.run.app';

// API types based on the OpenAPI spec
export interface AgentRunRequest {
  appName: string;
  userId: string;
  sessionId: string;
  newMessage: {
    parts: Array<{
      text: string;
    }>;
    role?: string;
  };
  streaming?: boolean;
}

export interface Event {
  id: string;
  author: string;
  content?: {
    parts: Array<{
      text?: string;
      functionCall?: Record<string, unknown>;
      functionResponse?: Record<string, unknown>;
    }>;
    role?: string;
  };
  timestamp: number;
  turnComplete?: boolean;
  partial?: boolean;
}

export interface Session {
  id: string;
  appName: string;
  userId: string;
  state: Record<string, unknown>;
  events: Event[];
  lastUpdateTime: number;
}

// API functions
export class ADKApiClient {
  
  async listApps(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/list-apps`);
    if (!response.ok) throw new Error('Failed to list apps');
    return response.json();
  }

  async createSession(appName: string, userId: string, sessionId?: string): Promise<Session> {
    const url = sessionId 
      ? `${API_BASE_URL}/apps/${appName}/users/${userId}/sessions/${sessionId}`
      : `${API_BASE_URL}/apps/${appName}/users/${userId}/sessions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: {},
        events: []
      }),
    });
    
    if (!response.ok) throw new Error('Failed to create session');
    return response.json();
  }

  async getSession(appName: string, userId: string, sessionId: string): Promise<Session> {
    const response = await fetch(`${API_BASE_URL}/apps/${appName}/users/${userId}/sessions/${sessionId}`);
    if (!response.ok) throw new Error('Failed to get session');
    return response.json();
  }

  async listSessions(appName: string, userId: string): Promise<Session[]> {
    const response = await fetch(`${API_BASE_URL}/apps/${appName}/users/${userId}/sessions`);
    if (!response.ok) throw new Error('Failed to list sessions');
    return response.json();
  }

  async sendMessage(request: AgentRunRequest): Promise<Event[]> {
    const response = await fetch(`${API_BASE_URL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) throw new Error('Failed to send message');
    return response.json();
  }

  // Streaming version using Server-Sent Events
  async sendMessageStreaming(request: AgentRunRequest): Promise<EventSource> {
    const streamingRequest = { ...request, streaming: true };
    
    const response = await fetch(`${API_BASE_URL}/run_sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(streamingRequest),
    });
    
    if (!response.ok) throw new Error('Failed to start streaming');
    
    // For SSE, we need to make a separate connection
    // This is a simplified approach - you might need to adjust based on your ADK server implementation
    const eventSource = new EventSource(`${API_BASE_URL}/run_sse`);
    return eventSource;
  }
}

export const adkApi = new ADKApiClient();
