'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { clientDashboards, dashboardFromSpec, type Dashboard } from '../../../data/dashboards';
import { loadUserDashboards } from '../../../lib/dashboards/user-dashboards';
import DashboardDetail from '../../../components/dashboards/DashboardDetail';

// Per-dashboard route — every dashboard has its own URL (/dashboards/<id>).
// A code-defined dashboard resolves synchronously; a user-created one is loaded
// from its stored spec after mount.
export default function DashboardPage() {
  const params = useParams<{ dashboardId: string }>();
  const router = useRouter();

  const [dashboard, setDashboard] = useState<Dashboard | null | undefined>(
    () => clientDashboards.find((d) => d.id === params.dashboardId),
  );

  useEffect(() => {
    if (dashboard !== undefined) return;
    const spec = loadUserDashboards().find((s) => s.id === params.dashboardId);
    setDashboard(spec ? dashboardFromSpec(spec) : null);
  }, [params.dashboardId, dashboard]);

  if (dashboard === undefined) {
    return <div className="h-full bg-canvas" />;
  }

  if (dashboard === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-canvas text-center">
        <p className="text-sm text-subtle">Dashboard not found.</p>
        <button
          type="button"
          onClick={() => router.push('/dashboards')}
          className="mt-3 text-xs font-medium text-accent-400 transition-colors hover:text-accent-300"
        >
          ← Back to dashboards
        </button>
      </div>
    );
  }

  return <DashboardDetail dashboard={dashboard} onBack={() => router.push('/dashboards')} />;
}
