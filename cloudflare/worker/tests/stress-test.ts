#!/usr/bin/env node
/**
 * WebSocket Stress Test Suite
 *
 * Tests multi-client scenarios without browser dependencies:
 * - Concurrent client connections
 * - Mutation broadcast synchronization
 * - Reconnection and catch-up sync
 * - High-frequency mutation throughput
 *
 * Usage:
 *   npm run stress-test
 *   npm run stress-test -- --clients=50 --mutations=100
 */

import WebSocket from "ws";
import fetch from "node-fetch";

interface StressTestConfig {
  workerUrl: string;
  orgId: string;
  numClients: number;
  numMutations: number;
  mutationDelay: number; // ms between mutations
  reconnectTest: boolean;
  verbose: boolean;
}

interface MutationMessage {
  type: "mutation";
  version: number;
  mutation: {
    type: "grant" | "revoke";
    user: string;
    resource: string;
    permission: string;
    granted_at?: string;
    granted_by?: string;
  };
}

interface ClientStats {
  id: string;
  connected: boolean;
  messagesReceived: number;
  mutationsSent: number;
  mutationsAcked: number;
  lastVersion: number;
  errors: number;
  connectTime?: number;
  disconnectTime?: number;
}

class StressTestClient {
  private ws?: WebSocket;
  private stats: ClientStats;
  private config: StressTestConfig;
  private reconnectTimer?: NodeJS.Timeout;
  private versionHistory = new Set<number>();

  constructor(clientId: string, config: StressTestConfig) {
    this.config = config;
    this.stats = {
      id: clientId,
      connected: false,
      messagesReceived: 0,
      mutationsSent: 0,
      mutationsAcked: 0,
      lastVersion: 0,
      errors: 0,
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const wsUrl = `${this.config.workerUrl.replace(
        "https://",
        "wss://"
      )}/org/${this.config.orgId}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.on("open", () => {
        this.stats.connected = true;
        this.stats.connectTime = Date.now() - startTime;

        // Send initial version
        this.send({ type: "version", version: this.stats.lastVersion });

        if (this.config.verbose) {
          console.log(
            `[${this.stats.id}] Connected in ${this.stats.connectTime}ms`
          );
        }
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("error", (error) => {
        this.stats.errors++;
        if (this.config.verbose) {
          console.error(`[${this.stats.id}] WebSocket error:`, error.message);
        }
      });

      this.ws.on("close", () => {
        this.stats.connected = false;
        this.stats.disconnectTime = Date.now();
        if (this.config.verbose) {
          console.log(`[${this.stats.id}] Disconnected`);
        }

        if (this.config.reconnectTest && !this.reconnectTimer) {
          // Auto-reconnect after 1 second
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect().catch(console.error);
          }, 1000);
        }
      });

      // Timeout connection attempt
      setTimeout(() => {
        if (!this.stats.connected) {
          reject(new Error(`Connection timeout for ${this.stats.id}`));
        }
      }, 10000);
    });
  }

  private handleMessage(data: string): void {
    this.stats.messagesReceived++;

    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case "mutation":
          const mutation = message as MutationMessage;
          this.stats.lastVersion = mutation.version;
          this.versionHistory.add(mutation.version);

          if (this.config.verbose) {
            console.log(
              `[${this.stats.id}] Received mutation v${mutation.version}: ${mutation.mutation.type}`
            );
          }
          break;

        case "ack":
          this.stats.mutationsAcked++;

          // Also track ack version if present
          if (message.version) {
            this.stats.lastVersion = message.version;
            this.versionHistory.add(message.version);
          }

          if (this.config.verbose) {
            console.log(
              `[${this.stats.id}] Mutation acknowledged (v${message.version}):`,
              message.success ? "success" : "failed"
            );
          }
          break;

        case "pong":
          // Heartbeat response
          break;

        case "error":
          this.stats.errors++;
          if (this.config.verbose) {
            console.error(`[${this.stats.id}] Server error:`, message.message);
          }
          break;

        default:
          if (this.config.verbose) {
            console.log(
              `[${this.stats.id}] Unknown message type:`,
              message.type
            );
          }
      }
    } catch (error) {
      this.stats.errors++;
      if (this.config.verbose) {
        console.error(`[${this.stats.id}] Failed to parse message:`, error);
      }
    }
  }

  async sendMutation(
    user: string,
    resource: string,
    operation: "grant" | "revoke"
  ): Promise<void> {
    if (!this.ws || !this.stats.connected) {
      throw new Error(`Client ${this.stats.id} not connected`);
    }

    const mutation = {
      type: "mutate",
      op: operation,
      user,
      resource,
      permission: "read",
    };

    this.send(mutation);
    this.stats.mutationsSent++;
  }

  private send(data: any): void {
    if (this.ws && this.stats.connected) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  getStats(): ClientStats & { versionsReceived: number; versionGaps: number } {
    // Calculate version gaps
    const versions = Array.from(this.versionHistory).sort((a, b) => a - b);
    let gaps = 0;
    for (let i = 1; i < versions.length; i++) {
      if (versions[i] !== versions[i - 1] + 1) {
        gaps++;
      }
    }

    return {
      ...this.stats,
      versionsReceived: this.versionHistory.size,
      versionGaps: gaps,
    };
  }
}

class StressTestRunner {
  private config: StressTestConfig;
  private clients: StressTestClient[] = [];
  private startTime = 0;

  constructor(config: StressTestConfig) {
    this.config = config;
  }

  async run(): Promise<void> {
    console.log("\n🔥 WebSocket Stress Test Starting...");
    console.log(`   Workers: ${this.config.workerUrl}`);
    console.log(`   Org: ${this.config.orgId}`);
    console.log(`   Clients: ${this.config.numClients}`);
    console.log(`   Mutations: ${this.config.numMutations} per client`);
    console.log("");

    this.startTime = Date.now();

    try {
      await this.testConnectionSetup();
      await this.testConcurrentMutations();
      await this.testBroadcastSync();

      if (this.config.reconnectTest) {
        await this.testReconnection();
      }

      await this.printResults();
    } catch (error) {
      console.error("\n❌ Stress test failed:", error);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  private async testConnectionSetup(): Promise<void> {
    console.log(
      `\n📡 Test 1: Concurrent Connection Setup (${this.config.numClients} clients)`
    );

    const connectStart = Date.now();

    // Create clients
    this.clients = Array.from(
      { length: this.config.numClients },
      (_, i) => new StressTestClient(`client_${i}`, this.config)
    );

    // Connect all clients concurrently
    const connectionPromises = this.clients.map((client) => client.connect());
    await Promise.all(connectionPromises);

    const connectTime = Date.now() - connectStart;
    const connected = this.clients.filter((c) => c.getStats().connected).length;

    console.log(
      `   ✅ ${connected}/${this.config.numClients} clients connected`
    );
    console.log(`   ⏱️  Total time: ${connectTime}ms`);
    console.log(
      `   📊 Average: ${(connectTime / this.config.numClients).toFixed(
        2
      )}ms per client`
    );

    // Wait a bit for all connections to stabilize
    await this.sleep(1000);
  }

  private async testConcurrentMutations(): Promise<void> {
    console.log(
      `\n⚡ Test 2: Concurrent Mutations (${this.config.numMutations} mutations from ${this.config.numClients} clients)`
    );

    const mutationStart = Date.now();
    const totalMutations = this.config.numMutations * this.config.numClients;

    // Each client sends mutations concurrently
    const mutationPromises = this.clients.map(async (client, clientIdx) => {
      for (let i = 0; i < this.config.numMutations; i++) {
        const user = `stress_user_${clientIdx}_${i}`;
        const resource = `stress_resource_${clientIdx}_${i}`;
        const operation = i % 2 === 0 ? "grant" : "revoke";

        await client.sendMutation(user, resource, operation);

        if (this.config.mutationDelay > 0) {
          await this.sleep(this.config.mutationDelay);
        }
      }
    });

    await Promise.all(mutationPromises);

    // Wait for all acks and broadcasts
    await this.sleep(2000);

    const mutationTime = Date.now() - mutationStart;
    const totalSent = this.clients.reduce(
      (sum, c) => sum + c.getStats().mutationsSent,
      0
    );
    const totalAcked = this.clients.reduce(
      (sum, c) => sum + c.getStats().mutationsAcked,
      0
    );

    console.log(`   ✅ Mutations sent: ${totalSent}`);
    console.log(`   ✅ Mutations acknowledged: ${totalAcked}`);
    console.log(`   ⏱️  Total time: ${mutationTime}ms`);
    console.log(
      `   📊 Throughput: ${(totalSent / (mutationTime / 1000)).toFixed(
        2
      )} mutations/sec`
    );
    console.log(
      `   📊 Average latency: ${(mutationTime / totalSent).toFixed(
        2
      )}ms per mutation`
    );
  }

  private async testBroadcastSync(): Promise<void> {
    console.log(`\n📢 Test 3: Broadcast Synchronization`);

    // Wait longer for all broadcasts to settle
    await this.sleep(3000);

    const stats = this.clients.map((c) => c.getStats());
    const totalMessages = stats.reduce((sum, s) => sum + s.messagesReceived, 0);
    const versionsReceived = stats.map((s) => s.versionsReceived);
    const versionGaps = stats.map((s) => s.versionGaps);

    const minVersions = Math.min(...versionsReceived);
    const maxVersions = Math.max(...versionsReceived);
    const avgVersions =
      versionsReceived.reduce((a, b) => a + b, 0) / versionsReceived.length;

    const totalGaps = versionGaps.reduce((a, b) => a + b, 0);

    console.log(`   ✅ Total messages received: ${totalMessages}`);
    console.log(
      `   📊 Versions per client: min=${minVersions}, max=${maxVersions}, avg=${avgVersions.toFixed(
        1
      )}`
    );
    console.log(`   📊 Version gaps detected: ${totalGaps} (should be 0)`);

    // Expected: each client should see all mutations from all clients
    const expectedVersions = this.config.numMutations * this.config.numClients;
    const syncRate = (avgVersions / expectedVersions) * 100;

    console.log(
      `   📊 Synchronization rate: ${syncRate.toFixed(
        1
      )}% (${avgVersions.toFixed(0)}/${expectedVersions} mutations)`
    );

    if (totalGaps > 0) {
      console.log(`   ⚠️  Warning: Version gaps indicate missed broadcasts`);
    }

    if (syncRate < 90) {
      console.log(
        `   ⚠️  Warning: Low sync rate - clients may not be receiving all broadcasts`
      );
    }
  }

  private async testReconnection(): Promise<void> {
    console.log(`\n🔄 Test 4: Reconnection & Catch-up Sync`);

    // Disconnect half the clients
    const toDisconnect = Math.floor(this.config.numClients / 2);
    console.log(`   📴 Disconnecting ${toDisconnect} clients...`);

    for (let i = 0; i < toDisconnect; i++) {
      this.clients[i].disconnect();
    }

    await this.sleep(500);

    // Send some mutations from connected clients
    console.log(`   ⚡ Sending mutations while clients disconnected...`);
    const connectedClients = this.clients.slice(toDisconnect);

    for (let i = 0; i < 10; i++) {
      const client = connectedClients[i % connectedClients.length];
      await client.sendMutation(
        `reconnect_user_${i}`,
        `reconnect_resource_${i}`,
        "grant"
      );
    }

    await this.sleep(1000);

    // Reconnect clients
    console.log(`   📡 Reconnecting clients...`);
    const reconnectPromises = this.clients
      .slice(0, toDisconnect)
      .map((client) => client.connect());
    await Promise.all(reconnectPromises);

    await this.sleep(2000);

    // Check if reconnected clients caught up
    const reconnectedStats = this.clients
      .slice(0, toDisconnect)
      .map((c) => c.getStats());
    const connected = reconnectedStats.filter((s) => s.connected).length;

    console.log(`   ✅ Reconnected: ${connected}/${toDisconnect} clients`);
    console.log(
      `   📊 Messages received after reconnect: ${reconnectedStats.reduce(
        (sum, s) => sum + s.messagesReceived,
        0
      )}`
    );
  }

  private async printResults(): Promise<void> {
    const totalTime = Date.now() - this.startTime;
    const stats = this.clients.map((c) => c.getStats());

    console.log("\n📊 Final Results:");
    console.log("─".repeat(60));

    const connected = stats.filter((s) => s.connected).length;
    const totalMessages = stats.reduce((sum, s) => sum + s.messagesReceived, 0);
    const totalSent = stats.reduce((sum, s) => sum + s.mutationsSent, 0);
    const totalAcked = stats.reduce((sum, s) => sum + s.mutationsAcked, 0);
    const totalErrors = stats.reduce((sum, s) => sum + s.errors, 0);

    console.log(`Total test time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`Connected clients: ${connected}/${this.config.numClients}`);
    console.log(`Messages received: ${totalMessages}`);
    console.log(`Mutations sent: ${totalSent}`);
    console.log(
      `Mutations acknowledged: ${totalAcked} (${(
        (totalAcked / totalSent) *
        100
      ).toFixed(1)}%)`
    );
    console.log(`Errors: ${totalErrors}`);

    if (
      totalErrors === 0 &&
      totalAcked === totalSent &&
      connected === this.config.numClients
    ) {
      console.log("\n✅ All tests passed!");
    } else {
      console.log("\n⚠️  Some tests had issues - check details above");
    }
  }

  private cleanup(): void {
    console.log("\n🧹 Cleaning up...");
    this.clients.forEach((client) => client.disconnect());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// CLI argument parsing
function parseArgs(): StressTestConfig {
  const args = process.argv.slice(2);
  const config: StressTestConfig = {
    workerUrl: "https://kuzu-auth-dev-worker-v2.logan-607.workers.dev",
    orgId: "org_stress_test",
    numClients: 10,
    numMutations: 10,
    mutationDelay: 0,
    reconnectTest: false,
    verbose: false,
  };

  args.forEach((arg) => {
    if (arg.startsWith("--clients=")) {
      config.numClients = parseInt(arg.split("=")[1]);
    } else if (arg.startsWith("--mutations=")) {
      config.numMutations = parseInt(arg.split("=")[1]);
    } else if (arg.startsWith("--delay=")) {
      config.mutationDelay = parseInt(arg.split("=")[1]);
    } else if (arg.startsWith("--org=")) {
      config.orgId = arg.split("=")[1];
    } else if (arg.startsWith("--url=")) {
      config.workerUrl = arg.split("=")[1];
    } else if (arg === "--reconnect") {
      config.reconnectTest = true;
    } else if (arg === "--verbose" || arg === "-v") {
      config.verbose = true;
    }
  });

  return config;
}

// Main execution
async function main() {
  const config = parseArgs();
  const runner = new StressTestRunner(config);

  try {
    await runner.run();
    process.exit(0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
