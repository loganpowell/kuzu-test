import { MetricsCollector, type TimingResult } from "./metrics-collector.ts";
import { KuzuAuthClient } from "../src/client.ts";
import { TestData, createScenarios, type TestScenario } from "./scenarios.ts";
import { NetworkBenchmark } from "./network.ts";
import type { NetworkMetrics } from "./network.ts";
import { MutationBenchmark } from "./mutation.ts";
import type { MutationMetrics } from "./mutation.ts";
import { WebSocketBenchmark } from "./websocket.ts";
import type { WebSocketMetrics } from "./websocket.ts";

/**
 * Benchmark result format
 */
interface BenchmarkResult {
  metadata: {
    timestamp: string;
    environment: {
      userAgent: string;
      hardwareConcurrency: number;
      deviceMemory?: number;
      connection?: {
        effectiveType: string;
        downlink: number;
        rtt: number;
      };
    };
    dataset: {
      users: number;
      groups: number;
      resources: number;
      relationships: number;
    };
    serviceWorkerEnabled: boolean;
    indexedDBEnabled: boolean;
  };

  coldStart: {
    wasmDownload: number;
    wasmCompilation: number;
    kuzuInitialization: number;
    dataFetch: number;
    graphConstruction: number;
    total: number;
  };

  warmStart?: {
    wasmLoad: number;
    indexedDBLoad: number;
    kuzuInitialization: number;
    total: number;
  };

  permissionChecks: Array<{
    scenario: string;
    description: string;
    iterations: number;
    results: TimingResult;
    opsPerSecond: number;
    failures: number;
  }>;

  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    heapLimit: number;
    indexedDBSize: number;
  };
}

/**
 * Main benchmark runner
 */
export class BenchmarkRunner {
  private metrics: MetricsCollector;
  private client: KuzuAuthClient | null = null;
  private testData: TestData;
  private serverUrl: string;
  private orgId: string;

  constructor(serverUrl: string, orgId: string) {
    this.metrics = new MetricsCollector();
    this.testData = new TestData();
    this.serverUrl = serverUrl;
    this.orgId = orgId;
  }

  /**
   * Run cold start benchmark
   */
  async benchmarkColdStart(): Promise<BenchmarkResult["coldStart"]> {
    console.log("🚀 Running cold start benchmark...");

    // Clear IndexedDB to simulate first load
    await this.clearIndexedDB();

    // Initialize client (triggers WASM download and compilation)
    this.client = new KuzuAuthClient(this.serverUrl, this.orgId);

    await this.client.initialize();

    // Get actual measured timings from client
    const timings = this.client.coldStartTimings!;

    return {
      wasmDownload: timings.wasmDownload,
      wasmCompilation: timings.wasmCompilation,
      kuzuInitialization: timings.kuzuInitialization,
      dataFetch: timings.dataFetch,
      graphConstruction: timings.graphConstruction,
      total: timings.total,
    };
  }

  /**
   * Run warm start benchmark
   */
  async benchmarkWarmStart(): Promise<BenchmarkResult["warmStart"]> {
    console.log("🔥 Running warm start benchmark...");

    // Close existing client
    if (this.client) {
      await this.client.close();
    }

    this.metrics.mark("warm-start-total");
    this.metrics.mark("wasm-load");

    // Re-initialize client (should use cache)
    this.client = new KuzuAuthClient(this.serverUrl, this.orgId);

    this.metrics.measure("wasm-load");
    this.metrics.mark("indexeddb-load");

    await this.client.initialize();

    const total = this.metrics.measure("warm-start-total");
    const indexedDBLoad = this.metrics.measure("indexeddb-load");

    return {
      wasmLoad: total * 0.1,
      indexedDBLoad,
      kuzuInitialization: total * 0.1,
      total,
    };
  }

  /**
   * Run permission check scenarios
   */
  async benchmarkPermissionChecks(): Promise<
    BenchmarkResult["permissionChecks"]
  > {
    console.log("⚡ Running permission check benchmarks...");

    if (!this.client) {
      throw new Error("Client not initialized");
    }

    // Load test data
    await this.testData.loadFromServer(this.serverUrl, this.orgId);

    const scenarios = createScenarios(this.client, this.testData);
    const results: BenchmarkResult["permissionChecks"] = [];

    for (const scenario of scenarios) {
      console.log(
        `  Running: ${scenario.name} (${scenario.iterations} iterations)...`
      );

      const timings: number[] = [];
      let failures = 0;

      if (scenario.setup) {
        await scenario.setup();
      }

      for (let i = 0; i < scenario.iterations; i++) {
        const start = performance.now();

        try {
          await scenario.run();
        } catch (error) {
          console.error(`  Failed iteration ${i}:`, error);
          failures++;
        }

        const duration = performance.now() - start;
        timings.push(duration);

        // Progress indicator (browser-compatible)
        // For scenarios with <100 iterations, log every iteration
        // For scenarios with >=100 iterations, log every 100
        const progressInterval = scenario.iterations < 100 ? 1 : 100;
        if ((i + 1) % progressInterval === 0) {
          console.log(`  Progress: ${i + 1}/${scenario.iterations}`);
        }
      }

      if (scenario.teardown) {
        await scenario.teardown();
      }

      const stats = this.metrics.calculateStats(timings);
      const opsPerSecond = 1000 / stats.mean;

      results.push({
        scenario: scenario.name,
        description: scenario.description,
        iterations: scenario.iterations,
        results: stats,
        opsPerSecond,
        failures,
      });

      console.log(
        `\n  ✓ ${scenario.name}: ${opsPerSecond.toFixed(
          0
        )} ops/sec, p95: ${stats.p95.toFixed(2)}ms`
      );
    }

    return results;
  }

  /**
   * Measure memory usage
   */
  async benchmarkMemory(): Promise<BenchmarkResult["memoryUsage"]> {
    console.log("💾 Measuring memory usage...");

    const memory = this.metrics.getMemoryUsage();
    const indexedDBSize = await this.getIndexedDBSize();

    if (!memory) {
      console.warn("  Memory API not available (Chrome only)");
      return {
        heapUsed: 0,
        heapTotal: 0,
        heapLimit: 0,
        indexedDBSize,
      };
    }

    console.log(`  Heap: ${(memory.heapUsed / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  IndexedDB: ${(indexedDBSize / 1024 / 1024).toFixed(1)} MB`);

    return {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      heapLimit: memory.heapLimit,
      indexedDBSize,
    };
  }

  /**
   * Run network baseline benchmark (Phase 2)
   */
  async benchmarkNetwork(): Promise<NetworkMetrics> {
    console.log("🌐 Running network baseline benchmark...");

    const networkBench = new NetworkBenchmark(this.serverUrl);
    const results = await networkBench.runFullSuite();

    console.log(
      `  ✓ RTT: ${results.rtt.mean.toFixed(
        1
      )}ms (p95: ${results.rtt.p95.toFixed(1)}ms)`
    );
    console.log(
      `  ✓ Empty GET: ${results.emptyGet.mean.toFixed(
        1
      )}ms (p95: ${results.emptyGet.p95.toFixed(1)}ms)`
    );
    console.log(
      `  ✓ Empty POST: ${results.emptyPost.mean.toFixed(
        1
      )}ms (p95: ${results.emptyPost.p95.toFixed(1)}ms)`
    );
    console.log(
      `  ✓ POST 1KB: ${results.postWithPayload.mean.toFixed(
        1
      )}ms (p95: ${results.postWithPayload.p95.toFixed(1)}ms)`
    );

    return results;
  }

  /**
   * Run mutation benchmark (Phase 2C)
   */
  async benchmarkMutations(): Promise<MutationMetrics> {
    console.log("🔄 Running mutation roundtrip benchmark...");

    const mutationBench = new MutationBenchmark(this.serverUrl, this.orgId);
    const results = await mutationBench.runFullSuite();

    console.log(
      `  ✓ Grant: ${results.grant.mean.toFixed(
        1
      )}ms (p95: ${results.grant.p95.toFixed(1)}ms)`
    );
    console.log(
      `  ✓ Revoke: ${results.revoke.mean.toFixed(
        1
      )}ms (p95: ${results.revoke.p95.toFixed(1)}ms)`
    );

    return results;
  }

  /**
   * Run all benchmarks
   */
  async runAll(): Promise<BenchmarkResult> {
    console.log("🏁 Starting comprehensive benchmark...\n");

    const startTime = Date.now();

    // Cold start
    const coldStart = await this.benchmarkColdStart();

    // Permission checks
    const permissionChecks = await this.benchmarkPermissionChecks();

    // Memory usage
    const memoryUsage = await this.benchmarkMemory();

    // Warm start (optional - run after main benchmarks)
    // const warmStart = await this.benchmarkWarmStart();

    const result: BenchmarkResult = {
      metadata: {
        timestamp: new Date().toISOString(),
        environment: {
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency,
          // @ts-ignore
          deviceMemory: navigator.deviceMemory,
          connection: this.metrics.getConnectionInfo() || undefined,
        },
        dataset: {
          users: this.testData.users.length,
          groups: this.testData.groups.length,
          resources: this.testData.resources.length,
          relationships:
            this.testData.memberOf.size +
            this.testData.inheritsFrom.size +
            this.testData.userPermissions.size +
            this.testData.groupPermissions.size,
        },
        serviceWorkerEnabled: "serviceWorker" in navigator,
        indexedDBEnabled: "indexedDB" in window,
      },
      coldStart,
      permissionChecks,
      memoryUsage,
    };

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Benchmark complete in ${duration}s`);

    return result;
  }

  /**
   * Run WebSocket benchmarks
   */
  async runWebSocketBenchmarks(): Promise<WebSocketMetrics> {
    console.log("\n🔌 Running WebSocket benchmarks...");

    const wsBench = new WebSocketBenchmark(this.serverUrl, this.orgId);
    const results = await wsBench.runAll();

    console.log("\n✅ WebSocket benchmarks complete");
    return results;
  }

  /**
   * Run quick WebSocket benchmarks
   */
  async runQuickWebSocketBenchmarks(): Promise<WebSocketMetrics> {
    console.log("\n🔌 Running quick WebSocket benchmarks...");

    const wsBench = new WebSocketBenchmark(this.serverUrl, this.orgId);
    const results = await wsBench.runQuick();

    console.log("\n✅ Quick WebSocket benchmarks complete");
    return results;
  }

  /**
   * Save results to JSON file
   */
  async saveResults(result: BenchmarkResult): Promise<void> {
    const timestamp = result.metadata.timestamp
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const filename = `client-benchmark-${timestamp}.json`;

    // Create download link
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    console.log(`📊 Results saved: ${filename}`);
  }

  /**
   * Clear IndexedDB
   */
  private async clearIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("kuzu-auth");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get IndexedDB storage size
   */
  private async getIndexedDBSize(): Promise<number> {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return estimate.usage || 0;
    }
    return 0;
  }
}
