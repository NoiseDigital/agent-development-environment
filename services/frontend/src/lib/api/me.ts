// Current-user directory record from the gateway (GET /api/v1/me). The gateway
// upserts the row from the BFF-forwarded identity and returns the role.
import { gatewayBase } from "./gateway";
import { apiRequest } from "./http";

export interface MeRecord {
  uid: string;
  email: string | null;
  display_name: string | null;
  role: string;
}

export const meApi = {
  get: () => apiRequest<MeRecord>(`${gatewayBase()}/api/v1/me`),
};
