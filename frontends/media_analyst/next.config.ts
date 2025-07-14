import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable hot reload only on file save (not continuous polling)
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        // Remove polling - only watch for actual file changes
        poll: false,
        aggregateTimeout: 200, // Wait 200ms after file save
        ignored: /node_modules/, // Don't watch node_modules
      };
    }
    return config;
  },
  // External packages configuration
  serverExternalPackages: [],
};

export default nextConfig;
