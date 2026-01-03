# Quick Start: Kuzu CF Build

## Setup (One-time)

```bash
# 1. Install Emscripten
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest
source ~/emsdk/emsdk_env.sh

# 2. Update submodule
cd /path/to/kuzu-test
git submodule update --init --recursive
```

## Build

```bash
cd cloudflare/kuzu-cf-build/tools/wasm
./build-cf.sh
```

Output: `cloudflare/worker/node_modules/kuzu-wasm-cf/`

## Use in Worker

```typescript
// Change import
- import kuzu from '@kuzu/kuzu-wasm';
+ import createKuzuModule from 'kuzu-wasm-cf';

// Initialize
- const kuzu = await kuzu_wasm();
+ const kuzu = await createKuzuModule();

// Same API after that
const db = kuzu.Database(':memory:');
const conn = kuzu.Connection(db);
```

## Test

```bash
cd cloudflare/worker
npx wrangler dev
curl -X POST http://localhost:8787/validate \
  -H "Content-Type: application/json" \
  -d '{"userId":"alice","operation":"read","resourceId":"file1"}'
```

## Deploy

```bash
cd cloudflare/worker
npm run deploy
```

## Common Issues

| Error                               | Solution                                |
| ----------------------------------- | --------------------------------------- |
| `emcc not found`                    | Run `source ~/emsdk/emsdk_env.sh`       |
| `WebAssembly.instantiate() blocked` | Using wrong package, use `kuzu-wasm-cf` |
| `SharedArrayBuffer is not defined`  | Rebuild with `USE_PTHREADS=0`           |
| Out of memory                       | Reduce dataset size                     |

## Files Modified

- `cloudflare/kuzu-cf-build/` - Submodule with CF build config
- `cloudflare/worker/package.json` - Add `kuzu-wasm-cf` dependency
- `cloudflare/worker/src/durable-objects/graph-state-csv.ts` - Import CF build

See [KUZU_CF_BUILD.md](./KUZU_CF_BUILD.md) for full documentation.
