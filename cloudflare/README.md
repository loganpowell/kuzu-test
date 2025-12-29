# Cloudflare Zanzibar-Inspired Authorization System

Production-grade implementation of a Google Zanzibar-inspired authorization system running on Cloudflare's edge infrastructure using KuzuDB WASM.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare Worker                          │
│                     (KuzuDB WASM)                               │
│  ┌──────────────────────┐        ┌──────────────────────┐     │
│  │  Permission Checks   │        │   Update Operations  │     │
│  │   (Read Path)        │────────│    (Write Path)      │     │
│  └──────────────────────┘        └──────────────────────┘     │
│              │                              │                   │
└──────────────┼──────────────────────────────┼──────────────────┘
               │                              │
               ▼                              ▼
    ┌──────────────────┐         ┌─────────────────────────┐
    │   Durable Object │         │   Durable Object        │
    │   (Graph State)  │◄────────│   (Write Coordinator)   │
    └──────────────────┘         └─────────────────────────┘
               │                              │
               │                              │
               ▼                              ▼
    ┌──────────────────┐         ┌─────────────────────────┐
    │  R2 Bucket       │         │   Analytics/Logs        │
    │  (Persistence)   │         │   (Workers Analytics)   │
    └──────────────────┘         └─────────────────────────┘
```

## Components

### 1. Pulumi Infrastructure (`pulumi/`)

- Provisions Cloudflare Workers, Durable Objects, R2 buckets
- Manages DNS, routes, and bindings
- Environment configuration (dev/staging/prod)

### 2. Cloudflare Worker (`worker/`)

- Runs KuzuDB WASM for graph queries
- Fast permission checks (<5ms p95)
- Routes reads/writes appropriately
- Memory-optimized for 128MB limit

### 3. Durable Objects (`durable-objects/`)

- **GraphStateObject**: Manages in-memory graph state with persistence to R2
- **WriteCoordinator**: Ensures consistency for concurrent writes
- Handles graph updates (grant, revoke, add entities)

### 4. SDK (`sdk/`)

- TypeScript/JavaScript SDK for client applications
- Simple API: `check()`, `grant()`, `revoke()`, `listPermissions()`
- Built-in retry logic and error handling
- Compatible with Node.js, browsers, and edge runtimes

### 5. Load Tests (`tests/`)

- Stress tests for Cloudflare constraints
- Concurrent permission checks
- Write throughput validation
- Memory usage profiling
- Latency benchmarks (p50, p95, p99)

## Cloudflare Runtime Constraints

| Constraint             | Limit                   | Strategy                            |
| ---------------------- | ----------------------- | ----------------------------------- |
| Memory                 | 128MB                   | Graph partitioning, lazy loading    |
| CPU Time               | 50ms (free), 30s (paid) | Async operations, batch processing  |
| Request Size           | 100MB                   | Chunked uploads for large graphs    |
| Durable Object Storage | 1GB per object          | Multiple objects for large datasets |
| R2 Storage             | Unlimited               | Full graph backups                  |

## Features

✅ **Google Zanzibar-inspired model**

- Tuple-based permissions (user:id#relation@resource:id)
- Group inheritance
- Transitive relationships

✅ **Edge performance**

- Sub-5ms permission checks at p95
- Global distribution via Cloudflare's network
- Durable Objects for strong consistency

✅ **Production-ready**

- Infrastructure as Code (Pulumi)
- Comprehensive error handling
- Observability (logs, metrics, traces)
- Load tested for real-world scenarios

✅ **Developer-friendly SDK**

- Simple, intuitive API
- TypeScript support
- Framework agnostic

## Quick Start

### Prerequisites

```bash
# Install dependencies
npm install

# Install Pulumi CLI
curl -fsSL https://get.pulumi.com | sh

# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### Deploy Infrastructure

```bash
cd pulumi
npm install

# Configure Cloudflare credentials
pulumi config set cloudflare:apiToken $CLOUDFLARE_API_TOKEN
pulumi config set cloudflare:accountId $CLOUDFLARE_ACCOUNT_ID

# Deploy to dev environment
pulumi up
```

### Deploy Worker

```bash
cd ../worker
npm install
npm run deploy
```

### Use the SDK

```typescript
import { AuthClient } from "@kuzu-auth/sdk";

const client = new AuthClient({
  workerUrl: "https://auth.your-domain.workers.dev",
});

// Check permission
const hasAccess = await client.check({
  user: "user:alice",
  permission: "read",
  resource: "resource:doc123",
});

// Grant permission
await client.grant({
  user: "user:alice",
  permission: "write",
  resource: "resource:doc123",
});

// List user's permissions
const permissions = await client.listUserPermissions("user:alice");
```

### Run Load Tests

```bash
cd tests
npm install

# Run stress test
npm run stress-test

# Run latency benchmark
npm run benchmark

# Run memory profiling
npm run memory-test
```

## Performance Goals

| Metric                 | Target    | Rationale                     |
| ---------------------- | --------- | ----------------------------- |
| Permission Check (p50) | <2ms      | Real-time authorization       |
| Permission Check (p95) | <5ms      | Acceptable for most use cases |
| Permission Check (p99) | <10ms     | Tolerable worst-case          |
| Write Latency          | <50ms     | Async acceptable for grants   |
| Concurrent Checks      | >10,000/s | High-traffic applications     |
| Memory Usage           | <100MB    | Within Cloudflare 128MB limit |

## Development

```bash
# Install all dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Local development
cd worker
npm run dev  # Starts local worker with miniflare
```

## Project Structure

```
cloudflare/
├── pulumi/                 # Infrastructure as Code
│   ├── index.ts           # Main Pulumi program
│   ├── worker.ts          # Worker configuration
│   ├── durable-objects.ts # DO configuration
│   └── r2.ts              # R2 bucket setup
├── worker/                # Cloudflare Worker
│   ├── src/
│   │   ├── index.ts       # Worker entry point
│   │   ├── auth.ts        # Permission checking logic
│   │   └── kuzu.ts        # WASM integration
│   └── wrangler.toml      # Worker configuration
├── durable-objects/       # Durable Object implementations
│   ├── graph-state.ts     # Graph state management
│   └── write-coordinator.ts # Write coordination
├── sdk/                   # Client SDK
│   ├── src/
│   │   ├── client.ts      # Main client
│   │   ├── types.ts       # Type definitions
│   │   └── errors.ts      # Error handling
│   └── package.json
├── tests/                 # Load and stress tests
│   ├── stress-test.ts     # Concurrent load test
│   ├── benchmark.ts       # Latency benchmarks
│   └── memory-test.ts     # Memory profiling
└── README.md
```

## License

MIT
