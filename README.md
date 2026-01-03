# KuzuDB Authorization System

Secure edge-based authorization system using KuzuDB WASM client-side with Cloudflare Workers server-side validation.

## 🎯 Current Status

✅ **20/20 security tests passing**  
✅ **Edge-based validation implemented**  
✅ **TDD approach with comprehensive test coverage**  
✅ **Ready for integration**

## 📚 Documentation

All documentation has been organized in the [`docs/`](./docs/) directory:

- **Security**: [Edge-based validation architecture](./docs/security/SECURITY_ARCHITECTURE_CONCISE.md)
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

```bash
cd benchmarks/nodejs
## Architecture

**Client**: KuzuDB WASM for graph queries (runs in browser/worker)  
**Server**: Cloudflare Workers + Durable Objects for validation  
**Security**: Edge-based validation with chain connectivity checks

See [Security Architecture](./docs/security/SECURITY_ARCHITECTURE_CONCISE.md) for details.

## Development

### Run Security Tests

```bash
cd cloudflare/worker
npm install
npm test
```

All 20 security tests should pass. See [TDD Quick Start](./docs/security/QUICKSTART_TDD.md) for details.

### Deploy to Cloudflare

```bash
cd cloudflare/worker
npm run deploy
```

See [Deployment Guide](./docs/deployment/DEPLOY.md) for full instructions.

## Project Structure

```
kuzu-test/
├── docs/                          # Organized documentation
│   ├── security/                  # Security & architecture docs
│   ├── deployment/                # Deployment guides
│   ├── development/               # Development docs
│   └── archive/                   # Historical/outdated docs
├── cloudflare/                    # Cloudflare Workers implementation
│   ├── worker/                    # Worker code
│   │   ├── src/
│   │   │   ├── durable-objects/  # GraphStateDO
│   │   │   ├── services/         # Validation & audit
│   │   │   ├── types/            # TypeScript types
│   │   │   └── tests/            # Security tests (20 passing)
│   │   └── README.md
│   ├── pulumi/                    # Infrastructure as code
│   └── README.md
├── benchmarks/                    # Performance benchmarks
│   ├── python/                    # Python benchmarks
│   ├── nodejs/                    # Node.js benchmarks
│   └── wasm/                      # WASM browser benchmarks
├── client/                        # Client implementation
└── generators/                    # Test data generation
```

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
```

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
