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
    echo "Starting server with auto-save endpoint on port 8080..."
    cd benchmarks/wasm
    $PYTHON_CMD server.py > /tmp/kuzu-server.log 2>&1 &
    SERVER_PID=$!
    cd "$PROJECT_DIR"
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
echo -e "  3. ${GREEN}Click 'Export Results'${NC} - results will auto-save to results/ directory"
echo ""

# Open browser based on OS with memory profiling flags
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Check if Brave is available (Chromium-based)
    if [ -d "/Applications/Brave Browser.app" ]; then
        echo -e "${GREEN}Launching Brave with memory profiling flags...${NC}"
        nohup "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
            --enable-precise-memory-info \
            --js-flags="--expose-gc" \
            "http://localhost:8080/benchmarks/wasm/" \
            > /tmp/kuzu-browser.log 2>&1 &
        sleep 1
    # Fallback to Chrome if available
    elif [ -d "/Applications/Google Chrome.app" ]; then
        echo -e "${GREEN}Launching Chrome with memory profiling flags...${NC}"
        nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
            --enable-precise-memory-info \
            --js-flags="--expose-gc" \
            "http://localhost:8080/benchmarks/wasm/" \
            > /tmp/kuzu-browser.log 2>&1 &
        sleep 1
    else
        echo -e "${YELLOW}⚠️  Brave/Chrome not found, opening with default browser (no profiling flags)${NC}"
        open "http://localhost:8080/benchmarks/wasm/"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Try brave-browser first, then google-chrome, then fallback
    if command -v brave-browser &> /dev/null; then
        echo -e "${GREEN}Launching Brave with memory profiling flags...${NC}"
        nohup brave-browser --enable-precise-memory-info --js-flags="--expose-gc" \
            "http://localhost:8080/benchmarks/wasm/" > /tmp/kuzu-browser.log 2>&1 &
        sleep 1
    elif command -v google-chrome &> /dev/null; then
        echo -e "${GREEN}Launching Chrome with memory profiling flags...${NC}"
        nohup google-chrome --enable-precise-memory-info --js-flags="--expose-gc" \
            "http://localhost:8080/benchmarks/wasm/" > /tmp/kuzu-browser.log 2>&1 &
        sleep 1
    else
        echo -e "${YELLOW}⚠️  Brave/Chrome not found, opening with default browser (no profiling flags)${NC}"
        xdg-open "http://localhost:8080/benchmarks/wasm/" 2>/dev/null || true
    fi
else
    echo -e "${YELLOW}⚠️  Unknown OS, opening with default method${NC}"
    open "http://localhost:8080/benchmarks/wasm/" 2>/dev/null || true
fi
echo -e "${GREEN}✓ Browser launched${NC}"

echo -e "${YELLOW}Press Enter after the benchmark completes and results are exported...${NC}"
read -r

# Look for the most recent WASM results file
LATEST_WASM_RESULT=$(ls -t results/kuzu-wasm-benchmark*.json 2>/dev/null | head -n1)

if [ -z "$LATEST_WASM_RESULT" ]; then
    echo -e "${RED}✗ No WASM results file found in results/ directory${NC}"
    echo "Please ensure the benchmark completed and 'Export Results' was clicked."
    echo "If the file was downloaded instead, move it to the results/ directory."
    echo ""
    echo "You can then run the report generation manually:"
    echo "  $PYTHON_CMD benchmarks/generate_comprehensive_report.py"
    exit 1
fi

# If the latest file is not the standard name, copy it
if [ "$LATEST_WASM_RESULT" != "results/kuzu-wasm-benchmark.json" ]; then
    echo -e "${BLUE}Using latest result: $(basename $LATEST_WASM_RESULT)${NC}"
    cp "$LATEST_WASM_RESULT" "results/kuzu-wasm-benchmark.json"
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
echo "  • WASM: $LATEST_WASM_RESULT"
echo "  • Report: results/BENCHMARK_RESULTS.md"
echo ""

# Clean up server if we started it
if [ -n "$SERVER_PID" ]; then
    echo "Stopping HTTP server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
fi
