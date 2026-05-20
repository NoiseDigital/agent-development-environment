// Data sources for the analysis workflow.
//
// An *upload* is a file the platform stores and tracks (a `sources` row).
// A *BigQuery table* lives in BigQuery and is referenced live — never registered.
// A `SourceRef` is the unified, selectable descriptor handed to the stats tools.

export interface SourceMetadata {
  /** Column names — set for CSV uploads. */
  columns?: string[];
  /** Sheet names for Excel uploads. */
  sheet_names?: string[];
  /** Per-sheet column lists for Excel uploads. */
  sheets?: Record<string, string[]>;
  /** Present if schema inspection failed (non-fatal). */
  inspect_error?: string;
}

/** A registered uploaded file. */
export interface Upload {
  id: string;
  user_id: string;
  name: string;
  file_ext?: string | null;
  size_bytes?: number | null;
  metadata: SourceMetadata;
  created_at: string;
}

/** A BigQuery table in the live catalog. */
export interface BigQueryTableRef {
  dataset: string;
  table: string;
}

/** A selectable analysis source — an upload or a live BigQuery table. */
export type SourceRef =
  | { kind: 'upload'; id: string; name: string }
  | { kind: 'bigquery'; dataset: string; table: string };

/** Wire form handed to the stats tools / API. */
export function sourceUri(ref: SourceRef): string {
  return ref.kind === 'upload'
    ? `upload:${ref.id}`
    : `bigquery:${ref.dataset}.${ref.table}`;
}

/** Human-readable label. */
export function sourceLabel(ref: SourceRef): string {
  return ref.kind === 'upload' ? ref.name : `${ref.dataset}.${ref.table}`;
}

export function uploadToRef(upload: Upload): SourceRef {
  return { kind: 'upload', id: upload.id, name: upload.name };
}
