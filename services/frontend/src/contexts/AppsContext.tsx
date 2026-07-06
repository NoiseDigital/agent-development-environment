'use client';

// Single source of truth for the available-apps list (ADK GET /list-apps).
//
// Mounted ONCE in AppChrome and polled every 15s for liveness, so the many
// consumers — every useChat instance (FloatingAssistant, the chat page, the
// analyze panel, the agents page) and the sidebar's online-dot — read from
// context instead of each firing their own /list-apps on every mount and
// navigation. That redundant fan-out was flooding /gw/list-apps many times a
// second; one provider collapses it to a single poll.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { adkApi } from '../lib/agent/adk-api';

interface AppsValue {
  /** Apps the ADK runtime reports as available/live. */
  apps: string[];
  isLoading: boolean;
  /** Force a re-fetch (e.g. after provisioning a new agent). */
  refresh: () => Promise<void>;
}

const AppsContext = createContext<AppsValue>({
  apps: [],
  isLoading: true,
  refresh: async () => {},
});

export function AppsProvider({ children }: { children: ReactNode }) {
  const [apps, setApps] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setApps(await adkApi.listApps());
    } catch {
      // Keep the last-known list — a transient gateway hiccup shouldn't blank
      // the agent picker.
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch once on mount, then poll for liveness (which agents are up).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const id = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <AppsContext.Provider value={{ apps, isLoading, refresh }}>
      {children}
    </AppsContext.Provider>
  );
}

export function useApps(): AppsValue {
  return useContext(AppsContext);
}
