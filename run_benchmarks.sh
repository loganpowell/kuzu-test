#!/bin/bash
# Run complete benchmark suite for KuzuDB authorization testing

set -e

echo "========================================"
echo "KuzuDB Authorization Benchmark Suite"
echo "========================================"
echo ""

# Check if uv is installed
if ! command -v uv &> /dev/null; then
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Create virtual environment and install dependencies with uv
echo "Setting up Python environment with uv..."
uv venv
source .venv/bin/activate

echo "Installing dependencies..."
uv pip install -r requirements.txt

echo ""
echo "========================================"
echo "Step 1: Generate Test Data"
echo "========================================"
python generators/generate_data.py

echo ""
echo "========================================"
echo "Step 2: Measure Library Sizes"
echo "========================================"
python benchmarks/measure_library_sizes.py

echo ""
echo "========================================"
echo "Step 3: Benchmark Data Loading"
echo "========================================"
python benchmarks/python/benchmark_loading.py

echo ""
echo "========================================"
echo "Step 4: Benchmark Query Performance"
echo "========================================"
python benchmarks/python/benchmark_queries.py

echo ""
echo "========================================"
echo "✅ Benchmark Suite Complete!"
echo "========================================"
echo ""
echo "Results saved in ./results/"
ls -lh results/

echo ""
echo "To view results:"
echo "  cat results/library_sizes.json"
echo "  cat results/loading_benchmark_results.json"
echo "  cat results/query_benchmark_results.json"
