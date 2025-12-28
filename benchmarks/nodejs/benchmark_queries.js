#!/usr/bin/env node
/**
 * Node.js Query Benchmarks for KuzuDB Authorization
 * Tests the same query patterns as Python benchmarks
 */

const kuzu = require("kuzu");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../../db/bench_csv_copy_nodejs"); // Use Node.js loading benchmark DB
const RESULTS_DIR = path.join(__dirname, "../../results");
const WARMUP_RUNS = 10;
const BENCHMARK_RUNS = 100;

// Authorization query patterns (matching Python benchmarks exactly)
// Node.js kuzu doesn't support parameterized queries, so values are embedded
const QUERIES = [
  {
    name: "Direct Permission Check (Read)",
    description: "Check if user has direct read permission on resource",
    query: `
      MATCH (u:User {id: 'user_1'})-[p:HAS_PERMISSION_USER]->(r:Resource {id: 'resource_1'})
      WHERE p.can_read = true
      RETURN u.id as user_id, r.id as resource_id, p.can_read
    `,
  },
  {
    name: "Group-Based Permission Check",
    description: "Check if user has permission via group membership",
    query: `
      MATCH (u:User {id: 'user_10'})-[:MEMBER_OF]->(g:UserGroup)-[p:HAS_PERMISSION_GROUP]->(r:Resource {id: 'resource_100'})
      WHERE p.can_read = true
      RETURN u.id as user_id, g.id as group_id, r.id as resource_id
    `,
  },
  {
    name: "Combined Permission Check (Direct + Group)",
    description: "Check both direct and group-based permissions",
    query: `
      MATCH (u:User {id: 'user_100'})
      MATCH (r:Resource {id: 'resource_500'})
      OPTIONAL MATCH (u)-[p1:HAS_PERMISSION_USER]->(r)
      OPTIONAL MATCH (u)-[:MEMBER_OF]->(g:UserGroup)-[p2:HAS_PERMISSION_GROUP]->(r)
      WHERE p1.can_read = true OR p2.can_read = true
      RETURN u.id, r.id, 
             CASE WHEN p1.can_read = true THEN true ELSE false END as direct_read,
             CASE WHEN p2.can_read = true THEN true ELSE false END as group_read
    `,
  },
  {
    name: "List User's Readable Resources",
    description: "Get all resources user can read (direct permissions)",
    query: `
      MATCH (u:User {id: 'user_50'})-[p:HAS_PERMISSION_USER]->(r:Resource)
      WHERE p.can_read = true
      RETURN r.id as resource_id, r.type as resource_type
      LIMIT 10
    `,
  },
  {
    name: "List User's Readable Resources (Via Groups)",
    description: "Get all resources user can read via group membership",
    query: `
      MATCH (u:User {id: 'user_200'})-[:MEMBER_OF]->(g:UserGroup)-[p:HAS_PERMISSION_GROUP]->(r:Resource)
      WHERE p.can_read = true
      RETURN DISTINCT r.id as resource_id, r.type as resource_type
      LIMIT 10
    `,
  },
  {
    name: "User's Groups (Direct Membership)",
    description: "Get all groups user belongs to",
    query: `
      MATCH (u:User {id: 'user_100'})-[:MEMBER_OF]->(g:UserGroup)
      RETURN g.id as group_id, g.name as group_name
    `,
  },
  {
    name: "Who Can Read Resource (Direct)",
    description: "Get all users with direct read permission on resource",
    query: `
      MATCH (u:User)-[p:HAS_PERMISSION_USER]->(r:Resource {id: 'resource_250'})
      WHERE p.can_read = true
      RETURN u.id as user_id
      LIMIT 20
    `,
  },
  {
    name: "Which Groups Can Read Resource",
    description: "Get all groups with read permission on resource",
    query: `
      MATCH (g:UserGroup)-[p:HAS_PERMISSION_GROUP]->(r:Resource {id: 'resource_500'})
      WHERE p.can_read = true
      RETURN g.id as group_id
    `,
  },
  {
    name: "Get All Permissions (User on Resource)",
    description: "Get all CRUD permissions for user on resource",
    query: `
      MATCH (u:User {id: 'user_500'})-[p:HAS_PERMISSION_USER]->(r:Resource {id: 'resource_1000'})
      RETURN p.can_create as can_create, p.can_read as can_read, p.can_update as can_update, p.can_delete as can_delete
    `,
  },
  {
    name: "Count User's Resources by Permission",
    description: "Count resources user can read vs write",
    query: `
      MATCH (u:User {id: 'user_1000'})-[p:HAS_PERMISSION_USER]->(r:Resource)
      RETURN 
        COUNT(CASE WHEN p.can_read = true THEN 1 END) as readable,
        COUNT(CASE WHEN p.can_update = true THEN 1 END) as writable
    `,
  },
];

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, index)];
}

async function benchmarkQuery(conn, query, params, name) {
  console.log(`\n  Benchmarking: ${name}`);

  // Warmup
  console.log(`    Warmup (${WARMUP_RUNS} runs)...`);
  for (let i = 0; i < WARMUP_RUNS; i++) {
    try {
      const result = await conn.query(query);
      await result.getAll(); // Consume results
    } catch (error) {
      throw new Error(`Warmup failed: ${error.message}`);
    }
  }

  // Actual benchmark
  console.log(`    Running benchmark (${BENCHMARK_RUNS} runs)...`);
  const times = [];

  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    const start = process.hrtime.bigint();
    try {
      const result = await conn.query(query);
      await result.getAll(); // Consume results
    } catch (error) {
      throw new Error(`Benchmark run ${i} failed: ${error.message}`);
    }
    const end = process.hrtime.bigint();

    const durationMs = Number(end - start) / 1_000_000;
    times.push(durationMs);
  }

  // Calculate statistics
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const p50 = percentile(times, 0.5);
  const p95 = percentile(times, 0.95);
  const p99 = percentile(times, 0.99);

  console.log(
    `    ✓ Avg: ${avgTime.toFixed(2)}ms | p50: ${p50.toFixed(
      2
    )}ms | p95: ${p95.toFixed(2)}ms | p99: ${p99.toFixed(2)}ms`
  );

  return {
    query_name: name,
    description: "",
    query: query,
    params: {},
    avg_time_ms: parseFloat(avgTime.toFixed(3)),
    min_time_ms: parseFloat(minTime.toFixed(3)),
    max_time_ms: parseFloat(maxTime.toFixed(3)),
    p50_time_ms: parseFloat(p50.toFixed(3)),
    p95_time_ms: parseFloat(p95.toFixed(3)),
    p99_time_ms: parseFloat(p99.toFixed(3)),
    times_ms: times.map((t) => parseFloat(t.toFixed(3))),
  };
}

async function main() {
  console.log("\n=== Node.js Query Benchmarks for KuzuDB ===\n");

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Error: Database not found at ${DB_PATH}`);
    console.error(
      "Please run loading benchmarks first to create the database."
    );
    process.exit(1);
  }

  console.log(`Database: ${DB_PATH}`);
  console.log(`Warmup runs: ${WARMUP_RUNS}`);
  console.log(`Benchmark runs: ${BENCHMARK_RUNS}`);
  console.log(`Total queries: ${QUERIES.length}\n`);

  let db, conn;

  try {
    // Open database
    console.log("Opening database...");
    db = new kuzu.Database(DB_PATH);
    conn = new kuzu.Connection(db);
    console.log("✓ Database opened");

    // Run all query benchmarks
    const results = [];

    for (let i = 0; i < QUERIES.length; i++) {
      const query = QUERIES[i];
      console.log(`\n[${i + 1}/${QUERIES.length}] ${query.name}`);

      try {
        const result = await benchmarkQuery(
          conn,
          query.query,
          null,
          query.name
        );
        result.description = query.description;
        results.push(result);
      } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);
        results.push({
          query_name: query.name,
          description: query.description,
          error: error.message,
          failed: true,
        });
      }
    }

    // Calculate overall statistics
    const successfulResults = results.filter((r) => !r.failed);
    const avgTimes = successfulResults.map((r) => r.avg_time_ms);
    const p95Times = successfulResults.map((r) => r.p95_time_ms);

    const overallAvg = avgTimes.reduce((a, b) => a + b, 0) / avgTimes.length;
    const overallP95 = p95Times.reduce((a, b) => a + b, 0) / p95Times.length;

    console.log("\n=== Summary ===\n");
    console.log(
      `Successful queries: ${successfulResults.length}/${QUERIES.length}`
    );
    console.log(`Overall average: ${overallAvg.toFixed(2)}ms`);
    console.log(`Overall p95: ${overallP95.toFixed(2)}ms`);

    // Save results
    const outputPath = path.join(
      RESULTS_DIR,
      "nodejs_query_benchmark_results.json"
    );
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n✓ Results saved to: ${outputPath}`);

    // Print summary table
    console.log("\n=== Query Performance Summary ===\n");
    console.log(
      "Query".padEnd(50) + "Avg (ms)".padStart(10) + "p95 (ms)".padStart(10)
    );
    console.log("-".repeat(70));

    for (const result of successfulResults) {
      const name = result.query_name.substring(0, 49);
      console.log(
        name.padEnd(50) +
          result.avg_time_ms.toFixed(2).padStart(10) +
          result.p95_time_ms.toFixed(2).padStart(10)
      );
    }
  } catch (error) {
    console.error("\n✗ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup
    if (conn) conn.close();
    if (db) db.close();
  }
}

// Run benchmarks
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
