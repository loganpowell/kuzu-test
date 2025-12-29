# Benchmark Results

This directory contains benchmark results from the KuzuAuth client-side authorization system.

## Files

Benchmark results are automatically saved here when you click "Save Results to Workspace" in the benchmark UI.

Files are named: `client-benchmark-YYYY-MM-DDTHH-MM-SS.json`

## Structure

Each file contains:

- **metadata**: Environment info (browser, dataset size, etc.)
- **coldStart**: Initialization timing (WASM load, data fetch, graph construction)
- **permissionChecks**: Performance metrics for each scenario
- **memoryUsage**: Heap and IndexedDB usage

## Comparing Results

Use `jq` to compare specific metrics:

```bash
# Compare p95 latencies
jq -r '.permissionChecks[] | "\(.scenario): \(.results.p95)ms"' client-benchmark-*.json

# Compare ops/sec
jq -r '.permissionChecks[] | "\(.scenario): \(.opsPerSecond) ops/sec"' client-benchmark-*.json

# Cold start times
jq -r '.coldStart.total' client-benchmark-*.json
```
