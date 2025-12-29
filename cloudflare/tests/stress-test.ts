/**
 * Stress Test for Kuzu Auth on Cloudflare
 *
 * Tests the system under high load to ensure it can handle:
 * - Concurrent permission checks
 * - Cloudflare's 128MB memory limit
 * - CPU time constraints
 * - Durable Object throughput
 */

import { AuthClient } from "@kuzu-auth/sdk";

const WORKER_URL = process.env.WORKER_URL || "http://localhost:8787";
const NUM_USERS = 1000;
const NUM_RESOURCES = 500;
const NUM_PERMISSIONS = ["read", "write", "delete", "admin"];
const CONCURRENT_REQUESTS = 100;
const TOTAL_OPERATIONS = 10000;

interface TestResults {
  totalOperations: number;
  successfulChecks: number;
  failedChecks: number;
  totalDuration: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  errors: string[];
}

async function main() {
  console.log("========================================");
  console.log("  Kuzu Auth Stress Test");
  console.log("========================================");
  console.log();
  console.log(`Worker URL: ${WORKER_URL}`);
  console.log(`Users: ${NUM_USERS}`);
  console.log(`Resources: ${NUM_RESOURCES}`);
  console.log(`Concurrent Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`Total Operations: ${TOTAL_OPERATIONS}`);
  console.log();

  const client = new AuthClient({ workerUrl: WORKER_URL });

  // Health check
  console.log("[1/5] Health check...");
  try {
    const health = await client.health();
    console.log(`✓ Service healthy: ${health.status} (${health.environment})`);
  } catch (error) {
    console.error("✗ Health check failed:", error);
    process.exit(1);
  }
  console.log();

  // Seed data
  console.log("[2/5] Seeding test data...");
  await seedData(client);
  console.log();

  // Stress test: Concurrent permission checks
  console.log("[3/5] Running concurrent permission check stress test...");
  const checkResults = await stressTestChecks(client);
  printResults("Permission Checks", checkResults);
  console.log();

  // Stress test: Write operations
  console.log("[4/5] Running write operation stress test...");
  const writeResults = await stressTestWrites(client);
  printResults("Write Operations", writeResults);
  console.log();

  // Get final stats
  console.log("[5/5] Final statistics...");
  const stats = await client.stats();
  console.log(`Users: ${stats.users}`);
  console.log(`Resources: ${stats.resources}`);
  console.log(`Permissions: ${stats.permissions}`);
  console.log(`Total Records: ${stats.recordCount}`);
  console.log();

  console.log("========================================");
  console.log("  Stress Test Complete ✓");
  console.log("========================================");
}

/**
 * Seed test data
 */
async function seedData(client: AuthClient) {
  const operations: any[] = [];

  // Create permissions for random user-resource pairs
  for (let i = 0; i < 1000; i++) {
    const userId = `user:user${Math.floor(Math.random() * NUM_USERS)}`;
    const resourceId = `resource:doc${Math.floor(
      Math.random() * NUM_RESOURCES
    )}`;
    const permission =
      NUM_PERMISSIONS[Math.floor(Math.random() * NUM_PERMISSIONS.length)];

    operations.push({
      action: "grant",
      user: userId,
      permission,
      resource: resourceId,
    });
  }

  // Bulk grant in chunks
  const chunkSize = 50;
  for (let i = 0; i < operations.length; i += chunkSize) {
    const chunk = operations.slice(i, i + chunkSize);
    await client.bulk(chunk);
    process.stdout.write(
      `\rSeeded ${Math.min(i + chunkSize, operations.length)}/${
        operations.length
      } permissions`
    );
  }
  console.log(" ✓");
}

/**
 * Stress test concurrent permission checks
 */
async function stressTestChecks(client: AuthClient): Promise<TestResults> {
  const latencies: number[] = [];
  const errors: string[] = [];
  let successful = 0;
  let failed = 0;

  const startTime = Date.now();

  // Generate check operations
  const operations: Promise<void>[] = [];

  for (let i = 0; i < TOTAL_OPERATIONS; i++) {
    const userId = `user:user${Math.floor(Math.random() * NUM_USERS)}`;
    const resourceId = `resource:doc${Math.floor(
      Math.random() * NUM_RESOURCES
    )}`;
    const permission =
      NUM_PERMISSIONS[Math.floor(Math.random() * NUM_PERMISSIONS.length)];

    operations.push(
      (async () => {
        const opStart = Date.now();
        try {
          const result = await client.checkWithMetadata({
            user: userId,
            permission,
            resource: resourceId,
          });
          latencies.push(result.latency_ms);
          successful++;
        } catch (error) {
          failed++;
          errors.push(error instanceof Error ? error.message : "Unknown error");
        }
      })()
    );

    // Process in batches to limit concurrency
    if (operations.length >= CONCURRENT_REQUESTS) {
      await Promise.all(operations.splice(0, CONCURRENT_REQUESTS));
      process.stdout.write(
        `\rProcessed ${successful + failed}/${TOTAL_OPERATIONS} checks`
      );
    }
  }

  // Process remaining
  await Promise.all(operations);
  console.log();

  const totalDuration = Date.now() - startTime;

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  return {
    totalOperations: TOTAL_OPERATIONS,
    successfulChecks: successful,
    failedChecks: failed,
    totalDuration,
    avgLatency,
    p50Latency: p50,
    p95Latency: p95,
    p99Latency: p99,
    throughput: (successful / totalDuration) * 1000,
    errors: errors.slice(0, 10), // First 10 errors
  };
}

/**
 * Stress test write operations
 */
async function stressTestWrites(client: AuthClient): Promise<TestResults> {
  const latencies: number[] = [];
  const errors: string[] = [];
  let successful = 0;
  let failed = 0;

  const startTime = Date.now();

  for (let i = 0; i < 1000; i++) {
    const userId = `user:stress${i}`;
    const resourceId = `resource:write${i % 100}`;
    const permission = "write";

    const opStart = Date.now();
    try {
      await client.grant({ user: userId, permission, resource: resourceId });
      latencies.push(Date.now() - opStart);
      successful++;
    } catch (error) {
      failed++;
      errors.push(error instanceof Error ? error.message : "Unknown error");
    }

    if (i % 50 === 0) {
      process.stdout.write(`\rProcessed ${i}/1000 writes`);
    }
  }
  console.log();

  const totalDuration = Date.now() - startTime;

  latencies.sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  return {
    totalOperations: 1000,
    successfulChecks: successful,
    failedChecks: failed,
    totalDuration,
    avgLatency,
    p50Latency: p50,
    p95Latency: p95,
    p99Latency: p99,
    throughput: (successful / totalDuration) * 1000,
    errors: errors.slice(0, 10),
  };
}

/**
 * Print test results
 */
function printResults(name: string, results: TestResults) {
  console.log(`\n=== ${name} Results ===`);
  console.log(`Total Operations: ${results.totalOperations}`);
  console.log(`Successful: ${results.successfulChecks}`);
  console.log(`Failed: ${results.failedChecks}`);
  console.log(`Total Duration: ${results.totalDuration}ms`);
  console.log(`Throughput: ${results.throughput.toFixed(2)} ops/sec`);
  console.log();
  console.log(`Latency Statistics:`);
  console.log(`  Average: ${results.avgLatency.toFixed(2)}ms`);
  console.log(`  p50: ${results.p50Latency.toFixed(2)}ms`);
  console.log(`  p95: ${results.p95Latency.toFixed(2)}ms`);
  console.log(`  p99: ${results.p99Latency.toFixed(2)}ms`);

  if (results.errors.length > 0) {
    console.log();
    console.log(`Errors (showing first 10):`);
    results.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
  }

  // Performance assessment
  console.log();
  if (results.p95Latency < 5 && results.failedChecks === 0) {
    console.log("✅ EXCELLENT: p95 < 5ms, no failures");
  } else if (
    results.p95Latency < 10 &&
    results.failedChecks < results.totalOperations * 0.01
  ) {
    console.log("✓ GOOD: p95 < 10ms, <1% failures");
  } else if (results.p95Latency < 50) {
    console.log("⚠️  ACCEPTABLE: p95 < 50ms, but may need optimization");
  } else {
    console.log("❌ POOR: p95 > 50ms or high failure rate");
  }
}

main().catch(console.error);
