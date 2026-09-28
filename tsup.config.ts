// tsup.config.ts

import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

/**
 * Keep the replay recorder out of the core bundle. logger.ts loads it with
 * `import('./replay-recorder')`; this plugin leaves that import unbundled and
 * points it at the recorder's own output file (dist/replay-recorder.mjs|cjs),
 * so the recorder and rrweb are only downloaded when replay is enabled.
 */
const externalReplayRecorder: Plugin = {
  name: "external-replay-recorder",
  setup(build) {
    // Match the extension tsup gives this build (see outExtension below)
    const ext = build.initialOptions.outExtension?.[".js"] ?? ".mjs";
    build.onResolve({ filter: /^\.\/replay-recorder$/ }, (args) =>
      args.kind === "dynamic-import"
        ? { path: `./replay-recorder${ext}`, external: true }
        : undefined
    );
  },
};

export default defineConfig({
  // Entry points. The replay recorder is its own entry, loaded lazily by the core
  entry: ["src/index.ts", "src/replay-recorder.ts"],

  // Output formats: CommonJS and ESM
  format: ["cjs", "esm"],

  // Output directories
  outDir: "dist",

  // Generate TypeScript declaration files
  dts: { entry: "src/index.ts" },

  // Generate source maps for debugging
  sourcemap: true,

  // Clean output directory before build
  clean: true,

  // Minify output (optional, can enable for production)
  minify: false,

  // No shared chunks: the core entry must stay a single self-contained file
  splitting: false,

  // Tree-shakeable ESM exports
  treeshake: true,

  // Target environment
  target: "es2020",

  // Platform
  platform: "neutral", // Works in both browser and Node.js

  // External dependencies (don't bundle)
  external: ["dotenv", "rrweb"],

  // Bundle size analysis (optional)
  metafile: true,

  // TypeScript config
  tsconfig: "./tsconfig.json",

  // Output file naming
  outExtension({ format }) {
    if (format === "cjs") {
      return { js: ".cjs" };
    }
    if (format === "esm") {
      return { js: ".mjs" };
    }
    return { js: ".js" };
  },

  // Environment-specific settings
  env: {
    NODE_ENV: process.env.NODE_ENV || "production",
  },

  // Skip node_modules
  skipNodeModulesBundle: true,

  // Preserve directory structure
  shims: false,

  esbuildPlugins: [externalReplayRecorder],
});
