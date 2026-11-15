import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@campus/core", "@campus/db"],
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
