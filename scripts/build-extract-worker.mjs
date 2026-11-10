// Bundles the document extractors (lib/documents/extract) into one CommonJS file
// for workers/extract-worker.mjs. Without it, every extraction worker loads tsx and
// compiles the TypeScript again, once per file. Packages stay external, loaded from
// node_modules as before. CommonJS matches how tsx compiled these files.
// esbuild comes with tsx, which is a runtime dependency.
import { build } from "esbuild"

await build({
  entryPoints: ["lib/documents/extract/index.ts"],
  outfile: "workers/extract-bundle.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  packages: "external",
  logLevel: "warning",
})
