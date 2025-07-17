// API client for ADK server
import { getAgentEndpoints } from '../config/agentConfig';

// Agent endpoint configuration (imported from centralized config)
export interface AgentEndpoint {
  name: string;
  url: string;
  description?: string;
}

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
  private endpoints: Record<string, AgentEndpoint>;

  constructor(customEndpoints?: Record<string, AgentEndpoint>) {
    // Use centralized agent configuration as the base
    const defaultEndpoints = getAgentEndpoints();
    this.endpoints = { ...defaultEndpoints, ...customEndpoints };
  }

  // Helper method to get the base URL for an agent
  private getBaseUrl(agentName: string): string {
    const endpoint = this.endpoints[agentName];
    if (!endpoint) {
      console.warn(`No endpoint configured for agent: ${agentName}. Using first available endpoint.`);
      const firstEndpoint = Object.values(this.endpoints)[0];
      return firstEndpoint?.url || '';
    }
    return endpoint.url;
  }

  // Get available agent endpoints
  getAvailableAgents(): AgentEndpoint[] {
    return Object.values(this.endpoints);
  }

  // Add or update an agent endpoint
  addAgent(agentName: string, endpoint: AgentEndpoint): void {
    this.endpoints[agentName] = endpoint;
  }
  
  async listApps(): Promise<string[]> {
    // Query all configured endpoints to discover available apps
    const allApps = new Set<string>();
    const endpoints = Object.values(this.endpoints);
    
    console.log('Checking endpoints for available apps:', endpoints.map(e => e.url));
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Checking ${endpoint.url}/list-apps`);
        const response = await fetch(`${endpoint.url}/list-apps`);
        if (response.ok) {
          const apps = await response.json();
          console.log(`Apps from ${endpoint.url}:`, apps);
          apps.forEach((app: string) => allApps.add(app));
        } else {
          console.warn(`Failed to get apps from ${endpoint.url}: ${response.status}`);
        }
      } catch (error) {
        console.warn(`Error checking ${endpoint.url}:`, error);
      }
    }
    
    const result = Array.from(allApps);
    console.log('Final combined app list:', result);
    return result;
  }

  async createSession(appName: string, userId: string, sessionId?: string): Promise<Session> {
    const baseUrl = this.getBaseUrl(appName);
    const url = sessionId 
      ? `${baseUrl}/apps/${appName}/users/${userId}/sessions/${sessionId}`
      : `${baseUrl}/apps/${appName}/users/${userId}/sessions`;
    
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
    const baseUrl = this.getBaseUrl(appName);
    const response = await fetch(`${baseUrl}/apps/${appName}/users/${userId}/sessions/${sessionId}`);
    if (!response.ok) throw new Error('Failed to get session');
    return response.json();
  }

  async listSessions(appName: string, userId: string): Promise<Session[]> {
    const baseUrl = this.getBaseUrl(appName);
    const response = await fetch(`${baseUrl}/apps/${appName}/users/${userId}/sessions`);
    if (!response.ok) throw new Error('Failed to list sessions');
    return response.json();
  }

  async deleteSession(appName: string, userId: string, sessionId: string): Promise<void> {
    const baseUrl = this.getBaseUrl(appName);
    const response = await fetch(`${baseUrl}/apps/${appName}/users/${userId}/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete session');
  }

  async sendMessage(request: AgentRunRequest): Promise<Event[]> {
    const baseUrl = this.getBaseUrl(request.appName);
    const response = await fetch(`${baseUrl}/run`, {
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
    const baseUrl = this.getBaseUrl(request.appName);
    const streamingRequest = { ...request, streaming: true };
    
    const response = await fetch(`${baseUrl}/run_sse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(streamingRequest),
    });
    
    if (!response.ok) throw new Error('Failed to start streaming');
    
    // For SSE, we need to make a separate connection
    // This is a simplified approach - you might need to adjust based on your ADK server implementation
    const eventSource = new EventSource(`${baseUrl}/run_sse`);
    return eventSource;
  }
}

export const adkApi = new ADKApiClient();
