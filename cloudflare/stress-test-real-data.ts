/**
 * Stress Test with Real Graph Data
 *
 * Tests authorization system with real user/group/resource data
 * Includes transitive group permissions and inheritance
 */

import * as fs from "fs";
import * as path from "path";

const WORKER_URL =
  process.env.WORKER_URL ||
  "https://kuzu-auth-dev-worker.logan-607.workers.dev";
const ORG_ID = "default";

interface TestResult {
  operation: string;
  success: number;
  failed: number;
  totalTime: number;
  avgLatency: number;
  p50: number;
  p95: number;
  p99: number;
  opsPerSec: number;
}

interface Permission {
  from: string;
  to: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

// Load CSV data
function loadCSV(filename: string): string[][] {
  const dataPath = path.join(__dirname, "..", "data", "csv", filename);
  const content = fs.readFileSync(dataPath, "utf-8");
  const lines = content.trim().split("\n");
  return lines.slice(1).map((line) => {
    // Simple CSV parser
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
}

// Load test data
console.log("📂 Loading test data...");
const userPermissions = loadCSV("user_permissions.csv");
const groupPermissions = loadCSV("group_permissions.csv");
const memberOf = loadCSV("member_of.csv");

console.log(`  User Permissions: ${userPermissions.length}`);
console.log(`  Group Permissions: ${groupPermissions.length}`);
console.log(`  Member Of: ${memberOf.length}`);
console.log();

/**
 * Make a permission check request
 */
async function checkPermission(
  user: string,
  resource: string,
  action: string
): Promise<{ allowed: boolean; latency: number }> {
  const startTime = Date.now();

  const response = await fetch(`${WORKER_URL}/org/${ORG_ID}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, resource, action }),
  });

  const latency = Date.now() - startTime;
  const result = await response.json();

  return {
    allowed: result.allowed,
    latency,
  };
}

/**
 * Calculate percentiles
 */
function calculatePercentiles(latencies: number[]): {
  p50: number;
  p95: number;
  p99: number;
} {
  const sorted = latencies.slice().sort((a, b) => a - b);
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

/**
 * Run stress test
 */
async function runStressTest(
  name: string,
  operations: Array<() => Promise<any>>,
  concurrency: number = 10
): Promise<TestResult> {
  console.log(`🔥 Running: ${name}`);
  console.log(
    `   Operations: ${operations.length}, Concurrency: ${concurrency}`
  );

  const startTime = Date.now();
  const latencies: number[] = [];
  let success = 0;
  let failed = 0;

  // Run operations with concurrency
  const chunks: Array<Array<() => Promise<any>>> = [];
  for (let i = 0; i < operations.length; i += concurrency) {
    chunks.push(operations.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const results = await Promise.allSettled(
      chunk.map(async (op) => {
        const opStartTime = Date.now();
        try {
          await op();
          latencies.push(Date.now() - opStartTime);
          success++;
        } catch (error) {
          failed++;
          throw error;
        }
      })
    );
  }

  const totalTime = Date.now() - startTime;
  const percentiles = calculatePercentiles(latencies);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const opsPerSec = (operations.length / totalTime) * 1000;

  const result: TestResult = {
    operation: name,
    success,
    failed,
    totalTime,
    avgLatency: Math.round(avgLatency),
    p50: percentiles.p50,
    p95: percentiles.p95,
    p99: percentiles.p99,
    opsPerSec: Math.round(opsPerSec),
  };

  console.log(`   ✅ Success: ${success}, ❌ Failed: ${failed}`);
  console.log(`   ⏱️  Total: ${totalTime}ms, Avg: ${result.avgLatency}ms`);
  console.log(
    `   📊 p50: ${result.p50}ms, p95: ${result.p95}ms, p99: ${result.p99}ms`
  );
  console.log(`   🚀 ${result.opsPerSec} ops/sec`);
  console.log();

  return result;
}

/**
 * Save results to JSON file
 */
function saveResults(results: TestResult[], stats: any) {
  const resultsDir = path.join(__dirname, "..", "results");

  // Create results directory if it doesn't exist
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const filename = `cloudflare-stress-test-${timestamp}.json`;
  const filepath = path.join(resultsDir, filename);

  const output = {
    timestamp: new Date().toISOString(),
    environment: {
      workerUrl: WORKER_URL,
      orgId: ORG_ID,
      platform: "Cloudflare Workers",
      architecture: "Multi-tenant Durable Objects",
      storage: "R2 CSV",
    },
    dataset: stats,
    tests: results.map((r) => ({
      name: r.operation,
      operations: r.success + r.failed,
      success: r.success,
      failed: r.failed,
      totalTimeMs: r.totalTime,
      avgLatencyMs: r.avgLatency,
      p50Ms: r.p50,
      p95Ms: r.p95,
      p99Ms: r.p99,
      opsPerSec: r.opsPerSec,
    })),
    summary: {
      totalOperations: results.reduce((sum, r) => sum + r.success, 0),
      totalTimeMs: results.reduce((sum, r) => sum + r.totalTime, 0),
      avgOpsPerSec: Math.round(
        (results.reduce((sum, r) => sum + r.success, 0) /
          results.reduce((sum, r) => sum + r.totalTime, 0)) *
          1000
      ),
      avgP95Ms: Math.round(
        results.reduce((sum, r) => sum + r.p95, 0) / results.length
      ),
    },
  };

  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Results saved to: ${filepath}`);
}

/**
 * Main stress test
 */
async function main() {
  console.log("🚀 Kuzu Authorization Stress Test (Real Graph Data)\n");
  console.log(`Worker: ${WORKER_URL}`);
  console.log(`Org: ${ORG_ID}\n`);

  // Get stats first for dataset info
  const statsResponse = await fetch(`${WORKER_URL}/org/${ORG_ID}/stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const datasetStats = await statsResponse.json();

  console.log("📊 Dataset Statistics:");
  console.log(`   Users: ${datasetStats.users}`);
  console.log(`   Groups: ${datasetStats.groups}`);
  console.log(`   Member Of: ${datasetStats.memberOfRelationships}`);
  console.log(`   Inherits From: ${datasetStats.inheritsFromRelationships}`);
  console.log(`   User Permissions: ${datasetStats.userPermissions}`);
  console.log(`   Group Permissions: ${datasetStats.groupPermissions}`);
  console.log();

  const results: TestResult[] = [];

  // Test 1: Direct user permissions (should be fast and allowed)
  console.log("═══════════════════════════════════════════════");
  console.log("Test 1: Direct User Permissions (1000 checks)");
  console.log("═══════════════════════════════════════════════\n");

  const directPermChecks = userPermissions.slice(0, 1000).map((perm) => {
    const [user, resource, canCreate, canRead, canUpdate, canDelete] = perm;
    // Pick an action that's allowed
    let action = "read";
    if (canCreate === "True" || canCreate === "true") action = "create";
    else if (canRead === "True" || canRead === "true") action = "read";
    else if (canUpdate === "True" || canUpdate === "true") action = "update";
    else if (canDelete === "True" || canDelete === "true") action = "delete";

    return () => checkPermission(user, resource, action);
  });

  results.push(
    await runStressTest("Direct User Permissions", directPermChecks, 20)
  );

  // Test 2: Group permissions (requires membership lookup)
  console.log("═══════════════════════════════════════════════");
  console.log("Test 2: Group Permissions via Membership (1000 checks)");
  console.log("═══════════════════════════════════════════════\n");

  const groupPermChecks: Array<() => Promise<any>> = [];
  for (let i = 0; i < Math.min(1000, memberOf.length); i++) {
    const [user, group] = memberOf[i];

    // Find a permission for this group
    const groupPerm = groupPermissions.find((gp) => gp[0] === group);
    if (groupPerm) {
      const [, resource, canCreate, canRead, canUpdate, canDelete] = groupPerm;
      let action = "read";
      if (canCreate === "True") action = "create";
      else if (canRead === "True") action = "read";
      else if (canUpdate === "True") action = "update";
      else if (canDelete === "True") action = "delete";

      groupPermChecks.push(() => checkPermission(user, resource, action));
    }
  }

  results.push(await runStressTest("Group Permissions", groupPermChecks, 20));

  // Test 3: Mixed workload (80% reads, 20% denied)
  console.log("═══════════════════════════════════════════════");
  console.log("Test 3: Mixed Workload (2000 checks, 80/20 split)");
  console.log("═══════════════════════════════════════════════\n");

  const mixedChecks: Array<() => Promise<any>> = [];

  // 80% allowed checks
  for (let i = 0; i < 1600; i++) {
    const perm = userPermissions[i % userPermissions.length];
    const [user, resource, canCreate, canRead] = perm;
    const action = canRead === "True" || canRead === "true" ? "read" : "create";
    mixedChecks.push(() => checkPermission(user, resource, action));
  }

  // 20% denied checks (random user/resource combinations)
  for (let i = 0; i < 400; i++) {
    const randomUser = `user_${String(
      Math.floor(Math.random() * 5000)
    ).padStart(6, "0")}`;
    const randomResource = `resource_${String(
      Math.floor(Math.random() * 3000)
    ).padStart(6, "0")}`;
    mixedChecks.push(() => checkPermission(randomUser, randomResource, "read"));
  }

  // Shuffle
  for (let i = mixedChecks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mixedChecks[i], mixedChecks[j]] = [mixedChecks[j], mixedChecks[i]];
  }

  results.push(await runStressTest("Mixed Workload", mixedChecks, 30));

  // Test 4: High concurrency burst
  console.log("═══════════════════════════════════════════════");
  console.log("Test 4: High Concurrency Burst (1000 checks, 50 concurrent)");
  console.log("═══════════════════════════════════════════════\n");

  const burstChecks = userPermissions.slice(0, 1000).map((perm) => {
    const [user, resource] = perm;
    return () => checkPermission(user, resource, "read");
  });

  results.push(await runStressTest("High Concurrency Burst", burstChecks, 50));

  // Summary
  console.log("\n═══════════════════════════════════════════════");
  console.log("📊 SUMMARY");
  console.log("═══════════════════════════════════════════════\n");

  console.log(
    "Operation                              | Ops/sec | Avg    | p50 | p95  | p99"
  );
  console.log(
    "---------------------------------------|---------|--------|-----|------|-----"
  );

  for (const result of results) {
    const name = result.operation.padEnd(38);
    const ops = String(result.opsPerSec).padStart(7);
    const avg = `${result.avgLatency}ms`.padStart(6);
    const p50 = `${result.p50}ms`.padStart(3);
    const p95 = `${result.p95}ms`.padStart(4);
    const p99 = `${result.p99}ms`.padStart(4);

    console.log(`${name} | ${ops} | ${avg} | ${p50} | ${p95} | ${p99}`);
  }

  console.log();

  // Calculate totals
  const totalOps = results.reduce((sum, r) => sum + r.success, 0);
  const totalTime = results.reduce((sum, r) => sum + r.totalTime, 0);
  const avgOpsPerSec = Math.round((totalOps / totalTime) * 1000);
  const avgP95 = Math.round(
    results.reduce((sum, r) => sum + r.p95, 0) / results.length
  );

  console.log(
    `\n🎯 Overall: ${totalOps} operations, ${avgOpsPerSec} ops/sec, ${avgP95}ms p95`
  );
  console.log();

  // Save results to JSON
  saveResults(results, datasetStats);
}

main().catch(console.error);
