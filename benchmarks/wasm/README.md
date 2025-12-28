# KuzuDB WASM Benchmarks

Browser-based benchmarks for testing KuzuDB WASM performance in authorization scenarios.

## Setup

### Option 1: Using a Local Server

```bash
# Install a simple HTTP server if you don't have one
npm install -g http-server

# Navigate to the wasm directory
cd benchmarks/wasm

# Start the server
http-server -p 8080

# Open in browser
open http://localhost:8080
```

### Option 2: Using Python

```bash
cd benchmarks/wasm
python3 -m http.server 8080
open http://localhost:8080
```

### Option 3: Using Node.js

```bash
cd benchmarks/wasm
npx serve
```

## Features

- 📦 **Bundle Size Measurement** - Measures WASM binary and JS bundle sizes
- ⚡ **Loading Benchmarks** - Tests data loading performance
- 🔍 **Query Benchmarks** - Tests authorization query patterns
- 💾 **Memory Monitoring** - Tracks heap usage in real-time
- 📊 **Visual Results** - Interactive UI with progress bars and metrics
- 💾 **Export Results** - Download results as JSON

## Test Dataset

- 1,000 users
- 500 resources
- 50 groups
- ~2,000-3,000 permissions
- ~500 memberships

(Smaller than Python/Node.js tests due to browser memory constraints)

## Authorization Queries Tested

1. Direct Permission Check
2. Group-Based Permission Check
3. User's Groups
4. List Readable Resources
5. Count User Permissions

## Results

Results are displayed in the browser UI and can be exported as JSON for comparison with Python/Node.js benchmarks.

## Browser Requirements

- Modern browser with WASM support (Chrome, Firefox, Safari, Edge)
- For memory monitoring: Chrome or Edge (uses `performance.memory` API)

## Notes

- WASM tests use smaller datasets than Python/Node.js due to browser memory limits
- Loading is done row-by-row (no bulk COPY FROM in browser context)
- Results may vary based on browser and system resources
- Use the same browser for consistent comparisons
