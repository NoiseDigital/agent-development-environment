// Client for the data sources API exposed by the agent service.
// Uploads are registered; BigQuery is a live catalog that is browsed, not registered.

import type { Upload, BigQueryTableRef } from '../types/source';
import { apiRequest } from './http';

const BASE_URL = process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8000';

export const sourcesApi = {
  // ── Uploads ──────────────────────────────────────────────────────────────

  async listUploads(userId = 'user-1'): Promise<Upload[]> {
    const data = await apiRequest<{ sources: Upload[] }>(
      `${BASE_URL}/api/sources?user_id=${encodeURIComponent(userId)}`,
    );
    return data.sources;
  },

  upload(file: File, userId = 'user-1'): Promise<Upload> {
    const form = new FormData();
    form.append('file', file);
    form.append('user_id', userId);
    return apiRequest<Upload>(`${BASE_URL}/api/sources/upload`, { method: 'POST', body: form });
  },

  async removeUpload(id: string): Promise<void> {
    await apiRequest<unknown>(`${BASE_URL}/api/sources/${id}`, { method: 'DELETE' });
  },

  // ── BigQuery catalog ─────────────────────────────────────────────────────

  async bigQueryDatasets(): Promise<string[]> {
    const data = await apiRequest<{ datasets: string[] }>(`${BASE_URL}/api/bigquery/datasets`);
    return data.datasets;
  },

  async bigQueryTables(dataset: string): Promise<BigQueryTableRef[]> {
    const data = await apiRequest<{ tables: BigQueryTableRef[] }>(
      `${BASE_URL}/api/bigquery/tables?dataset=${encodeURIComponent(dataset)}`,
    );
    return data.tables;
  },
};
