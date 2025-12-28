# KuzuDB WASM Benchmarks

Browser-based benchmarks for testing KuzuDB WASM performance in authorization scenarios.

## Setup

### Recommended: Python Server with Auto-Save

```bash
# Navigate to the wasm directory
cd benchmarks/wasm

# Start the server
python server.py

# Open in browser
open http://localhost:8080/benchmarks/wasm/
```

**Benefits**:

- ✅ Automatically saves results to `../../results/` directory
- ✅ No manual file management needed
- ✅ Timestamped filenames
- ✅ Works with `generate_comprehensive_report.py`

### Alternative: Simple HTTP Server

```bash
cd benchmarks/wasm
python3 -m http.server 8080
open http://localhost:8080
```

**Note**: Results will download to your browser's downloads folder and need to be moved manually to `results/` directory.

## Features

- 📦 **Bundle Size Measurement** - Measures WASM binary and JS bundle sizes
- ⚡ **Loading Benchmarks** - Tests data loading performance with COPY FROM
- 🔍 **Query Benchmarks** - Tests authorization query patterns
- 💾 **Memory Monitoring** - Tracks JS heap + WASM linear memory in real-time
- 📊 **Visual Results** - Interactive UI with progress bars and metrics
- 💾 **Export Results** - Automatically saves to results directory (with server.py)

## Test Dataset

- 5,000 users
- 3,000 resources
- 500 groups
- 34,567 total records (nodes + edges)

**Same dataset as Python/Node.js benchmarks** for accurate cross-platform comparison.

## Authorization Queries Tested

1. Direct Permission Check
2. Group-Based Permission Check
3. User's Groups
4. List Readable Resources
5. Count User Permissions

## Results

Results are displayed in the browser UI and automatically saved to `../../results/` directory when using `server.py`.

To include WASM results in the comprehensive report:

```bash
cd ../..
./benchmarks/generate_comprehensive_report.py
```

The report generator automatically picks up the most recent WASM benchmark results.

## Browser Requirements

- Modern browser with WASM support (Chrome, Firefox, Safari, Edge)
- For memory monitoring: Chrome or Edge (uses `performance.memory` API)

### Accurate Memory Measurements

For the most accurate memory measurements, launch Chrome with special flags:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --enable-precise-memory-info \
  --js-flags="--expose-gc" \
  http://localhost:8080/benchmarks/wasm/

# Linux
google-chrome \
  --enable-precise-memory-info \
  --js-flags="--expose-gc" \
  http://localhost:8080/benchmarks/wasm/

# Windows
chrome.exe --enable-precise-memory-info --js-flags="--expose-gc" http://localhost:8080/benchmarks/wasm/
```

**What these flags do:**

- `--enable-precise-memory-info`: Provides more accurate memory measurements
- `--js-flags="--expose-gc"`: Enables manual garbage collection via `window.gc()` for cleaner baseline measurements

Without these flags, the benchmark will still work but memory measurements may be less precise.

## Notes

- WASM uses same dataset as Python/Node.js (34,567 records)
- Loading uses COPY FROM via WASM filesystem (fast bulk loading)
- Memory measurement includes both JS heap and WASM linear memory
- Results may vary based on browser and system resources
- Use the same browser for consistent comparisons
- Chrome/Edge recommended for `performance.memory` API support
