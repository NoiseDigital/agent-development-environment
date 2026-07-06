// API client for ADK server. CRUD calls go through `apiRequest` so auth
// headers + FastAPI `detail`-aware error messages stay consistent with the
// rest of the platform's REST clients. The SSE generator stays on raw
// fetch — `apiRequest` reads `response.json()` and would consume the
// stream we need to iterate.
import { getAgentEndpoints } from '../../config/agent-config';
import { apiRequest } from '../api/http';

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

// list-apps is a near-static list. The cache + in-flight dedupe live at MODULE
// scope (not on the instance) so they're shared no matter how many ADKApiClient
// instances the bundler/HMR creates — a static list should never hit the
// network more than once per TTL.
let _appsCache: { apps: string[]; at: number } | null = null;
let _appsInflight: Promise<string[]> | null = null;
const APPS_TTL_MS = 10_000;

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
    if (_appsCache && Date.now() - _appsCache.at < APPS_TTL_MS) {
      return _appsCache.apps;
    }
    // Coalesce concurrent callers onto a single request.
    if (_appsInflight) return _appsInflight;

    _appsInflight = this.fetchApps()
      .then((apps) => {
        _appsCache = { apps, at: Date.now() };
        return apps;
      })
      .finally(() => {
        _appsInflight = null;
      });
    return _appsInflight;
  }

  private async fetchApps(): Promise<string[]> {
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
    return apiRequest<Session>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: {}, events: [] }),
    });
  }

  async getSession(appName: string, userId: string, sessionId: string): Promise<Session> {
    const baseUrl = this.getBaseUrl(appName);
    return apiRequest<Session>(`${baseUrl}/apps/${appName}/users/${userId}/sessions/${sessionId}`);
  }

  async listSessions(appName: string, userId: string): Promise<Session[]> {
    const baseUrl = this.getBaseUrl(appName);
    return apiRequest<Session[]>(`${baseUrl}/apps/${appName}/users/${userId}/sessions`);
  }

  async deleteSession(appName: string, userId: string, sessionId: string): Promise<void> {
    const baseUrl = this.getBaseUrl(appName);
    await apiRequest<unknown>(
      `${baseUrl}/apps/${appName}/users/${userId}/sessions/${sessionId}`,
      { method: 'DELETE' },
    );
  }

  async sendMessage(request: AgentRunRequest): Promise<Event[]> {
    const baseUrl = this.getBaseUrl(request.appName);
    return apiRequest<Event[]>(`${baseUrl}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
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
        const chunk = decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer, chunk);
        buffer = parsed.buffer;
        for (const event of parsed.events) yield event;
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
    const sessionId = `oneshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    // Reuse the consolidated session-create path — same auth headers,
    // same FastAPI-detail-aware error surfacing as every other CRUD call.
    await this.createSession(appName, userId, sessionId);

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

/** Parse one fetch-stream chunk into the events it carries, plus the
 *  trailing buffer (last unterminated line) for the next call.
 *
 *  ADK's `/run_sse` emits Server-Sent Events lines of the form
 *    data: {...JSON event...}\n
 *    data: [DONE]\n
 *  The fetch stream delivers arbitrary-size chunks — a single event JSON
 *  may be split across two chunks. We accumulate until we see a `\n`,
 *  then parse each completed `data: ...` line. Pure so SSE handling is
 *  unit-testable (no network) — the streamSSE generator just glues it
 *  to the fetch reader. */
export function parseSseChunk(
  carryBuffer: string,
  chunk: string,
): { events: Event[]; buffer: string } {
  const merged = carryBuffer + chunk;
  const lines = merged.split('\n');
  // Final element is the partial trailing line (or '' if the chunk ended
  // on a newline) — carry it into the next call.
  const buffer = lines.pop() ?? '';
  const events: Event[] = [];
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') continue;
    try {
      events.push(JSON.parse(data) as Event);
    } catch (err) {
      // Surface malformed lines instead of swallowing — a server-side
      // serialization regression should be visible in the console.
      console.warn('[adk-api] dropped malformed SSE line', { line, err });
    }
  }
  return { events, buffer };
}
