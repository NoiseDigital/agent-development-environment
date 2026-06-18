'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showNotification, setShowNotification] = useState(false);

  const baseUrl = process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8000';

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`${baseUrl}/auth/asana/status?user_id=user-1`);
        if (res.ok) {
          const data = await res.json();
          setIsConnected(data.connected);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, [baseUrl]);

  useEffect(() => {
    if (searchParams.get('asana') === 'connected') {
      setShowNotification(true);
      const timer = setTimeout(() => {
        setShowNotification(false);
        router.replace('/settings/integrations');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  const handleConnect = () => {
    window.location.href = `${baseUrl}/auth/asana/login?user_id=user-1`;
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.push('/')}
          className="mb-8 flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors duration-200 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Chat
        </button>

        {showNotification && (
          <div className="mb-6 p-4 bg-emerald-950/80 border border-emerald-800 rounded-xl flex items-center justify-between text-emerald-200 transition-all duration-300">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">Asana account connected successfully!</span>
            </div>
          </div>
        )}

        <div className="border-b border-zinc-800 pb-6 mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Integrations & Settings</h1>
          <p className="text-sm text-zinc-400 mt-2">Manage your connected third-party platforms and authorization tokens.</p>
        </div>

        <div className="grid gap-6">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 transition-all duration-300 hover:border-zinc-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-medium">Asana</h2>
                    {isLoading ? (
                      <span className="w-2 h-2 rounded-full bg-zinc-600 animate-pulse" />
                    ) : isConnected ? (
                      <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full">
                        Connected
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 text-xs font-semibold bg-zinc-900 text-zinc-400 border border-zinc-800 rounded-full">
                        Disconnected
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed max-w-xl">
                    Connect your Asana account to allow the Timesheet Agent to retrieve your assigned tasks and update project notes.
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                {isLoading ? (
                  <button disabled className="px-4 py-2 text-sm font-medium bg-zinc-900 text-zinc-500 rounded-xl border border-zinc-800 cursor-not-allowed">
                    Loading
                  </button>
                ) : isConnected ? (
                  <button
                    onClick={handleConnect}
                    className="px-4 py-2 text-sm font-medium bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all duration-200 cursor-pointer"
                  >
                    Reconnect Account
                  </button>
                ) : (
                  <button
                    onClick={handleConnect}
                    className="px-4 py-2 text-sm font-medium bg-white hover:bg-zinc-100 text-black rounded-xl transition-all duration-200 cursor-pointer"
                  >
                    Connect Account
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
