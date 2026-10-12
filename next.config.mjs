/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { dev }) {
    // Keep development bundles compatible with the same strict script-src as production.
    if (dev) config.devtool = "source-map";
    return config;
  },
};

export default nextConfig;
