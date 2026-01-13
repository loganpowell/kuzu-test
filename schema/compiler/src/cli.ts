#!/usr/bin/env node
/**
 * Schema Compiler CLI
 *
 * Usage:
 *   schema-compile <input.yaml> [output-dir]
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname, basename } from "path";
import { compile } from "./index.js";

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: schema-compile <input.yaml|input.json> [output-dir]");
    console.error("");
    console.error("Examples:");
    console.error("  schema-compile schema.yaml");
    console.error("  schema-compile schema.json ./generated");
    process.exit(1);
  }

  const inputFile = args[0];
  const outputDir = args[1] || dirname(inputFile);

  try {
    // Read input file
    const content = readFileSync(inputFile, "utf-8");
    const format = inputFile.endsWith(".json") ? "json" : "yaml";

    // Compile schema
    console.log(`Compiling ${inputFile}...`);
    const output = compile(content, format);

    // Create output directory
    mkdirSync(outputDir, { recursive: true });

    // Write TypeScript types
    const baseName = basename(inputFile, format === "json" ? ".json" : ".yaml");
    const typesFile = join(outputDir, `${baseName}.types.ts`);
    writeFileSync(typesFile, output.types);
    console.log(`✓ Generated types: ${typesFile}`);

    // Write SQL schema
    const sqlFile = join(outputDir, `${baseName}.sql`);
    writeFileSync(sqlFile, output.sql);
    console.log(`✓ Generated SQL: ${sqlFile}`);

    console.log("");
    console.log("✨ Compilation complete!");
  } catch (error) {
    console.error("Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
