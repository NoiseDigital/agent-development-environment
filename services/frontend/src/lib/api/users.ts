// Admin user-management API — the gateway's /api/v1/users endpoints. Admin-only
// server-side (require_role("admin")); the UI hides it for non-admins too.
import { gatewayBase } from "./gateway";
import { apiRequest, postJson } from "./http";

const base = () => `${gatewayBase()}/api/v1/users`;

export type Role = "admin" | "member" | "viewer";

export interface UserRecord {
  id: string;
  uid: string | null;
  email: string;
  display_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_seen_at: string | null;
}

export const usersApi = {
  /** Every directory row. */
  list: () =>
    apiRequest<{ users: UserRecord[] }>(base()).then((d) => d.users ?? []),

  /** Invite (or re-activate) a user by email. */
  invite: (email: string, role: Role) =>
    postJson<UserRecord>(base(), { email, role }),

  /** Change a user's role and/or active state. */
  update: (id: string, patch: { role?: Role; is_active?: boolean }) =>
    apiRequest<UserRecord>(`${base()}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  /** Remove a directory row (revokes access). */
  remove: (id: string) =>
    apiRequest<void>(`${base()}/${id}`, { method: "DELETE" }),
};
