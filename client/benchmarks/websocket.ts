import { MetricsCollector } from "./metrics-collector.ts";
import { KuzuAuthClient } from "../src/client.ts";
import type { ConnectionState } from "../src/websocket-manager.ts";

/**
 * WebSocket benchmark metrics
 */
export interface WebSocketMetrics {
  connectionSetup: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    samples: number;
  };

  mutationRoundtrip: {
    grant: {
      mean: number;
      median: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
      samples: number;
    };
    revoke: {
      mean: number;
      median: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
      samples: number;
    };
  };

  broadcastLatency?: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    samples: number;
  };

  reconnection?: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    samples: number;
  };
}

/**
 * WebSocket benchmark suite
 */
export class WebSocketBenchmark {
  private collector = new MetricsCollector();
  private serverUrl: string;
  private orgId: string;

  constructor(serverUrl: string, orgId: string) {
    this.serverUrl = serverUrl;
    this.orgId = orgId;
  }

  /**
   * Run all WebSocket benchmarks
   */
  async runAll(): Promise<WebSocketMetrics> {
    console.log("[WebSocketBenchmark] Starting comprehensive benchmarks...");

    const connectionSetup = await this.benchmarkConnectionSetup();
    const mutationRoundtrip = await this.benchmarkMutationRoundtrip();

    return {
      connectionSetup,
      mutationRoundtrip,
    };
  }

  /**
   * Benchmark: WebSocket connection setup time
   */
  async benchmarkConnectionSetup(iterations: number = 5): Promise<any> {
    console.log(
      `[WebSocketBenchmark] Connection setup (${iterations} iterations)...`
    );

    const timings: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const client = new KuzuAuthClient(this.serverUrl, this.orgId);

      const start = performance.now();

      // Initialize includes WebSocket connection
      await client.initialize();

      // Wait for connection to be established
      await this.waitForConnection(client, 5000);

      const duration = performance.now() - start;
      timings.push(duration);

      console.log(`  Iteration ${i + 1}: ${duration.toFixed(2)}ms`);

      // Cleanup
      await client.close();

      // Wait between iterations
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return this.collector.calculateStats(timings);
  }

  /**
   * Benchmark: Mutation roundtrip (grant/revoke)
   */
  async benchmarkMutationRoundtrip(
    grantIterations: number = 20,
    revokeIterations: number = 20
  ): Promise<any> {
    console.log(
      `[WebSocketBenchmark] Mutation roundtrip (${grantIterations} grants, ${revokeIterations} revokes)...`
    );

    // Initialize client once for all mutations
    const client = new KuzuAuthClient(this.serverUrl, this.orgId);
    await client.initialize();
    await this.waitForConnection(client, 5000);

    // Benchmark grants
    console.log("  Benchmarking grants...");
    const grantTimings: number[] = [];

    for (let i = 0; i < grantIterations; i++) {
      const user = `user_bench_${i}`;
      const resource = `resource_bench_${i}`;
      const permission = "read";

      const start = performance.now();

      try {
        await client.grant(user, permission, resource);
        const duration = performance.now() - start;
        grantTimings.push(duration);

        if ((i + 1) % 5 === 0) {
          console.log(
            `    Completed ${i + 1}/${grantIterations}: ${duration.toFixed(
              2
            )}ms`
          );
        }
      } catch (error) {
        console.error(`    Grant ${i + 1} failed:`, error);
      }

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Benchmark revokes
    console.log("  Benchmarking revokes...");
    const revokeTimings: number[] = [];

    for (let i = 0; i < revokeIterations; i++) {
      const user = `user_bench_${i}`;
      const resource = `resource_bench_${i}`;
      const permission = "read";

      const start = performance.now();

      try {
        await client.revoke(user, permission, resource);
        const duration = performance.now() - start;
        revokeTimings.push(duration);

        if ((i + 1) % 5 === 0) {
          console.log(
            `    Completed ${i + 1}/${revokeIterations}: ${duration.toFixed(
              2
            )}ms`
          );
        }
      } catch (error) {
        console.error(`    Revoke ${i + 1} failed:`, error);
      }

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await client.close();

    return {
      grant: this.collector.calculateStats(grantTimings),
      revoke: this.collector.calculateStats(revokeTimings),
    };
  }

  /**
   * Benchmark: Reconnection time
   */
  async benchmarkReconnection(iterations: number = 3): Promise<any> {
    console.log(
      `[WebSocketBenchmark] Reconnection (${iterations} iterations)...`
    );

    const timings: number[] = [];

    const client = new KuzuAuthClient(this.serverUrl, this.orgId);
    await client.initialize();
    await this.waitForConnection(client, 5000);

    for (let i = 0; i < iterations; i++) {
      // Force disconnect (simulate connection loss)
      // Note: This requires exposing disconnect method on client
      // For now, we'll measure cold start which includes reconnection

      console.log(`  Iteration ${i + 1}: Simulating disconnect...`);

      await client.close();
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const start = performance.now();

      // Reconnect
      const newClient = new KuzuAuthClient(this.serverUrl, this.orgId);
      await newClient.initialize();
      await this.waitForConnection(newClient, 5000);

      const duration = performance.now() - start;
      timings.push(duration);

      console.log(`    Reconnected in ${duration.toFixed(2)}ms`);

      await newClient.close();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return this.collector.calculateStats(timings);
  }

  /**
   * Benchmark: Broadcast fanout (multi-client)
   */
  async benchmarkBroadcastFanout(
    clientCount: number = 5,
    mutations: number = 10
  ): Promise<any> {
    console.log(
      `[WebSocketBenchmark] Broadcast fanout (${clientCount} clients, ${mutations} mutations)...`
    );

    // Create multiple clients
    const clients: KuzuAuthClient[] = [];
    const receivedMutations: Map<number, number[]> = new Map(); // clientIndex -> timestamps

    console.log(`  Initializing ${clientCount} clients...`);

    for (let i = 0; i < clientCount; i++) {
      const client = new KuzuAuthClient(this.serverUrl, this.orgId);

      // Track when this client receives mutations
      receivedMutations.set(i, []);

      await client.initialize();
      await this.waitForConnection(client, 5000);

      clients.push(client);
      console.log(`    Client ${i + 1}/${clientCount} ready`);
    }

    console.log(`  Sending ${mutations} mutations and measuring broadcast...`);

    const broadcastLatencies: number[] = [];

    // Send mutations from first client, measure when others receive them
    for (let m = 0; m < mutations; m++) {
      const user = `user_fanout_${m}`;
      const resource = `resource_fanout_${m}`;
      const permission = "read";

      const sendTime = performance.now();

      try {
        // Send from first client
        await clients[0].grant(user, permission, resource);

        // Wait a bit for broadcast to propagate
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Calculate broadcast latency (very rough estimate)
        // In a real implementation, clients would need to track when they receive broadcasts
        const receiveTime = performance.now();
        const latency = receiveTime - sendTime;
        broadcastLatencies.push(latency);

        console.log(`    Mutation ${m + 1}: ~${latency.toFixed(2)}ms`);
      } catch (error) {
        console.error(`    Mutation ${m + 1} failed:`, error);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Cleanup
    console.log("  Cleaning up clients...");
    for (const client of clients) {
      await client.close();
    }

    return this.collector.calculateStats(broadcastLatencies);
  }

  /**
   * Run quick WebSocket benchmark (subset of tests)
   */
  async runQuick(): Promise<WebSocketMetrics> {
    console.log("[WebSocketBenchmark] Running quick benchmarks...");

    const connectionSetup = await this.benchmarkConnectionSetup(3);
    const mutationRoundtrip = await this.benchmarkMutationRoundtrip(10, 10);

    return {
      connectionSetup,
      mutationRoundtrip,
    };
  }

  /**
   * Helper: Wait for WebSocket connection to be established
   */
  private async waitForConnection(
    client: KuzuAuthClient,
    timeout: number = 5000
  ): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        // @ts-ignore - accessing private wsManager for testing
        const state = client.wsManager?.getState();

        if (state === "connected") {
          clearInterval(checkInterval);
          resolve();
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error("WebSocket connection timeout"));
        }
      }, 100);
    });
  }
}
