# Kuzu Cloudflare Workers Build Setup

## Overview

This document explains the custom Kuzu WASM build configured specifically for Cloudflare Workers.

## Repository Structure

```
kuzu-test/
├── cloudflare/
│   ├── kuzu-cf-build/              # Git submodule (your kuzu fork)
│   │   └── tools/wasm/
│   │       ├── CMakeLists.cf.txt   # CF-specific CMake config
│   │       ├── build-cf.sh         # CF build script
│   │       └── README-CF.md        # CF build documentation
│   └── worker/
│       └── node_modules/
│           └── kuzu-wasm-cf/       # Build output (generated)
```

## Submodule Configuration

The kuzu repository is added as a submodule with recursive update enabled:

```bash
# Submodule location
cloudflare/kuzu-cf-build → https://github.com/loganpowell/kuzu

# Git configuration
git config submodule.recurse true  # Auto-update submodules
```

### Branch Structure

- **Main kuzu repo**: `master` branch (upstream kuzu)
- **Submodule branch**: `cloudflare-workers-build` (CF-specific modifications)

## Why a Custom Build?

### Problems with Standard Builds

1. **@kuzudb/kuzu (Node.js)**: Uses native addons (`.node` files), incompatible with Workers V8 isolate
2. **kuzu-wasm (official)**: Uses WebAssembly.instantiate() which Workers blocks for security
3. **@kuzu/kuzu-wasm (unswdb)**: Requires Web Workers and SharedArrayBuffer (not available in Workers)

### Cloudflare Workers Constraints

- ❌ No native Node.js addons
- ❌ No dynamic WebAssembly.instantiate()
- ❌ No Web Workers or SharedArrayBuffer
- ❌ No XMLHttpRequest
- ✅ Node.js compatibility APIs (fs, buffer, etc.)
- ✅ Static WASM imports
- ✅ Single-threaded execution

## Custom Build Solution

### Key Configuration Changes

**CMakeLists.cf.txt** - Emscripten flags:

```cmake
-s USE_PTHREADS=0            # Disable Web Workers
-s PROXY_TO_PTHREAD=0        # No thread proxying
-s ASYNCIFY=1                # Enable async without workers
-s DYNAMIC_EXECUTION=0       # No eval (Workers restriction)
-s ENVIRONMENT='web'         # Target web environment
-s FILESYSTEM=1              # Enable FS API
```

**Kuzu Configuration**:

```cmake
-DSINGLE_THREADED=TRUE       # Build kuzu in single-threaded mode
-DBUILD_SHELL=FALSE          # Disable shell
-DBUILD_TESTS=FALSE          # Disable tests
```

### What This Achieves

1. **No Web Workers**: All execution on main thread
2. **No pthread calls**: Compatible with Workers security model
3. **Async support**: ASYNCIFY allows async/await without workers
4. **Static WASM**: Module can be imported statically
5. **Single-threaded**: Kuzu runs in single-threaded mode

## Building

### Prerequisites

```bash
# Install Emscripten SDK
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

### Build Steps

```bash
# From project root
cd cloudflare/kuzu-cf-build/tools/wasm

# Run CF-specific build
./build-cf.sh
```

This will:

1. Configure kuzu with single-threaded mode
2. Build `kuzu_wasm_cf` target
3. Output to `../../worker/node_modules/kuzu-wasm-cf/`

### Build Output

```
worker/node_modules/kuzu-wasm-cf/
├── kuzu_wasm_cf.wasm           # WASM binary
├── kuzu_wasm_cf.js             # Emscripten loader
├── index.js                    # Sync API wrapper
└── *.js                        # Helper modules
```

## Usage in Workers

```typescript
// cloudflare/worker/src/durable-objects/graph-state-csv.ts

private async initializeServerKuzu(): Promise<void> {
  // Import CF-specific build
  const createModule = (await import('kuzu-wasm-cf')).default;

  // Initialize (no Web Workers, async via ASYNCIFY)
  this.kuzu = await createModule();

  // Create in-memory database
  this.db = this.kuzu.Database(':memory:');
  this.conn = this.kuzu.Connection(this.db);

  // Use standard Kuzu API
  await this.conn.query('CREATE NODE TABLE User(id STRING, PRIMARY KEY(id))');
  // ...
}
```

## Performance Considerations

### Trade-offs

**Advantages**:

- ✅ Runs in Cloudflare Workers
- ✅ Works with Durable Objects
- ✅ Authoritative server-side validation
- ✅ Full Cypher query support

**Limitations**:

- ⚠️ Single-threaded (no parallel execution)
- ⚠️ Slower than multi-threaded builds
- ⚠️ Memory limited by Workers (128MB-1GB)
- ⚠️ CPU time limits (10-50ms per request, 30s max DO)

### Suitable Use Cases

- ✅ Authorization graphs (<10M edges)
- ✅ Permission validation queries
- ✅ Transitive group membership
- ✅ Real-time permission checks

## Testing

### Local Development

```bash
cd cloudflare/worker
npx wrangler dev
```

### Deployment

```bash
cd cloudflare/worker
npm run deploy
```

## Maintenance

### Updating Kuzu Version

```bash
# Update submodule to latest upstream
cd cloudflare/kuzu-cf-build
git fetch origin
git merge origin/master

# Rebuild
cd tools/wasm
./build-cf.sh

# Test in worker
cd ../../worker
npx wrangler dev
```

### Modifying Build Configuration

Edit `cloudflare/kuzu-cf-build/tools/wasm/CMakeLists.cf.txt` and rebuild:

```bash
cd cloudflare/kuzu-cf-build/tools/wasm
./build-cf.sh
```

## Troubleshooting

### Build Issues

**"emcc not found"**

```bash
# Activate emscripten
source ~/emsdk/emsdk_env.sh
```

**"WebAssembly.instantiate() blocked"** (runtime)

- Using wrong package - should use `kuzu-wasm-cf` not `@kuzu/kuzu-wasm`

**"SharedArrayBuffer is not defined"** (runtime)

- pthread not disabled - verify CMakeLists.cf.txt has `USE_PTHREADS=0`

### Runtime Issues

**Out of memory**

- Reduce dataset size or use pagination
- Workers have memory limits based on plan

**Query timeout**

- Durable Objects have 30s CPU time limit
- Consider caching or pre-computing expensive queries

## References

- [Kuzu Documentation](https://kuzudb.github.io/docs)
- [Emscripten Docs](https://emscripten.org/docs/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [ASYNCIFY Explained](https://emscripten.org/docs/porting/asyncify.html)

## Next Steps

1. **Build the WASM module**: Run `./build-cf.sh`
2. **Update worker code**: Import `kuzu-wasm-cf` instead of `@kuzu/kuzu-wasm`
3. **Test locally**: `npx wrangler dev`
4. **Deploy**: `npm run deploy`
