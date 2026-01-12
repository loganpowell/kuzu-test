import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { KuzuAuthClient } from "../src/client";

// Note: Full client initialization requires WASM from CDN which doesn't work in Node test environment
// These tests focus on the parts we can test without full initialization

describe("KuzuAuthClient", () => {
  const TEST_SERVER_URL = "http://localhost:8787";
  const TEST_ORG_ID = "test-org";

  describe("constructor", () => {
    it("should create instance with default options", () => {
      const client = new KuzuAuthClient(TEST_SERVER_URL, TEST_ORG_ID);
      expect(client).toBeDefined();
    });

    it("should create instance with custom options", () => {
      const client = new KuzuAuthClient(TEST_SERVER_URL, TEST_ORG_ID, {
        enableOptimisticUpdates: false,
        useMultiThreadedCDN: true,
      });
      expect(client).toBeDefined();
    });
  });

  describe("coldStartTimings", () => {
    it("should have null timings before initialization", () => {
      const client = new KuzuAuthClient(TEST_SERVER_URL, TEST_ORG_ID);
      expect(client.coldStartTimings).toBeNull();
    });
  });

  describe("getPendingMutationsCount", () => {
    it("should return 0 for new client", () => {
      const client = new KuzuAuthClient(TEST_SERVER_URL, TEST_ORG_ID);
      expect(client.getPendingMutationsCount()).toBe(0);
    });
  });

  describe("getPendingMutations", () => {
    it("should return empty array for new client", () => {
      const client = new KuzuAuthClient(TEST_SERVER_URL, TEST_ORG_ID);
      expect(client.getPendingMutations()).toEqual([]);
    });
  });
});
