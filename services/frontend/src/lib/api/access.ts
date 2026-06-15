// Access-rules API — the gateway's /api/v1/access-rules allowlist. Admin-only.
// Each rule grants access (+ a default role) to an email or a whole domain.
import { gatewayBase } from "./gateway";
import { apiRequest, postJson } from "./http";

const base = () => `${gatewayBase()}/api/v1/access-rules`;

export type Role = "admin" | "member" | "viewer";

export interface AccessRule {
  id: string;
  pattern: string; // 'jane@x.com' or '@x.com'
  kind: "email" | "domain";
  role: Role;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export const accessApi = {
  /** Every rule. */
  list: () =>
    apiRequest<{ rules: AccessRule[] }>(base()).then((d) => d.rules ?? []),

  /** Allow an email or a domain (`@example.com`). */
  add: (pattern: string, role: Role, note?: string) =>
    postJson<AccessRule>(base(), { pattern, role, note }),

  /** Change a rule's role and/or active state. */
  update: (id: string, patch: { role?: Role; is_active?: boolean }) =>
    apiRequest<AccessRule>(`${base()}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  /** Delete a rule. */
  remove: (id: string) =>
    apiRequest<void>(`${base()}/${id}`, { method: "DELETE" }),
};
