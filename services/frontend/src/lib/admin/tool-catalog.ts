// Client for the MCP toolbox query catalog. A tool call carries only a name +
// args — never the SQL — so this pairs them with the statement from tools.yaml
// to reconstruct the query that ran. Admin-facing; see ToolQueries.

import { apiRequest } from '../api/http';

const BASE_URL = process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8000';

export interface CatalogParam {
  name: string;
  default?: unknown;
}

export interface CatalogEntry {
  statement: string;
  params: CatalogParam[];
}

export type ToolCatalog = Record<string, CatalogEntry>;

// The catalog is static per deploy — fetch it once and reuse the promise.
// A failed fetch (agent still starting up) clears the cache so the next call
// retries, rather than getting stuck with an empty catalog.
let catalogPromise: Promise<ToolCatalog> | null = null;

export function getToolCatalog(): Promise<ToolCatalog> {
  if (!catalogPromise) {
    catalogPromise = apiRequest<{ tools: ToolCatalog }>(`${BASE_URL}/api/tools/catalog`)
      .then((d) => {
        const tools = d.tools ?? {};
        // An empty catalog means the agent answered before its config mount was
        // ready — don't cache it, so the next call retries.
        if (Object.keys(tools).length === 0) catalogPromise = null;
        return tools;
      })
      .catch((err) => {
        catalogPromise = null;
        throw err;
      });
  }
  return catalogPromise;
}

/** A SQL literal for display — strings quoted/escaped, numbers raw, null → NULL. */
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Reconstruct the SQL a tool call executed: the statement from tools.yaml with
 * every `@param` substituted by the call's argument — or the parameter's
 * default when the agent omitted it, matching what genai-toolbox binds.
 */
export function resolveSql(entry: CatalogEntry, args: Record<string, unknown>): string {
  let sql = entry.statement;
  // Longest parameter names first so `@date` cannot clobber `@date_from`.
  const params = [...entry.params].sort((a, b) => b.name.length - a.name.length);
  for (const p of params) {
    const value = Object.prototype.hasOwnProperty.call(args, p.name)
      ? args[p.name]
      : p.default;
    sql = sql.split(`@${p.name}`).join(sqlLiteral(value));
  }
  // Drop the leading header-comment block — dev documentation, not the query.
  const lines = sql.split('\n');
  let start = 0;
  while (start < lines.length) {
    const trimmed = lines[start].trim();
    if (trimmed === '' || trimmed.startsWith('--')) start++;
    else break;
  }
  return lines.slice(start).join('\n').trim();
}
