# KuzuDB Authorization Testing

Performance testing of KuzuDB as an embedded graph database for authorization systems with a Zanzibar-inspired model.

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
npm install
```

## Running Individual Benchmarks

### Generate Test Data

```bash
python generators/generate_data.py
```

### Python Benchmarks

```bash
python benchmarks/python/benchmark_loading.py
python benchmarks/python/benchmark_queries.py
```

### Node.js Benchmarks

```bash
cd benchmarks/nodejs
node benchmark_loading.js
node benchmark_queries.js
```

### WASM Benchmarks

```bash
# Start server with automatic result saving
cd benchmarks/wasm
python server.py

# Open in browser
open http://localhost:8080/benchmarks/wasm/
```

**Note**: Results are automatically saved to `results/` when you click "Export Results".

### Generate Report

```bash
python benchmarks/generate_comprehensive_report.py
```

## Project Structure

```
kuzu-test/
├── data/               # Test data (CSV, Parquet, JSON)
├── db/                 # KuzuDB database files
├── benchmarks/         # Benchmark scripts
│   ├── python/        # Python benchmarks
│   ├── nodejs/        # Node.js benchmarks
│   └── wasm/          # WASM browser benchmarks
├── generators/         # Data generation
└── results/           # Benchmark results & reports
```

## Test Details

**Dataset**: 34,567 records

- 5,000 users
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
