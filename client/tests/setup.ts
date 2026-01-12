/**
 * Test setup file
 * Runs before all tests
 */
import { vi, beforeAll, afterEach, afterAll } from "vitest";
import "fake-indexeddb/auto";

// Note: We use real kuzu-wasm from npm package for tests
// This provides better test coverage than mocking

// Mock WebSocket
global.WebSocket = class MockWebSocket {
  public readyState = 1; // OPEN
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    setTimeout(() => {
      if (this.onopen) this.onopen(new Event("open"));
    }, 0);
  }

  send(data: string | ArrayBuffer | Blob) {
    // Mock implementation
  }

  close() {
    if (this.onclose) {
      this.onclose(new CloseEvent("close"));
    }
  }
} as any;

// Mock Service Worker
Object.defineProperty(navigator, "serviceWorker", {
  value: {
    register: vi.fn(() => Promise.resolve({ scope: "/" })),
    controller: null,
  },
  configurable: true,
});

// Mock performance.now() for consistent timing in tests
let mockTime = 0;
const originalPerformanceNow = performance.now;

beforeAll(() => {
  vi.spyOn(performance, "now").mockImplementation(() => mockTime);
});

afterEach(() => {
  mockTime = 0;
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Helper to advance mock time
export function advanceTime(ms: number) {
  mockTime += ms;
}
