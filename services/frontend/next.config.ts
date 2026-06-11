import type { NextConfig } from "next";

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
  serverExternalPackages: [],
  webpack: (config) => {
    // `canvas` is an optional native dependency of vega-canvas, used only for
    // server-side rendering. We render Vega client-side (SVG), so stub it out
    // to silence the "Can't resolve 'canvas'" build warning.
    config.resolve.fallback = { ...config.resolve.fallback, canvas: false };
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
