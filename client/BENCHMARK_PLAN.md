# Client-Side KuzuDB WASM Benchmark Plan

## Overview

Comprehensive benchmarking strategy for client-side authorization with KuzuDB WASM, measuring all critical performance metrics from initial load through permission checks.

## Benchmark Structure

### Location

```
client/benchmarks/
├── browser-benchmark.html      # Main benchmark harness
├── scenarios.ts                # Test scenario definitions
├── metrics-collector.ts        # Performance measurement utilities
└── README.md                   # Running instructions

results/client-benchmarks/
├── [timestamp]-cold-start.json
├── [timestamp]-permission-checks.json
├── [timestamp]-data-loading.json
└── [timestamp]-sync-performance.json
```

## Key Metrics to Measure

### 1. Initial Load Performance

**What**: First-time user experience
**Metrics**:

- WASM bundle download time (3.73 MB)
- WASM compilation time
- KuzuDB initialization time
- CSV data fetch time (from R2 via Durable Object)
- Graph construction time (5K users, 25K relationships)
- **Total cold start**: Target < 5s

**Test Approach**:

- Use `performance.mark()` and `performance.measure()`
- Test with clean cache (localStorage + IndexedDB cleared)
- Measure Network panel timing via Performance API
- Test on 3 connection speeds: Fast 3G, 4G, Desktop

### 2. Cached Load Performance (Service Worker)

**What**: Repeat visit experience
**Metrics**:

- WASM load from cache (Service Worker)
- Graph data load from IndexedDB
- KuzuDB initialization with cached data
- **Total warm start**: Target 50-100ms

**Test Approach**:

- Pre-populate Service Worker cache
- Pre-populate IndexedDB with graph data
- Measure time to ready state
- Compare with/without Service Worker

### 3. Permission Check Latency

**What**: Core authorization operation performance
**Metrics**:

- Direct permission check: `can(user, read, resource)`
- Group-based check: `can(user, read, resource)` via group membership
- Multi-hop check: 3-hop path traversal
- Complex query: FindAllResourcesUserCanAccess
- **Target**: < 1ms for direct, < 5ms for complex

**Test Scenarios** (matching server-side tests):

1. Direct user permissions (1,000 checks)
2. Group permissions (1,000 checks)
3. Multi-hop chains (500 checks, 3+ hops)
4. Batch queries (100 users × 10 resources)
5. High concurrency (100 simultaneous checks)

### 4. Data Sync Performance

**What**: WebSocket update propagation
**Metrics**:

- Grant permission end-to-end latency
- Revoke permission end-to-end latency
- Incremental update application time
- Full sync time (if needed)
- **Target**: < 100ms for incremental updates

### 5. Memory Usage

**What**: Browser resource consumption
**Metrics**:

- Heap size with graph loaded
- IndexedDB storage size
- Service Worker memory overhead
- Peak memory during operations
- **Target**: < 100 MB for 5K user dataset

### 6. Offline Performance

**What**: Behavior without network
**Metrics**:

- Permission check latency (should be identical)
- Queued mutation storage time
- Background sync reconnection time

## Test Scenarios (Real Data)

### Dataset (From R2)

- 5,000 users
- 500 groups
- 3,000 resources
- 12,474 member_of relationships
- 83 inherits_from relationships
- 9,048 user permissions
- 4,462 group permissions

### Scenario 1: Direct User Permissions

```typescript
// 1,000 iterations
const user = randomUser();
const resource = randomUserResource(user);
measure(() => client.can(user, "read", resource));
```

### Scenario 2: Group Permissions

```typescript
// 1,000 iterations
const user = randomUser();
const group = randomUserGroup(user);
const resource = randomGroupResource(group);
measure(() => client.can(user, "write", resource));
```

### Scenario 3: Multi-Hop Chains

```typescript
// 500 iterations
// User -> Group -> Parent Group -> Resource
const user = randomUser()
const resource = randomDeepResource(user, minHops: 3)
measure(() => client.can(user, 'read', resource))
```

### Scenario 4: Complex Queries

```typescript
// 100 iterations
const user = randomUser();
measure(() => client.findAllResourcesUserCanAccess(user, "read"));
```

### Scenario 5: High Concurrency

```typescript
// 100 simultaneous checks
const checks = Array(100)
  .fill(0)
  .map(() => {
    const user = randomUser();
    const resource = randomResource();
    return client.can(user, "read", resource);
  });
measure(() => Promise.all(checks));
```

### Scenario 6: Batch Operations

```typescript
// 100 users × 10 resources = 1,000 checks
const users = randomUsers(100);
const resources = randomResources(10);
measure(() => client.canBatch(users, "read", resources));
```

## Result Storage Format

### JSON Schema

```typescript
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
    wasmDownload: number; // ms
    wasmCompilation: number; // ms
    kuzuInitialization: number; // ms
    dataFetch: number; // ms
    graphConstruction: number; // ms
    total: number; // ms
  };

  warmStart: {
    wasmLoad: number; // ms
    indexedDBLoad: number; // ms
    kuzuInitialization: number; // ms
    total: number; // ms
  };

  permissionChecks: {
    scenario: string;
    iterations: number;
    results: {
      mean: number; // ms
      median: number; // ms
      p95: number; // ms
      p99: number; // ms
      min: number; // ms
      max: number; // ms
    };
    opsPerSecond: number;
  }[];

  memoryUsage: {
    heapUsed: number; // bytes
    heapTotal: number; // bytes
    indexedDBSize: number; // bytes
  };

  syncPerformance?: {
    grantLatency: number; // ms
    revokeLatency: number; // ms
    incrementalUpdate: number; // ms
  };
}
```

### Storage Location

```
results/client-benchmarks/
└── [date]-[scenario]-[timestamp].json

Example:
results/client-benchmarks/2025-12-29-cold-start-00-15-30.json
results/client-benchmarks/2025-12-29-permission-checks-00-15-45.json
results/client-benchmarks/2025-12-29-warm-start-00-16-00.json
```

## Report Generation

### Update generate_comprehensive_report.py

Add new section for client-side benchmarks:

```python
def load_client_benchmark_results():
    """Load all client-side benchmark results."""
    results_dir = Path("results/client-benchmarks")
    if not results_dir.exists():
        return []

    results = []
    for file in results_dir.glob("*.json"):
        with open(file) as f:
            results.append(json.load(f))

    # Sort by timestamp, return latest
    return sorted(results, key=lambda x: x['metadata']['timestamp'])[-1]

def generate_client_section(results):
    """Generate client-side benchmark section."""
    if not results:
        return ""

    return f"""
## Client-Side KuzuDB WASM Performance

### Environment
- Browser: {results['metadata']['environment']['userAgent']}
- CPU Cores: {results['metadata']['environment']['hardwareConcurrency']}
- Service Worker: {results['metadata']['serviceWorkerEnabled']}
- IndexedDB: {results['metadata']['indexedDBEnabled']}

### Dataset
- Users: {results['metadata']['dataset']['users']:,}
- Groups: {results['metadata']['dataset']['groups']:,}
- Resources: {results['metadata']['dataset']['resources']:,}
- Relationships: {results['metadata']['dataset']['relationships']:,}

### Load Performance

#### Cold Start (First Visit)
- WASM Download: {results['coldStart']['wasmDownload']:.0f}ms
- WASM Compilation: {results['coldStart']['wasmCompilation']:.0f}ms
- Data Fetch: {results['coldStart']['dataFetch']:.0f}ms
- Graph Construction: {results['coldStart']['graphConstruction']:.0f}ms
- **Total: {results['coldStart']['total']:.0f}ms**

#### Warm Start (Cached)
- WASM Load: {results['warmStart']['wasmLoad']:.0f}ms
- IndexedDB Load: {results['warmStart']['indexedDBLoad']:.0f}ms
- **Total: {results['warmStart']['total']:.0f}ms**

### Permission Check Performance

| Scenario | Operations | Mean | P95 | Ops/sec |
|----------|-----------|------|-----|---------|
{generate_permission_table_rows(results['permissionChecks'])}

### Memory Usage
- Heap: {results['memoryUsage']['heapUsed'] / 1024 / 1024:.1f} MB
- IndexedDB: {results['memoryUsage']['indexedDBSize'] / 1024 / 1024:.1f} MB

### Comparison: Client vs Server

| Metric | Client (Browser) | Server (Cloudflare) | Improvement |
|--------|------------------|---------------------|-------------|
| Permission Check | {results['permissionChecks'][0]['results']['mean']:.1f}ms | 2.0ms | {2.0 / results['permissionChecks'][0]['results']['mean']:.1f}x faster |
| Cold Start | {results['coldStart']['total']:.0f}ms | N/A | One-time cost |
| Warm Start | {results['warmStart']['total']:.0f}ms | N/A | Sub-100ms |
| Network Latency | 0ms | 50-200ms | Zero latency |
| Cost per Check | $0 | ~$0.0001 | Infinite savings |

### Key Findings
- **Zero-latency checks**: No network roundtrip required
- **Fast warm starts**: Service Worker + IndexedDB enables sub-100ms restarts
- **Offline capable**: Works without network connection
- **Scales infinitely**: Computation distributed to clients
    """
```

## Benchmark Implementation Tools

### Browser Testing Stack

```json
{
  "dependencies": {
    "kuzu-wasm": "^0.11.3",
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

### Key APIs to Use

- `performance.mark()` / `performance.measure()` - Precise timing
- `performance.memory` - Heap usage (Chrome only)
- `navigator.storage.estimate()` - IndexedDB size
- `PerformanceObserver` - Network timing
- `console.time()` / `console.timeEnd()` - Simple timing

### Benchmark Runner

```typescript
class BenchmarkRunner {
  async runScenario(name: string, fn: () => Promise<void>, iterations: number) {
    const timings: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      timings.push(end - start);
    }

    return {
      scenario: name,
      iterations,
      results: calculateStats(timings),
      opsPerSecond: 1000 / mean(timings),
    };
  }

  async saveResults(results: BenchmarkResult) {
    const timestamp = new Date().toISOString();
    const filename = `${timestamp}-benchmark.json`;

    // Save locally (download as file)
    downloadJSON(filename, results);

    // Optionally: POST to server for storage
    await fetch("/api/benchmark-results", {
      method: "POST",
      body: JSON.stringify(results),
    });
  }
}
```

## Validation Criteria

### Performance Targets

- ✅ Cold start < 5s (one-time cost)
- ✅ Warm start < 100ms
- ✅ Direct permission check < 1ms
- ✅ Complex query < 5ms
- ✅ Memory usage < 100 MB

### Comparison Baseline

Compare against current Cloudflare implementation:

- Map-based: 508 ops/sec, 72ms p95
- **Target**: > 1000 ops/sec, < 5ms p95 (local computation)

### Progressive Enhancement

- Works without Service Worker (slower cold start)
- Works without IndexedDB (re-fetch data each load)
- Works offline (read-only until reconnect)

## Running Benchmarks

### Development

```bash
cd client/benchmarks
npm install
npm run dev
# Open http://localhost:5173
# Click "Run All Benchmarks"
```

### CI/CD

```bash
npm run benchmark:headless
# Puppeteer/Playwright for automated testing
# Save results to results/client-benchmarks/
```

### Report Generation

```bash
cd benchmarks
python generate_comprehensive_report.py
# Automatically includes latest client results
# Output: results/BENCHMARK_RESULTS.md
```

## Next Steps

1. **Build prototype with benchmarking built-in**

   - Create client/benchmarks/ structure
   - Implement BenchmarkRunner class
   - Add scenario definitions matching server tests

2. **Test incrementally**

   - Start with cold start timing
   - Add permission check scenarios
   - Measure memory usage
   - Test Service Worker impact

3. **Generate first report**

   - Run all scenarios
   - Save results JSON
   - Update report generator
   - Compare client vs server

4. **Iterate and optimize**
   - Identify bottlenecks
   - Optimize WASM loading
   - Tune IndexedDB schema
   - Validate offline behavior

## Success Metrics

The client-side approach is validated if:

- ✅ Permission checks are faster than server-side (< 5ms vs 72ms)
- ✅ Warm starts are faster than network roundtrip (< 100ms vs 50-200ms)
- ✅ Memory usage is acceptable (< 100 MB)
- ✅ Cold start is reasonable for one-time cost (< 5s)
- ✅ Works offline reliably
