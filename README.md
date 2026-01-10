# KuzuDB Authorization System

Secure edge-based authorization system using KuzuDB WASM client-side with Cloudflare Workers server-side validation.

## 🎯 Current Status

✅ **20/20 security tests passing**  
✅ **Edge-based validation implemented**  
✅ **TDD approach with comprehensive test coverage**  
✅ **Ready for integration**

## 📚 Documentation

All documentation has been organized in the [`docs/`](./docs/) directory:

- **Architecture**: [High-level system architecture](./docs/ARCHITECTURE.md) ⭐ **Start here!**
- **Security**: [Edge-based validation architecture](./docs/security/SECURITY_ARCHITECTURE_CONCISE.md)
- **E2E Examples**: [Full-stack authorization examples](./docs/security/FULL_STACK_EXAMPLE_COMPLETE.md)
- **Development**: [TDD Quick Start](./docs/security/QUICKSTART_TDD.md)
- **Deployment**: [Cloudflare deployment guide](./docs/deployment/DEPLOY.md)

## Quick Start

```bash
# Install dependencies and run all benchmarks
./run_all_benchmarks.sh
```

This script will:

1. Run Python loading and query benchmarks
2. Run Node.js loading and query benchmarks
3. Open WASM benchmark in browser (interactive)
4. Generate comprehensive report

## Manual Setup

### Python Environment

```bash
# Using uv (recommended)
curl -LsSf https://astral.sh/uv/install.sh | sh
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

### Node.js Environment

````bash
cd benchmarks/nodejs
## 🏗️ Architecture Overview

This system provides **sub-millisecond authorization checks** with **client-side graph queries** and **server-side validation**:

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT (Browser)                                            │
│  • KuzuDB WASM: In-memory graph database                    │
│  • Authorization queries: <1ms (zero network latency)       │
│  • WebSocket sync: Real-time mutation broadcasts            │
└─────────────────────────────────────────────────────────────┘
                           ↕ Edge Proofs
┌─────────────────────────────────────────────────────────────┐
│ SERVER (Cloudflare Workers + Durable Objects)               │
│  • Edge validation: O(n) chain connectivity                 │
│  • CSV storage: 30-40% faster than JSON                     │
│  • WebSocket broadcasts: <50ms mutation propagation         │
└─────────────────────────────────────────────────────────────┘
                           ↕ CSV Files
┌─────────────────────────────────────────────────────────────┐
│ STORAGE (Cloudflare R2 + KV)                                │
│  • R2: Canonical CSV files (users, groups, permissions)     │
│  • KV: Mutation log for catch-up sync                       │
└─────────────────────────────────────────────────────────────┘
```

**Key Features:**
- ⚡ **Sub-millisecond authorization** - Client-side queries with zero network latency
- 🔐 **Edge-based security** - Cryptographic-level proof validation
- 🔄 **Real-time sync** - WebSocket broadcasts for instant permission updates
- 📊 **CSV optimized** - 30-40% faster parsing than JSON (benchmarked)
- 🌍 **Global edge network** - Cloudflare's infrastructure for low latency

**📖 Read the full architecture:** [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

## Development

### Run Security Tests

```bash
cd cloudflare/worker
npm install
npm test
````

All 20 security tests should pass. See [TDD Quick Start](./docs/security/QUICKSTART_TDD.md) for details.

### Deploy to Cloudflare

```bash
cd cloudflare/worker
npm run deploy
```

See [Deployment Guide](./docs/deployment/DEPLOY.md) for full instructions.

## 📊 Data Formats & Benchmarks

### Why CSV over JSON?

Through extensive benchmarking, we found CSV to be **30-40% faster** than JSON for KuzuDB loading:

| Format  | Load Time (10K users) | Size   | Parse Speed    |
| ------- | --------------------- | ------ | -------------- |
| CSV     | ~50ms                 | 61 KB  | **40% faster** |
| JSON    | ~85ms                 | 142 KB | Baseline       |
| Parquet | ~45ms                 | 52 KB  | 45% faster     |

**Decision:** CSV chosen for production

- ✅ Faster than JSON (30-40% improvement)
- ✅ Human-readable (debugging, auditing)
- ✅ KuzuDB native format (optimized loader)
- ✅ Smaller size (~15% vs JSON)
- ⚠️ Parquet slightly faster but binary format

**JSON still used for:**

- WebSocket protocol messages
- HTTP API requests/responses
- Mutation log in KV store

### Legacy Benchmark Code

Original performance testing code is preserved in `benchmarks/` and `data/`:

```bash
# Generate test data in all formats (CSV, JSON, Parquet)
python generators/generate_data.py

# Run original benchmarks
./run_all_benchmarks.sh

# Or manually:
python benchmarks/python/benchmark_loading.py
cd benchmarks/nodejs && node benchmark_loading.js
```

**Data directories:**

- `data/csv/` - Production format (used by system)
- `data/json/` - Legacy format (benchmark comparison only)
- `data/parquet/` - Experimental format (not used) ├── python/ # Python benchmarks
  │ ├── nodejs/ # Node.js benchmarks
  │ └── wasm/ # WASM browser benchmarks
  ├── client/ # Client implementation
  └── generators/ # Test data generation

````

## Benchmarks (Legacy)

The original benchmarking code for KuzuDB performance testing is still available:

```bash
# Generate test data
python generators/generate_data.py

# Run Python benchmarks
python benchmarks/python/benchmark_loading.py
python benchmarks/python/benchmark_queries.py
# Run Node.js benchmarks
cd benchmarks/nodejs
node benchmark_loading.js
node benchmark_queries.js

# Run WASM benchmarks
cd benchmarks/wasm
python server.py
# Then open http://localhost:8080/benchmarks/wasm/
````

## License

Private - Kuzu Auth Project

- 3,000 resources
- 500 groups
- Permissions and memberships

**Query Patterns**: 10 authorization scenarios

- Direct permissions
- Group-based access
- Transitive membership
- Permission aggregation

## Results

See [results/BENCHMARK_RESULTS.md](results/BENCHMARK_RESULTS.md) for complete benchmark data.
