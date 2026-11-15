import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@campus/core", "@campus/db"],
};

export default nextConfig;
