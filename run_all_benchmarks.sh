#!/bin/bash

# KuzuDB Comprehensive Benchmark Runner
# Runs all benchmarks (Python, Node.js, WASM) and generates the report

set -e  # Exit on error

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  KuzuDB Comprehensive Benchmark Suite  ${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Check if Python venv exists
if [ ! -d ".venv" ]; then
    echo -e "${RED}Error: Python virtual environment not found${NC}"
    echo "Please run: python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

PYTHON_CMD="$PROJECT_DIR/.venv/bin/python"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js not found${NC}"
    exit 1
fi

# Clean up old database files
echo -e "${YELLOW}[1/6] Cleaning up old database files...${NC}"
rm -rf db/bench_*
echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

# Run Python loading benchmark
echo -e "${YELLOW}[2/6] Running Python loading benchmark...${NC}"
$PYTHON_CMD benchmarks/python/benchmark_loading.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Python loading benchmark complete${NC}"
else
    echo -e "${RED}✗ Python loading benchmark failed${NC}"
    exit 1
fi
echo ""

# Run Python query benchmark
echo -e "${YELLOW}[3/6] Running Python query benchmark...${NC}"
$PYTHON_CMD benchmarks/python/benchmark_queries.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Python query benchmark complete${NC}"
else
    echo -e "${RED}✗ Python query benchmark failed${NC}"
    exit 1
fi
echo ""

# Run Node.js loading benchmark
echo -e "${YELLOW}[4/6] Running Node.js loading benchmark...${NC}"
cd benchmarks/nodejs
node benchmark_loading.js || true  # May crash at end but saves results
cd "$PROJECT_DIR"
if [ -f "results/nodejs_loading_benchmark_results.json" ]; then
    echo -e "${GREEN}✓ Node.js loading benchmark complete${NC}"
else
    echo -e "${RED}✗ Node.js loading benchmark failed${NC}"
    exit 1
fi
echo ""

# Run Node.js query benchmark
echo -e "${YELLOW}[5/6] Running Node.js query benchmark...${NC}"
cd benchmarks/nodejs
node benchmark_queries.js || true  # May crash at end but saves results
cd "$PROJECT_DIR"
if [ -f "results/nodejs_query_benchmark_results.json" ]; then
    echo -e "${GREEN}✓ Node.js query benchmark complete${NC}"
else
    echo -e "${RED}✗ Node.js query benchmark failed${NC}"
    exit 1
fi
echo ""

# Check if server is running, start if needed
echo -e "${YELLOW}[6/6] Preparing WASM benchmark...${NC}"
SERVER_PID=""
if lsof -i :8080 2>&1 | grep -q LISTEN; then
    echo -e "${GREEN}✓ Server already running on port 8080${NC}"
else
    echo "Starting HTTP server on port 8080..."
    $PYTHON_CMD -m http.server 8080 > /tmp/kuzu-server.log 2>&1 &
    SERVER_PID=$!
    sleep 2
    echo -e "${GREEN}✓ Server started (PID: $SERVER_PID)${NC}"
fi
echo ""

# Open WASM benchmark in browser
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}         WASM Benchmark (Manual)         ${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""
echo -e "${YELLOW}Opening WASM benchmark in browser...${NC}"
echo ""
echo -e "Please complete these steps:"
echo -e "  1. ${GREEN}Click 'Run Benchmark'${NC} in the browser"
echo -e "  2. Wait for it to complete (fetches CSV data and runs tests)"
echo -e "  3. ${GREEN}Click 'Save Results'${NC} to download the JSON file"
echo -e "  4. Save it as ${GREEN}kuzu-wasm-benchmark.json${NC} in the ${GREEN}results/${NC} folder"
echo ""

# Open browser based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:8080/benchmarks/wasm/"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open "http://localhost:8080/benchmarks/wasm/" 2>/dev/null || true
fi

echo -e "${YELLOW}Press Enter after you've saved the WASM results file...${NC}"
read -r

# Verify WASM results exist
if [ ! -f "results/kuzu-wasm-benchmark.json" ]; then
    echo -e "${RED}✗ WASM results file not found at results/kuzu-wasm-benchmark.json${NC}"
    echo "Please save the results and run this script again, or run the report generation manually:"
    echo "  $PYTHON_CMD benchmarks/generate_comprehensive_report.py"
    exit 1
fi

echo -e "${GREEN}✓ WASM results file found${NC}"
echo ""

# Generate comprehensive report
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}      Generating Comprehensive Report    ${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

$PYTHON_CMD benchmarks/generate_comprehensive_report.py
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Report generated successfully!${NC}"
    echo -e "  📄 ${GREEN}results/BENCHMARK_RESULTS.md${NC}"
else
    echo -e "${RED}✗ Report generation failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${GREEN}     All benchmarks complete! 🎉         ${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""
echo "Results saved:"
echo "  • Python: results/loading_benchmark_results.json"
echo "  • Python: results/query_benchmark_results.json"
echo "  • Node.js: results/nodejs_loading_benchmark_results.json"
echo "  • Node.js: results/nodejs_query_benchmark_results.json"
echo "  • WASM: results/kuzu-wasm-benchmark.json"
echo "  • Report: results/BENCHMARK_RESULTS.md"
echo ""

# Clean up server if we started it
if [ -n "$SERVER_PID" ]; then
    echo "Stopping HTTP server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
fi
