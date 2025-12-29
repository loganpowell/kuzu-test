# Client SDK with Benchmarks

This directory contains the KuzuAuth client SDK with integrated KuzuDB WASM and comprehensive benchmarking capabilities.

## Setup

```bash
cd client
npm install
```

## Running the Benchmark

Start the development server:

```bash
npm run benchmark
```

This will open your browser to `http://localhost:3000/benchmark.html` where you can:

1. Configure the server URL (default: your Cloudflare Worker)
2. Set the organization ID (default: org_default)
3. Click "Run Benchmark" to start

## What Gets Measured

### 1. Cold Start Performance

- WASM bundle download (3.73 MB)
- WASM compilation time
- Data fetch from server
- Graph construction in KuzuDB
- **Target**: < 5 seconds (one-time cost)

### 2. Permission Check Scenarios

- Direct User Permissions (1,000 checks)
- Group Permissions (1,000 checks)
- Multi-Hop Chains (500 checks, 3+ hops)
- Mixed Workload (1,000 checks)
- High Concurrency (100 simultaneous)
- Batch Queries (1,000 checks)

### 3. Memory Usage

- JavaScript heap size
- IndexedDB storage
- **Target**: < 100 MB

## Results

Benchmarks automatically:

- Display results in the UI
- Save JSON results file (download button)
- Store in `../results/client-benchmarks/` directory

## Report Generation

After running benchmarks, generate the comprehensive report:

```bash
cd ../benchmarks
python generate_comprehensive_report.py
```

This will include your client-side results in `results/BENCHMARK_RESULTS.md`.

## Architecture

```
client/
├── src/
│   └── client.ts              # KuzuAuth client SDK
├── benchmarks/
│   ├── metrics-collector.ts   # Performance measurement
│   ├── scenarios.ts           # Test scenarios
│   └── runner.ts              # Benchmark orchestration
├── benchmark.html             # Interactive UI
└── package.json
```

## Key Features

- **Zero-latency checks**: No network roundtrip
- **Offline capable**: Works without connection
- **Service Worker**: Fast cached loads (50-100ms)
- **IndexedDB**: Persistent graph data
- **WebSocket sync**: Real-time updates

## Browser Requirements

- Modern browser with:
  - WebAssembly support
  - IndexedDB support
  - Service Worker support (optional, for caching)
  - Performance API

## Troubleshooting

**CORS Issues**: Make sure your Cloudflare Worker has CORS enabled for the client origin.

**Memory Issues**: The benchmark loads a large graph dataset. Ensure you have sufficient memory available.

**Service Worker**: First run won't use Service Worker cache. Subsequent runs will be much faster.

## Next Steps

After validating the benchmark:

1. Implement Service Worker for WASM caching
2. Add real-time WebSocket sync
3. Optimize IndexedDB schema
4. Add offline mutation queue
