# @kuzu-auth/client

Browser SDK for KuzuDB WASM authorization - enables **<1ms client-side permission checks** with real-time sync.

## Features

- 🚀 **Zero-latency authorization** - Checks happen in browser WASM (no network calls)
- 📦 **Offline-first** - Works without server connection using IndexedDB cache
- 🔄 **Real-time sync** - WebSocket updates keep permissions current
- ⚡ **Optimistic updates** - Instant UI updates with automatic rollback
- 🎯 **Type-safe** - Full TypeScript support with declaration files
- 📱 **Lightweight** - ~40KB minified (ESM/CJS dual package)

## Installation

```bash
npm install @kuzu-auth/client
```

## Quick Start

```typescript
import { KuzuAuthClient } from "@kuzu-auth/client";

// Initialize client
const client = new KuzuAuthClient({
  orgId: "your-org-id",
  serverUrl: "https://your-worker.workers.dev",
  wasmCdnUrl:
    "https://cdn.jsdelivr.net/npm/@kuzu/kuzu-wasm@latest/dist/kuzu-browser.js",
});

// Initialize (loads WASM, syncs permissions)
await client.init();

// Check permissions (< 1ms)
const canEdit = await client.can("alice", "edit", "doc:readme");
console.log("Alice can edit:", canEdit); // true/false

// Find resources user can access
const docs = await client.findAllResourcesUserCanAccess(
  "alice",
  "read",
  "doc:*"
);
console.log("Alice can read:", docs); // ['doc:readme', 'doc:api-spec']

// Grant permission (optimistic update)
await client.grantPermission("bob", "read", "doc:readme");

// Real-time sync
client.connectWebSocket();
```

## API Reference

### KuzuAuthClient

Main client class for authorization operations.

#### Constructor Options

```typescript
interface KuzuAuthClientOptions {
  orgId: string; // Your organization ID
  serverUrl: string; // Cloudflare Worker URL
  wasmCdnUrl?: string; // Custom WASM CDN URL (optional)
}
```

#### Methods

##### `init(): Promise<void>`

Initialize the client - loads WASM and syncs permissions from server.

```typescript
await client.init();
```

##### `can(userId: string, capability: string, resourceId: string): Promise<boolean>`

Check if user has permission. Returns cached result in <1ms.

```typescript
const canEdit = await client.can("alice", "edit", "doc:readme");
```

##### `findAllResourcesUserCanAccess(userId: string, capability: string, pattern: string): Promise<string[]>`

Find all resources matching pattern that user can access.

```typescript
// Find all docs alice can read
const docs = await client.findAllResourcesUserCanAccess(
  "alice",
  "read",
  "doc:*"
);

// Find specific resource types
const apis = await client.findAllResourcesUserCanAccess(
  "alice",
  "admin",
  "api:*"
);
```

##### `grantPermission(userId: string, capability: string, resourceId: string): Promise<void>`

Grant permission with optimistic update.

```typescript
await client.grantPermission("bob", "read", "doc:readme");
```

##### `revokePermission(userId: string, capability: string, resourceId: string): Promise<void>`

Revoke permission with optimistic update.

```typescript
await client.revokePermission("bob", "read", "doc:readme");
```

##### `connectWebSocket(): void`

Connect to server for real-time permission updates.

```typescript
client.connectWebSocket();
```

### WebSocketManager

Manages real-time sync connection (usually handled automatically by client).

```typescript
import { WebSocketManager } from "@kuzu-auth/client";

const ws = new WebSocketManager({
  url: "wss://your-worker.workers.dev/org/your-org-id/ws",
  onMessage: (msg) => console.log("Received:", msg),
  reconnectDelay: 1000,
  maxReconnectAttempts: 5,
});

await ws.connect();
```

### OptimisticUpdater

Handles optimistic updates with rollback (usually used internally by client).

```typescript
import { OptimisticUpdater } from "@kuzu-auth/client";

const updater = new OptimisticUpdater(client, (mutationId, error) => {
  console.log("Mutation rolled back:", mutationId, error);
});

// Apply mutation optimistically
const mutationId = await updater.applyOptimistically(
  "grant",
  "alice",
  "read",
  "doc:readme"
);

// Confirm when server responds
updater.confirmMutation(mutationId);
```

### QueryCache

LRU cache for authorization queries (internal use).

```typescript
import { QueryCache } from "@kuzu-auth/client";

const cache = new QueryCache({ maxSize: 1000 });

cache.set("alice:read:doc:readme", true);
const result = cache.get("alice:read:doc:readme"); // true
```

## Performance

- **Authorization checks:** < 1ms (WASM execution)
- **Initial load:** ~200ms (WASM download + compilation, cached after first load)
- **Sync:** ~50ms (incremental permission updates)
- **Cache size:** ~10KB per 1000 permissions

## Architecture

```
┌─────────────┐
│   Browser   │
│             │
│  ┌───────┐  │     WebSocket      ┌──────────────┐
│  │ WASM  │◄─┼────────────────────►│   Worker     │
│  │ Kuzu  │  │   (real-time)      │ (validation) │
│  └───┬───┘  │                    └──────────────┘
│      │      │
│  ┌───▼────┐ │
│  │IndexDB │ │
│  │ Cache  │ │
│  └────────┘ │
└─────────────┘
```

1. Permissions stored in browser IndexedDB
2. Authorization queries run in WASM (no network)
3. WebSocket keeps permissions synced
4. Server validates all mutations

## Testing

```bash
# Run tests (51 tests)
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# UI mode
npm run test:ui
```

## Development

```bash
# Build package
npm run build

# Output: dist/index.js (ESM), dist/index.cjs (CJS), dist/index.d.ts (types)
```

---

## Benchmarking

### Running Benchmarks

Start the development server:

```bash
npm run benchmark
```

This will open your browser to `http://localhost:3000/benchmark.html` where you can:

1. Configure the server URL (default: your Cloudflare Worker)
2. Set the organization ID (default: org_default)
3. Click "Run Benchmark" to start

## What Gets Measured

### 1. Cold Start Performance

- WASM bundle download (3.73 MB)
- WASM compilation time
- Data fetch from server
- Graph construction in KuzuDB
- **Target**: < 5 seconds (one-time cost)

### 2. Permission Check Scenarios

- Direct User Permissions (1,000 checks)
- Group Permissions (1,000 checks)
- Multi-Hop Chains (500 checks, 3+ hops)
- Mixed Workload (1,000 checks)
- High Concurrency (100 simultaneous)
- Batch Queries (1,000 checks)

### 3. Memory Usage

- JavaScript heap size
- IndexedDB storage
- **Target**: < 100 MB

## Results

Benchmarks automatically:

- Display results in the UI
- Save JSON results file (download button)
- Store in `../results/client-benchmarks/` directory

## Report Generation

After running benchmarks, generate the comprehensive report:

```bash
cd ../benchmarks
python generate_comprehensive_report.py
```

This will include your client-side results in `results/BENCHMARK_RESULTS.md`.

## Architecture

```
client/
├── src/
│   └── client.ts              # KuzuAuth client SDK
├── benchmarks/
│   ├── metrics-collector.ts   # Performance measurement
│   ├── scenarios.ts           # Test scenarios
│   └── runner.ts              # Benchmark orchestration
├── benchmark.html             # Interactive UI
└── package.json
```

## Key Features

- **Zero-latency checks**: No network roundtrip
- **Offline capable**: Works without connection
- **Service Worker**: Fast cached loads (50-100ms)
- **IndexedDB**: Persistent graph data
- **WebSocket sync**: Real-time updates

## Browser Requirements

- Modern browser with:
  - WebAssembly support
  - IndexedDB support
  - Service Worker support (optional, for caching)
  - Performance API

## Browser Support

- Chrome/Edge 90+
- Firefox 89+
- Safari 15.4+

Requires:

- WebAssembly
- IndexedDB
- WebSocket
- ES2020

## Troubleshooting

**CORS Issues**: Make sure your Cloudflare Worker has CORS enabled for the client origin.

**Memory Issues**: The benchmark loads a large graph dataset. Ensure you have sufficient memory available.

**Service Worker**: First run won't use Service Worker cache. Subsequent runs will be much faster.

## License

MIT

## Related Packages

- [`@kuzu-auth/sdk`](../cloudflare/sdk) - Server-side SDK for Node.js
- [`kuzu-wasm`](https://www.npmjs.com/package/kuzu-wasm) - KuzuDB WASM runtime
