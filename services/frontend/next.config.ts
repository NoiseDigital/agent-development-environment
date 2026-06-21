import path from "node:path";
import type { NextConfig } from "next";

// Tenant chosen at build (mirrors src/config/tenant.ts). The @tenant-content
// alias below resolves to ONLY this tenant's content dir, so a build never
// bundles another tenant's dashboards/plans/clients.
const TENANT = process.env.NEXT_PUBLIC_TENANT || "noise";

// Bundle analyzer is OFF unless ANALYZE=true. We `require()` it lazily so
// type-checking + dev builds on machines that haven't `npm install`d yet
// still work (the package is in devDependencies, not dependencies).
//
// To use:
//   docker compose exec frontend npm run analyze
//
// Drops two HTML reports (client.html, nodejs.html) into .next/analyze/ on
// completion.

const nextConfig: NextConfig = {
  // Isolated output dir for parallel/verification builds (so a build doesn't
  // clobber a running dev server's .next). Unset → default ".next".
  ...(process.env.NEXT_DISTDIR ? { distDir: process.env.NEXT_DISTDIR } : {}),
  // Self-contained server bundle for Cloud Run (.next/standalone → `node server.js`).
  output: "standalone",
  serverExternalPackages: [],
  webpack: (config, { webpack }) => {
    // `canvas` is an optional native dependency of vega-canvas, used only for
    // server-side rendering. We render Vega client-side (SVG), so stub it out
    // to silence the "Can't resolve 'canvas'" build warning.
    config.resolve.fallback = { ...config.resolve.fallback, canvas: false };
    // Per-tenant content: rewrite @tenant-content[/sub] → src/data/tenants/<active>/
    // BEFORE resolution, so this beats Next's tsconfig-paths plugin (which would
    // otherwise pin every build to the paths target). tsconfig paths still point
    // at noise — but only tsc/IDE use them, giving real per-tenant literal types
    // (e.g. ClientCode), while the bundle gets exactly the active tenant.
    const tenantDir = path.resolve(__dirname, "src/data/tenants", TENANT);
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^@tenant-content(\/.*)?$/,
        (resource: { request: string }) => {
          resource.request = resource.request.replace(/^@tenant-content/, tenantDir);
        },
      ),
    );
    return config;
  },
};

function maybeWithAnalyzer(cfg: NextConfig): NextConfig {
  if (process.env.ANALYZE !== "true") return cfg;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bundleAnalyzer = require("@next/bundle-analyzer");
  return bundleAnalyzer({ enabled: true, openAnalyzer: false })(cfg);
}

export default maybeWithAnalyzer(nextConfig);
