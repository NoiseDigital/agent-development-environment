// Drift guard for the @tenant-content alias. It's resolved in THREE places that
// must agree: next.config.ts (webpack NMRP → active tenant), tsconfig.json paths
// (tsc/IDE → noise), and vitest.config.ts (this test → noise). If any breaks,
// this import fails or the shape assertion trips — before it reaches a build.
import { describe, expect, it } from "vitest";
import * as content from "@tenant-content";
import { clients as clientsViaSubpath, KNOWN_CLIENT_CODES } from "@tenant-content/clients";

describe("@tenant-content alias", () => {
  it("exposes the full TenantContent surface as arrays", () => {
    expect(Array.isArray(content.clients)).toBe(true);
    expect(Array.isArray(content.clientDashboards)).toBe(true);
    expect(Array.isArray(content.clientPlans)).toBe(true);
    expect(Array.isArray(KNOWN_CLIENT_CODES)).toBe(true);
  });

  it("resolves the index and the /clients subpath to the same registry", () => {
    expect(content.clients).toEqual(clientsViaSubpath);
  });
});
