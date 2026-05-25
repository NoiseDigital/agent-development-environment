// API client for ADK server
import { getAgentEndpoints } from '../config/agent-config';

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

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${endpoint.url}/list-apps`);
        if (response.ok) {
          const apps = await response.json();
          apps.forEach((app: string) => allApps.add(app));
        } else {
          console.warn(`Failed to get apps from ${endpoint.url}: ${response.status}`);
        }
      } catch (error) {
        console.warn(`Error checking ${endpoint.url}:`, error);
      }
    }

    return Array.from(allApps);
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

  async *sendMessageSSE(request: AgentRunRequest): AsyncGenerator<Event, void, unknown> {
    const baseUrl = this.getBaseUrl(request.appName);
    const response = await fetch(`${baseUrl}/run_sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, streaming: true }),
    });

    if (!response.ok) throw new Error(`SSE request failed: ${response.status}`);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;
          try {
            yield JSON.parse(data) as Event;
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** One-shot ADK agent call: ephemeral session → send → final text → delete.
   *  Used for non-conversational agents (insights, naming) so they share the
   *  same ADK + ADC auth path as the chat agents. */
  async runOneShot(
    appName: string,
    userId: string,
    text: string,
  ): Promise<string> {
    const baseUrl = this.getBaseUrl(appName);
    const sessionId = `oneshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const createRes = await fetch(
      `${baseUrl}/apps/${appName}/users/${userId}/sessions/${sessionId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: {}, events: [] }),
      },
    );
    if (!createRes.ok) {
      throw new Error(`one-shot session create failed: ${createRes.status}`);
    }

    try {
      const events = await this.sendMessage({
        appName,
        userId,
        sessionId,
        newMessage: { parts: [{ text }], role: 'user' },
      });

      const finalEvent = [...events].reverse().find(
        (e) => e.author && e.author !== 'user' && e.partial !== true && e.content?.parts?.some((p) => p.text),
      );
      const finalText = finalEvent?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim() ?? '';
      return finalText;
    } finally {
      this.deleteSession(appName, userId, sessionId).catch(() => {});
    }
  }
}

export const adkApi = new ADKApiClient();
