// Noise tenant — the client registry seed (mirrors the Postgres `clients`
// table) plus the known client codes. The shared facade (@/data/clients) and
// @/data/client-codes read these for the active tenant via the @tenant-content
// build alias. When more clients land, each needs its OWN live dataset — adding
// an entry without that wiring re-introduces the mock pattern we deleted.
import type { Client } from "@/data/media-model";

export const clients: Client[] = [
  { id: "noi", name: "Noise", initials: "NOI", accentColor: "#000000", logoPath: "/noise/noise_N.PNG" },
];

// Canonical short codes (uppercased client initials) — the URL-safe handles in
// /dashboards/<CODE> and /plan/<CODE>. `as const` so the type narrows to a union.
export const KNOWN_CLIENT_CODES = ["NOI"] as const;
