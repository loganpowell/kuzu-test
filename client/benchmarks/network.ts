/**
 * Network Benchmark Suite
 * Measures baseline network performance to Cloudflare Worker
 */

interface StatsSummary {
  mean: number;
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface NetworkMetrics {
  rtt: StatsSummary;
  emptyGet: StatsSummary;
  emptyPost: StatsSummary;
  postWithPayload: StatsSummary;
}

export class NetworkBenchmark {
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * Measure round-trip time (ping equivalent)
   * Uses HTTP GET to /ping endpoint
   */
  async measureRTT(iterations: number = 10): Promise<number[]> {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await fetch(`${this.serverUrl}/ping`, {
          method: "GET",
          cache: "no-store",
        });
        const end = performance.now();
        times.push(end - start);
      } catch (error) {
        console.error("RTT measurement failed:", error);
      }
    }

    return times;
  }

  /**
   * Measure empty HTTP GET request
   */
  async measureEmptyGet(iterations: number = 10): Promise<number[]> {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await fetch(`${this.serverUrl}/health`, {
          method: "GET",
          cache: "no-store",
        });
        const end = performance.now();
        times.push(end - start);
      } catch (error) {
        console.error("Empty GET measurement failed:", error);
      }
    }

    return times;
  }

  /**
   * Measure empty HTTP POST request
   */
  async measureEmptyPost(iterations: number = 10): Promise<number[]> {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await fetch(`${this.serverUrl}/echo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          cache: "no-store",
        });
        const end = performance.now();
        times.push(end - start);
      } catch (error) {
        console.error("Empty POST measurement failed:", error);
      }
    }

    return times;
  }

  /**
   * Measure HTTP POST with typical mutation payload
   */
  async measurePostWithPayload(iterations: number = 10): Promise<number[]> {
    const times: number[] = [];
    const payload = {
      operation: "grant",
      user: "user_123",
      capability: "edit",
      resource: "resource_456",
    };

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await fetch(`${this.serverUrl}/echo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
        const end = performance.now();
        times.push(end - start);
      } catch (error) {
        console.error("POST with payload measurement failed:", error);
      }
    }

    return times;
  }

  /**
   * Run full network benchmark suite
   */
  async runFullSuite(): Promise<NetworkMetrics> {
    console.log("🌐 Running network baseline measurements...");

    const rttTimes = await this.measureRTT(20);
    const getTimes = await this.measureEmptyGet(20);
    const postEmptyTimes = await this.measureEmptyPost(20);
    const postPayloadTimes = await this.measurePostWithPayload(20);

    return {
      rtt: this.calculateStats(rttTimes),
      emptyGet: this.calculateStats(getTimes),
      emptyPost: this.calculateStats(postEmptyTimes),
      postWithPayload: this.calculateStats(postPayloadTimes),
    };
  }

  private calculateStats(times: number[]): {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  } {
    const sorted = times.slice().sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);

    return {
      mean: sum / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: Math.min(...times),
      max: Math.max(...times),
    };
  }
}
