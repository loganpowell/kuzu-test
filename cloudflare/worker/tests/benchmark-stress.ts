#!/usr/bin/env node
/**
 * Benchmarking Suite for WebSocket Authorization System
 *
 * Validates performance against authorization requirements:
 * - Mutation latency: <50ms p50, <75ms p95
 * - Connection setup: <500ms p95
 * - Broadcast fanout: <100ms for 100 clients
 * - Throughput: >100 mutations/sec with 20 clients
 *
 * Usage:
 *   npm run benchmark
 *   npm run benchmark -- --scenario=heavy
 */

import WebSocket from "ws";

interface BenchmarkConfig {
  workerUrl: string;
  orgId: string;
  scenarios: BenchmarkScenario[];
  warmupRounds: number;
  verbose: boolean;
}

interface BenchmarkScenario {
  name: string;
  clients: number;
  mutationsPerClient: number;
  description: string;
}

interface LatencyMetrics {
  samples: number[];
  mean: number;
  median: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  stddev: number;
}

interface BenchmarkResults {
  scenario: string;
  connectionSetup: LatencyMetrics;
  mutationLatency: LatencyMetrics;
  broadcastLatency: LatencyMetrics;
  throughput: number;
  successRate: number;
  errorRate: number;
  passed: boolean;
  issues: string[];
}

interface TimedMutation {
  sendTime: number;
  ackTime?: number;
  broadcastTimes: number[];
  version?: number;
}

class BenchmarkClient {
  private ws?: WebSocket;
  private id: string;
  private config: BenchmarkConfig;
  private connected = false;
  private mutations = new Map<string, TimedMutation>();
  private pendingMutations: TimedMutation[] = []; // Queue of sent mutations awaiting ack
  private receivedVersions = new Set<number>();
  private errors = 0;

  constructor(id: string, config: BenchmarkConfig) {
    this.id = id;
    this.config = config;
  }

  async connect(): Promise<number> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const wsUrl = `${this.config.workerUrl.replace(
        "https://",
        "wss://"
      )}/org/${this.config.orgId}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.on("open", () => {
        this.connected = true;
        this.send({ type: "version", version: 0 });
        resolve(Date.now() - startTime);
      });

      this.ws.on("message", (data) => this.handleMessage(data.toString()));
      this.ws.on("error", () => this.errors++);
      this.ws.on("close", () => (this.connected = false));

      setTimeout(() => reject(new Error("Connection timeout")), 10000);
    });
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (this.config.verbose) {
        console.log(
          `[${this.id}] Received:`,
          message.type,
          message.success !== undefined ? `success=${message.success}` : ""
        );
      }

      switch (message.type) {
        case "mutation":
          this.receivedVersions.add(message.version);

          // Track broadcast time for all mutations waiting for this version
          this.mutations.forEach((mutation) => {
            if (mutation.version === message.version) {
              mutation.broadcastTimes.push(Date.now());
            }
          });
          break;

        case "ack":
          // Track all acks, even failures
          if (this.pendingMutations.length > 0) {
            const mutation = this.pendingMutations.shift()!;
            mutation.ackTime = Date.now();
            if (message.version) {
              mutation.version = message.version;
            }

            // Log failures
            if (!message.success && this.config.verbose) {
              console.log(`[${this.id}] Mutation failed:`, message.error);
            }
          }
          break;
      }
    } catch (error) {
      this.errors++;
    }
  }

  async sendMutation(
    mutationId: string,
    user: string,
    resource: string,
    op: "grant" | "revoke"
  ): Promise<void> {
    const sendTime = Date.now();

    const mutation: TimedMutation = {
      sendTime,
      broadcastTimes: [],
    };

    this.mutations.set(mutationId, mutation);
    this.pendingMutations.push(mutation); // Add to pending queue

    this.send({
      type: "mutate",
      op,
      user,
      resource,
      permission: "read",
    });
  }

  private send(data: any): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(data));
    }
  }

  getMutations(): Map<string, TimedMutation> {
    return this.mutations;
  }

  getErrors(): number {
    return this.errors;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }
}

class BenchmarkRunner {
  private config: BenchmarkConfig;
  private allResults: BenchmarkResults[] = [];

  constructor(config: BenchmarkConfig) {
    this.config = config;
  }

  async run(): Promise<void> {
    console.log("\n🔥 Authorization System Benchmark Suite\n");
    console.log("Performance Requirements:");
    console.log("  • Mutation latency: <50ms p50, <75ms p95");
    console.log("  • Connection setup: <500ms p95");
    console.log("  • Throughput: >100 mutations/sec (20+ clients)");
    console.log("  • Success rate: >99%\n");

    for (const scenario of this.config.scenarios) {
      console.log(`\n${"=".repeat(70)}`);
      console.log(`📊 Scenario: ${scenario.name}`);
      console.log(`   ${scenario.description}`);
      console.log(
        `   Clients: ${scenario.clients}, Mutations per client: ${scenario.mutationsPerClient}`
      );
      console.log(`${"=".repeat(70)}\n`);

      const results = await this.runScenario(scenario);
      this.allResults.push(results);
      this.printScenarioResults(results);
    }

    this.printSummary();
  }

  private async runScenario(
    scenario: BenchmarkScenario
  ): Promise<BenchmarkResults> {
    const clients: BenchmarkClient[] = [];
    const connectionTimes: number[] = [];
    const mutationLatencies: number[] = [];
    const broadcastLatencies: number[] = [];
    let totalMutations = 0;
    let successfulMutations = 0;
    let totalErrors = 0;

    try {
      // Phase 1: Connection Setup
      console.log("📡 Phase 1: Connection Setup...");
      const connectStart = Date.now();

      for (let i = 0; i < scenario.clients; i++) {
        const client = new BenchmarkClient(`bench_client_${i}`, this.config);
        clients.push(client);
      }

      const connectionPromises = clients.map((c) => c.connect());
      const times = await Promise.all(connectionPromises);
      connectionTimes.push(...times);

      const connectTotal = Date.now() - connectStart;
      console.log(
        `   ✅ Connected ${clients.length} clients in ${connectTotal}ms`
      );
      console.log(
        `   📊 Per-client: ${this.formatMetrics(
          this.calculateMetrics(connectionTimes)
        )}\n`
      );

      // Warmup
      await this.sleep(500);

      // Phase 2: Concurrent Mutations
      console.log("⚡ Phase 2: Concurrent Mutations...");
      const mutationStart = Date.now();

      const mutationPromises = clients.map(async (client, clientIdx) => {
        for (let i = 0; i < scenario.mutationsPerClient; i++) {
          const mutationId = `mutation_${clientIdx}_${i}`;
          const user = `bench_user_${clientIdx}_${i}`;
          const resource = `bench_resource_${clientIdx}_${i}`;
          const op = i % 2 === 0 ? "grant" : "revoke";

          await client.sendMutation(mutationId, user, resource, op);
          totalMutations++;

          // Small delay to avoid overwhelming the DO
          if (scenario.clients > 10) {
            await this.sleep(5);
          }
        }
      });

      await Promise.all(mutationPromises);

      // Wait for all acks and broadcasts (shorter wait, acks come fast)
      await this.sleep(1000);

      const mutationTotal = Date.now() - mutationStart;
      const throughput = totalMutations / (mutationTotal / 1000);

      console.log(
        `   ✅ Sent ${totalMutations} mutations in ${mutationTotal}ms`
      );
      console.log(`   📊 Throughput: ${throughput.toFixed(2)} mutations/sec\n`);

      // Phase 3: Analyze Results
      console.log("📊 Phase 3: Analyzing Performance...");

      // Debug: count acked mutations before analysis
      let debugAckedCount = 0;
      clients.forEach((client) => {
        const mutations = client.getMutations();
        mutations.forEach((mutation) => {
          if (mutation.ackTime) {
            debugAckedCount++;
          }
        });
      });
      console.log(
        `   Debug: ${debugAckedCount} mutations acknowledged out of ${totalMutations}\n`
      );

      clients.forEach((client) => {
        const mutations = client.getMutations();
        totalErrors += client.getErrors();

        mutations.forEach((mutation) => {
          if (mutation.ackTime) {
            const latency = mutation.ackTime - mutation.sendTime;
            mutationLatencies.push(latency);
            successfulMutations++;

            // Calculate broadcast latency (time from ack to first broadcast)
            if (mutation.broadcastTimes.length > 0) {
              const broadcastLatency =
                Math.min(...mutation.broadcastTimes) - mutation.ackTime;
              if (broadcastLatency >= 0) {
                broadcastLatencies.push(broadcastLatency);
              }
            }
          }
        });
      });

      const successRate = (successfulMutations / totalMutations) * 100;
      const errorRate = (totalErrors / totalMutations) * 100;

      const connectionMetrics = this.calculateMetrics(connectionTimes);
      const mutationMetrics = this.calculateMetrics(mutationLatencies);
      const broadcastMetrics =
        broadcastLatencies.length > 0
          ? this.calculateMetrics(broadcastLatencies)
          : this.createEmptyMetrics();

      // Evaluate against requirements
      const issues: string[] = [];
      let passed = true;

      if (mutationMetrics.p50 > 50) {
        issues.push(
          `Mutation p50 (${mutationMetrics.p50.toFixed(
            1
          )}ms) exceeds 50ms target`
        );
        passed = false;
      }

      if (mutationMetrics.p95 > 75) {
        issues.push(
          `Mutation p95 (${mutationMetrics.p95.toFixed(
            1
          )}ms) exceeds 75ms target`
        );
        passed = false;
      }

      if (connectionMetrics.p95 > 500) {
        issues.push(
          `Connection p95 (${connectionMetrics.p95.toFixed(
            1
          )}ms) exceeds 500ms target`
        );
        passed = false;
      }

      if (scenario.clients >= 20 && throughput < 100) {
        issues.push(
          `Throughput (${throughput.toFixed(
            1
          )} mut/sec) below 100 mut/sec target`
        );
        passed = false;
      }

      if (successRate < 99) {
        issues.push(
          `Success rate (${successRate.toFixed(1)}%) below 99% target`
        );
        passed = false;
      }

      return {
        scenario: scenario.name,
        connectionSetup: connectionMetrics,
        mutationLatency: mutationMetrics,
        broadcastLatency: broadcastMetrics,
        throughput,
        successRate,
        errorRate,
        passed,
        issues,
      };
    } finally {
      // Cleanup
      clients.forEach((c) => c.disconnect());
    }
  }

  private calculateMetrics(samples: number[]): LatencyMetrics {
    if (samples.length === 0) {
      return this.createEmptyMetrics();
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;

    const variance =
      sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
      sorted.length;
    const stddev = Math.sqrt(variance);

    return {
      samples: sorted,
      mean,
      median: this.percentile(sorted, 50),
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      stddev,
    };
  }

  private createEmptyMetrics(): LatencyMetrics {
    return {
      samples: [],
      mean: 0,
      median: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
      stddev: 0,
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((sorted.length * p) / 100) - 1;
    return sorted[Math.max(0, index)];
  }

  private formatMetrics(metrics: LatencyMetrics): string {
    return `p50=${metrics.p50.toFixed(1)}ms, p95=${metrics.p95.toFixed(
      1
    )}ms, p99=${metrics.p99.toFixed(1)}ms`;
  }

  private printScenarioResults(results: BenchmarkResults): void {
    console.log("\n📈 Results:");
    console.log("─".repeat(70));

    console.log(`\n⏱️  Connection Setup:`);
    console.log(`   Mean: ${results.connectionSetup.mean.toFixed(1)}ms`);
    console.log(`   p50:  ${results.connectionSetup.p50.toFixed(1)}ms`);
    console.log(
      `   p95:  ${results.connectionSetup.p95.toFixed(1)}ms ${
        results.connectionSetup.p95 > 500 ? "❌" : "✅"
      }`
    );
    console.log(`   p99:  ${results.connectionSetup.p99.toFixed(1)}ms`);

    console.log(`\n⚡ Mutation Latency:`);
    console.log(`   Mean: ${results.mutationLatency.mean.toFixed(1)}ms`);
    console.log(
      `   p50:  ${results.mutationLatency.p50.toFixed(1)}ms ${
        results.mutationLatency.p50 > 50 ? "❌" : "✅"
      }`
    );
    console.log(
      `   p95:  ${results.mutationLatency.p95.toFixed(1)}ms ${
        results.mutationLatency.p95 > 75 ? "❌" : "✅"
      }`
    );
    console.log(`   p99:  ${results.mutationLatency.p99.toFixed(1)}ms`);

    if (results.broadcastLatency.samples.length > 0) {
      console.log(`\n📢 Broadcast Latency:`);
      console.log(`   Mean: ${results.broadcastLatency.mean.toFixed(1)}ms`);
      console.log(`   p95:  ${results.broadcastLatency.p95.toFixed(1)}ms`);
    }

    console.log(`\n📊 Throughput & Success:`);
    console.log(
      `   Throughput:   ${results.throughput.toFixed(2)} mutations/sec`
    );
    console.log(
      `   Success rate: ${results.successRate.toFixed(2)}% ${
        results.successRate < 99 ? "❌" : "✅"
      }`
    );
    console.log(`   Error rate:   ${results.errorRate.toFixed(2)}%`);

    if (results.passed) {
      console.log(`\n✅ PASSED - All requirements met`);
    } else {
      console.log(`\n❌ FAILED - Issues found:`);
      results.issues.forEach((issue) => console.log(`   • ${issue}`));
    }
  }

  private printSummary(): void {
    console.log("\n" + "=".repeat(70));
    console.log("📊 BENCHMARK SUMMARY");
    console.log("=".repeat(70) + "\n");

    const passed = this.allResults.filter((r) => r.passed).length;
    const total = this.allResults.length;

    console.log(`Scenarios: ${passed}/${total} passed\n`);

    this.allResults.forEach((result) => {
      const status = result.passed ? "✅" : "❌";
      console.log(`${status} ${result.scenario}`);
      console.log(
        `   Mutation: p50=${result.mutationLatency.p50.toFixed(
          1
        )}ms, p95=${result.mutationLatency.p95.toFixed(1)}ms`
      );
      console.log(
        `   Throughput: ${result.throughput.toFixed(
          1
        )} mut/sec, Success: ${result.successRate.toFixed(1)}%`
      );
      if (!result.passed) {
        result.issues.forEach((issue) => console.log(`   ⚠️  ${issue}`));
      }
      console.log();
    });

    if (passed === total) {
      console.log(
        "🎉 All benchmarks passed! System meets authorization requirements.\n"
      );
    } else {
      console.log("⚠️  Some benchmarks failed. Review issues and optimize.\n");
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Predefined benchmark scenarios
const SCENARIOS = {
  light: [
    {
      name: "Light Load",
      clients: 5,
      mutationsPerClient: 10,
      description: "Baseline performance with minimal load",
    },
  ],
  medium: [
    {
      name: "Medium Load",
      clients: 20,
      mutationsPerClient: 50,
      description: "Typical production workload",
    },
  ],
  heavy: [
    {
      name: "Heavy Load",
      clients: 50,
      mutationsPerClient: 100,
      description: "Peak traffic simulation",
    },
  ],
  full: [
    {
      name: "Light Load",
      clients: 5,
      mutationsPerClient: 10,
      description: "Baseline performance with minimal load",
    },
    {
      name: "Medium Load",
      clients: 20,
      mutationsPerClient: 50,
      description: "Typical production workload",
    },
    {
      name: "Heavy Load",
      clients: 50,
      mutationsPerClient: 100,
      description: "Peak traffic simulation",
    },
  ],
};

function parseArgs(): BenchmarkConfig {
  const args = process.argv.slice(2);
  let scenarioKey: keyof typeof SCENARIOS = "medium";
  let verbose = false;

  args.forEach((arg) => {
    if (arg.startsWith("--scenario=")) {
      const key = arg.split("=")[1] as keyof typeof SCENARIOS;
      if (SCENARIOS[key]) {
        scenarioKey = key;
      }
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    }
  });

  return {
    workerUrl: "https://kuzu-auth-dev-worker-v2.logan-607.workers.dev",
    orgId: "org_fresh_dec29", // Use existing org instead of creating new one each time
    scenarios: SCENARIOS[scenarioKey],
    warmupRounds: 1,
    verbose,
  };
}

async function main() {
  const config = parseArgs();
  const runner = new BenchmarkRunner(config);

  try {
    await runner.run();

    const allPassed = runner["allResults"].every((r) => r.passed);
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
