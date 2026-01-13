/**
 * Schema Watcher Tests
 *
 * Phase 2.3: Hot Reload System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SchemaWatcher } from "../src/watcher.js";
import {
  writeFileSync,
  unlinkSync,
  mkdirSync,
  rmdirSync,
  existsSync,
  readdirSync,
} from "fs";
import { join } from "path";

const TEST_DIR = join(process.cwd(), "tests/fixtures/watch-test");
const TEST_SCHEMA = join(TEST_DIR, "test-schema.yaml");
const OUTPUT_DIR = join(TEST_DIR, "generated");

const sampleSchema = `
version: "1.0"
name: "Test Schema"
entities:
  User:
    fields:
      - name: id
        type: string
        required: true
`;

describe("SchemaWatcher", () => {
  beforeEach(() => {
    // Create test directory
    mkdirSync(TEST_DIR, { recursive: true });

    // Create initial schema file
    writeFileSync(TEST_SCHEMA, sampleSchema);
  });

  afterEach(() => {
    // Clean up test files
    try {
      if (existsSync(OUTPUT_DIR)) {
        const files = readdirSync(OUTPUT_DIR);
        files.forEach((file) => {
          unlinkSync(join(OUTPUT_DIR, file));
        });
        rmdirSync(OUTPUT_DIR);
      }
      if (existsSync(TEST_SCHEMA)) {
        unlinkSync(TEST_SCHEMA);
      }
      if (existsSync(TEST_DIR)) {
        rmdirSync(TEST_DIR);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should compile schema on start", async () => {
    const onCompile = vi.fn();

    const watcher = new SchemaWatcher({
      inputFile: TEST_SCHEMA,
      outputDir: OUTPUT_DIR,
      onCompile,
    });

    watcher.start();

    // Wait for initial compilation
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(onCompile).toHaveBeenCalledWith(true);
    expect(existsSync(join(OUTPUT_DIR, "test-schema.types.ts"))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, "test-schema.sql"))).toBe(true);

    watcher.stop();
  });

  it("should throw error if input file does not exist", () => {
    const watcher = new SchemaWatcher({
      inputFile: "/nonexistent/file.yaml",
      outputDir: OUTPUT_DIR,
    });

    expect(() => watcher.start()).toThrow("Schema file not found");
  });

  it("should recompile on file change", async () => {
    const onCompile = vi.fn();

    const watcher = new SchemaWatcher({
      inputFile: TEST_SCHEMA,
      outputDir: OUTPUT_DIR,
      onCompile,
      debounce: 50, // Short debounce for testing
    });

    watcher.start();

    // Wait for initial compilation
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(onCompile).toHaveBeenCalledTimes(1);

    // Modify schema file
    const updatedSchema =
      sampleSchema +
      `
  Group:
    fields:
      - name: id
        type: string
`;
    writeFileSync(TEST_SCHEMA, updatedSchema);

    // Wait for recompilation (debounce + compilation time)
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onCompile).toHaveBeenCalledTimes(2);

    watcher.stop();
  }, 10000);

  it("should debounce rapid changes", async () => {
    const onCompile = vi.fn();

    const watcher = new SchemaWatcher({
      inputFile: TEST_SCHEMA,
      outputDir: OUTPUT_DIR,
      onCompile,
      debounce: 100,
    });

    watcher.start();

    // Wait for initial compilation
    await new Promise((resolve) => setTimeout(resolve, 150));

    const initialCalls = onCompile.mock.calls.length;

    // Make rapid changes
    writeFileSync(TEST_SCHEMA, sampleSchema + "\n# Change 1");
    await new Promise((resolve) => setTimeout(resolve, 50));

    writeFileSync(TEST_SCHEMA, sampleSchema + "\n# Change 2");
    await new Promise((resolve) => setTimeout(resolve, 50));

    writeFileSync(TEST_SCHEMA, sampleSchema + "\n# Change 3");

    // Wait for debounce + compilation
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Should only compile once despite multiple changes
    expect(onCompile).toHaveBeenCalledTimes(initialCalls + 1);

    watcher.stop();
  }, 10000);

  it("should call onCompile with error on invalid schema", async () => {
    const onCompile = vi.fn();

    const watcher = new SchemaWatcher({
      inputFile: TEST_SCHEMA,
      outputDir: OUTPUT_DIR,
      onCompile,
      debounce: 50,
    });

    watcher.start();

    // Wait for initial compilation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Write invalid YAML
    writeFileSync(TEST_SCHEMA, "invalid: yaml: content: [[[");

    // Wait for recompilation
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Check that onCompile was called with error
    const lastCall = onCompile.mock.calls[onCompile.mock.calls.length - 1];
    expect(lastCall[0]).toBe(false);
    expect(lastCall[1]).toBeInstanceOf(Error);

    watcher.stop();
  }, 10000);

  it("should stop watching when stop is called", async () => {
    const onCompile = vi.fn();

    const watcher = new SchemaWatcher({
      inputFile: TEST_SCHEMA,
      outputDir: OUTPUT_DIR,
      onCompile,
      debounce: 50,
    });

    watcher.start();

    // Wait for initial compilation
    await new Promise((resolve) => setTimeout(resolve, 100));

    const initialCalls = onCompile.mock.calls.length;

    // Stop watcher
    watcher.stop();

    // Make changes after stopping
    writeFileSync(TEST_SCHEMA, sampleSchema + "\n# After stop");

    // Wait
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should not recompile
    expect(onCompile).toHaveBeenCalledTimes(initialCalls);
  });
});
