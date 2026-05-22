import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // External packages configuration
  serverExternalPackages: [],
  webpack: (config) => {
    // `canvas` is an optional native dependency of vega-canvas, used only for
    // server-side rendering. We render Vega client-side (SVG), so stub it out
    // to silence the "Can't resolve 'canvas'" build warning.
    config.resolve.fallback = { ...config.resolve.fallback, canvas: false };
    return config;
  },
};

export default nextConfig;
