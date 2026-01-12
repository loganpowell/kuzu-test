import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocketManager } from "../src/websocket-manager";

describe("WebSocketManager", () => {
  let wsManager: WebSocketManager;
  let onMutationSpy: ReturnType<typeof vi.fn>;
  let onStateChangeSpy: ReturnType<typeof vi.fn>;
  let onErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Callback spies
    onMutationSpy = vi.fn();
    onStateChangeSpy = vi.fn();
    onErrorSpy = vi.fn();

    wsManager = new WebSocketManager({
      serverUrl: "http://localhost:8787",
      orgId: "test-org",
      onMutation: onMutationSpy,
      onStateChange: onStateChangeSpy,
      onError: onErrorSpy,
      heartbeatInterval: 100, // Fast heartbeat for tests
    });
  });

  afterEach(() => {
    wsManager.disconnect();
    vi.clearAllMocks();
  });

  describe("getState()", () => {
    it("should return disconnected initially", () => {
      expect(wsManager.getState()).toBe("disconnected");
    });

    it("should return connecting when attempting to connect", async () => {
      // Connect will fail because there's no real server, but state should change
      wsManager.connect();
      expect(wsManager.getState()).toBe("connecting");
    });
  });

  describe("getLastKnownVersion()", () => {
    it("should return 0 initially", () => {
      expect(wsManager.getLastKnownVersion()).toBe(0);
    });

    it("should accept initial version in connect", async () => {
      wsManager.connect(42);
      expect(wsManager.getLastKnownVersion()).toBe(42);
    });
  });

  describe("updateVersion()", () => {
    it("should update last known version", () => {
      wsManager.updateVersion(100);
      expect(wsManager.getLastKnownVersion()).toBe(100);
    });
  });

  describe("markActivity()", () => {
    it("should not throw when called", () => {
      expect(() => wsManager.markActivity()).not.toThrow();
    });
  });
});
