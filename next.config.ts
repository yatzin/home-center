import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Native addons and packages that spawn their own workers or read data files
  // from their package folder break when bundled; load them from node_modules.
  serverExternalPackages: [
    "officeparser",
    "unpdf",
    "word-extractor",
    "tesseract.js",
    "@tesseract.js-data/eng",
    "@napi-rs/canvas",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
  experimental: {
    globalNotFound: true,
  },
};

export default nextConfig;
