import type { NextConfig } from "next";
import { securityHeaderRules } from "./lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  // No "X-Powered-By: Next.js" — it only helps someone pick an exploit.
  poweredByHeader: false,
  async headers() {
    return securityHeaderRules(process.env.NODE_ENV === "development");
  },
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
