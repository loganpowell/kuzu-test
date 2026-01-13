#!/usr/bin/env node
/**
 * Schema Watch CLI
 *
 * Usage:
 *   schema-watch <input.yaml> [output-dir]
 */

import { watchSchema } from "./watcher.js";

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: schema-watch <input.yaml|input.json> [output-dir]");
    console.error("");
    console.error("Examples:");
    console.error("  schema-watch schema.yaml");
    console.error("  schema-watch schema.json ./generated");
    process.exit(1);
  }

  const inputFile = args[0];
  const outputDir = args[1] || "./generated";

  try {
    const watcher = watchSchema({
      inputFile,
      outputDir,
      onCompile: (success, error) => {
        if (!success && error) {
          console.error("Compilation error:", error.message);
        }
      },
    });

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n👋 Stopping watcher...");
      watcher.stop();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      watcher.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error("Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
