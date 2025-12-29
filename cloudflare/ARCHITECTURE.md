# Client-Side Authorization with KuzuDB WASM

## Overview

**Client-side authorization** system using KuzuDB WASM in the browser for zero-latency graph queries, with Cloudflare Durable Objects as the coordination layer for state synchronization and mutations.

This architecture solves the fundamental incompatibility of running KuzuDB WASM in Cloudflare Workers by moving graph computation to where it belongs: **the client**.

## Why Client-Side Authorization

### Aligned with Zanzibar's Original Vision

Google's Zanzibar paper describes a system where:

- **Clients cache relationship graphs locally** for fast authorization checks
- **Server handles writes** and broadcasts changes to clients
- **Zero-latency checks** for most queries (no network roundtrip)

This is the **correct** architecture for authorization at scale.

### KuzuDB WASM: Perfect for Browsers

- ✅ Browser has `document`, `window` - kuzu-wasm works perfectly
- ✅ Full graph traversal capabilities (arbitrary path finding)
- ✅ **Zero-latency** permission checks (0ms - no network)
- ✅ Works offline after initial data load
- ✅ 3.73 MB bundle downloaded once, cached by browser
- ✅ Scales to millions of users (computation distributed to clients)

## Why KuzuDB is Required

The authorization system needs **arbitrary graph traversals** to find indirect permissions and relationships between users and resources. This goes beyond simple transitive group resolution:

### Use Case: `user.can("edit", "resource:123")`

The system must check if a user has a given capability (create, read, update, delete) on a resource **through any connected relationship path**. For example:

1. **Direct permission**: `user → HAS_USER_PERMISSION → resource`
2. **Group permission**: `user → MEMBER_OF → group → HAS_GROUP_PERMISSION → resource`
3. **Inherited group permission**: `user → MEMBER_OF → group → INHERITS_FROM → parent_group → HAS_GROUP_PERMISSION → resource`
4. **Multi-hop relationships**: Any path connecting user to resource with the capability

### Why Map-Based Implementation is Insufficient

The Map-based implementation (GraphStateCSV) only handles **simple transitive resolution** through direct group inheritance. It cannot:

- ❌ Find arbitrary paths between user and resource
- ❌ Support complex multi-hop permission chains
- ❌ Handle flexible relationship types beyond predefined patterns
- ❌ Scale query complexity without manual index management
- ❌ **This is why we need a real graph database**

### Why Server-Side KuzuDB Failed

**Runtime Incompatibility** with Cloudflare Workers:

- ❌ kuzu-wasm requires browser/Node.js APIs (`document`, `process`, etc.)
- ❌ Cloudflare Workers runtime provides neither
- ❌ Error: `Cannot read properties of undefined (reading 'href')`
- ❌ No workaround exists

**Solution**: Move KuzuDB to the client where it works natively.

### KuzuDB Benefits for Authorization

- ✅ **Native graph traversal**: Built-in BFS/DFS algorithms
- ✅ **Cypher-like queries**: Express complex traversals declaratively
- ✅ **Automatic path finding**: No manual index management needed
- ✅ **Variable-length paths**: `INHERITS_FROM*0..` for arbitrary depth
- ✅ **Multi-pattern matching**: UNION queries for different permission types

## Architecture: Client-Side Graph with Server Coordination

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser Client                                                 │
│  ──────────────────────────────────────────────────────────     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ KuzuDB WASM (~3.73 MB, cached)                          │    │
│  │ ├── Local authorization graph (in-memory)               │    │
│  │ ├── Cypher-like queries                                 │    │
│  │ └── Permission checks: 0ms (no network!)                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                         ↕                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Client SDK                                              │    │
│  │ ├── user.can("edit", "resource:123") → KuzuDB query     │    │
│  │ ├── WebSocket connection to Durable Object              │    │
│  │ └── Sync engine (handle mutations & updates)            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                         ↕ WebSocket
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Durable Object (One per Organization)               │
│  ──────────────────────────────────────────────────────────     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Coordination Layer (~20 KB bundle!)                     │    │
│  │ ├── Authoritative state pointer (R2)                    │    │
│  │ ├── WebSocket connections (all org clients)             │    │
│  │ ├── Mutation handling (grant/revoke)                    │    │
│  │ └── Broadcast updates to clients                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                         ↕                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ SQLite (Durable Object Storage)                         │    │
│  │ ├── Connection state                                    │    │
│  │ ├── Last sync version per client                        │    │
│  │ └── Pending mutations queue                             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                         ↕
┌─────────────────────────────────────────────────────────────────┐
│  R2 Bucket (Source of Truth - Per-Org Partitions)               │
│  ──────────────────────────────────────────────────────────     │
│  org_acme/                    org_widgets/                      │
│  ├── users.csv                ├── users.csv                     │
│  ├── groups.csv               ├── groups.csv                    │
│  ├── resources.csv            ├── resources.csv                 │
│  ├── member_of.csv            ├── member_of.csv                 │
│  ├── inherits_from.csv        ├── inherits_from.csv             │
│  ├── user_permissions.csv     ├── user_permissions.csv          │
│  └── group_permissions.csv    └── group_permissions.csv         │
│                                                                 │
│  • CSV is 30-40% faster to parse than JSON                      │
│  • Each org is fully isolated                                   │
│  • Version number in metadata for sync                          │
└─────────────────────────────────────────────────────────────────┘
```

### Durable Object (Cloudflare Workers)

**Responsibilities:**

- Accept WebSocket connections from clients
- Serve initial graph data (R2 CSV files)
- Handle mutations (grant/revoke permissions)
- Write mutations to R2
- Broadcast updates to all connected clients
- Track sync state per client

**Implementation:**

```typescript
export class GraphStateSync {
  private connections: Map<string, WebSocket> = new Map();
  private orgId: string;

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");

    if (upgrade === "websocket") {
      return this.handleWebSocket(request);
    }

    if (request.url.endsWith("/data")) {
      // Serve initial graph data
      return this.serveGraphData();
    }

    if (request.url.endsWith("/mutate")) {
      // Handle permission grant/revoke
      return this.handleMutation(request);
    }
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.connections.set(crypto.randomUUID(), server);

    server.accept();
    server.addEventListener("message", (event) => {
      this.handleClientMessage(server, event.data);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleMutation(request: Request): Promise<Response> {
    const { operation, ...params } = await request.json();

    // Apply mutation to R2
    await this.applyMutation(operation, params);

    // Broadcast to all connected clients
    this.broadcast({
      type: "mutation",
      operation,
      params,
    });

    return Response.json({ success: true });
  }
}
```

### R2 Storage (Cloudflare)

**Responsibilities:**

- Store authoritative graph state (CSV files per org)
- Version tracking for sync protocol
- Serve initial data to clients
- Accept mutations from Durable Objects

**Structure:**

```
org_acme/
├── version.txt (e.g., "47")
├── users.csv
├── groups.csv
├── resources.csv
├── member_of.csv
├── inherits_from.csv
├── user_permissions.csv
└── group_permissions.csv
```

## Benefits of This Architecture

### Performance

- ✅ **Zero-latency authorization checks** (0ms - pure local computation)
- ✅ No network roundtrip for 99.9% of operations
- ✅ Scales to millions of users (computation distributed to clients)
- ✅ Server handles only mutations and sync (minimal load)

### Cost

- ✅ **Dramatically lower server costs** (no compute for checks)
- ✅ Cloudflare Workers: ~$5/mo + minimal R2 storage
- ✅ Bandwidth optimized (initial load + incremental updates only)

### User Experience

- ✅ Instant permission checks (feels native)
- ✅ Works offline after initial load
- ✅ Real-time updates via WebSocket
- ✅ No loading spinners for authorization

### Developer Experience

- ✅ Full graph query power in client SDK
- ✅ Same API as server-side authorization
- ✅ Easy to test (deterministic, no network)
- ✅ TypeScript SDK with full type safety

### Correctness

- ✅ Arbitrary graph traversals (no predefined patterns)
- ✅ Multi-hop permission chains supported
- ✅ Variable-length path queries (`INHERITS_FROM*0..`)
- ✅ Eventual consistency with real-time updates

## Sync Protocol

### Initial Load

```typescript
// 1. Client connects via WebSocket
const ws = new WebSocket("wss://kuzu-auth.../org/acme/sync");

// 2. Request current version
ws.send(JSON.stringify({ type: "get_version" }));

// 3. Receive version number
// { type: 'version', version: 47 }

// 4. Download graph data
const response = await fetch("https://kuzu-auth.../org/acme/data?version=47");
const { users, groups, resources, ...relationships } = await response.json();

// 5. Build local KuzuDB graph
await kuzu.loadData(users, groups, resources, relationships);

// 6. Ready for zero-latency checks!
```

### Incremental Updates

```typescript
// Client maintains WebSocket connection
ws.onmessage = (event) => {
  const update = JSON.parse(event.data);

  if (update.type === "mutation") {
    // Apply incremental update to local graph
    switch (update.operation) {
      case "grant":
        kuzu.addPermission(update.params);
        break;
      case "revoke":
        kuzu.removePermission(update.params);
        break;
      case "add_user":
        kuzu.addUser(update.params);
        break;
    }
  }
};
```

### Mutation Flow

```typescript
// Client requests mutation
await authClient.grant('user:alice', 'edit', 'resource:doc-123');

// 1. Send to Durable Object via WebSocket
ws.send(JSON.stringify({
  type: 'mutate',
  operation: 'grant',
  params: { user: 'user:alice', action: 'edit', resource: 'resource:doc-123' }
}));

// 2. Durable Object applies to R2
await r2.put('org_acme/user_permissions.csv', updatedCSV);

// 3. Durable Object broadcasts to ALL clients
broadcast({ type: 'mutation', operation: 'grant', params: {...} });

// 4. All clients apply update locally
// Now every client has the new permission in their local graph
```

## Service Worker Considerations

### Why Service Workers Matter

Service Workers provide critical capabilities for production authorization systems:

1. **WASM Caching**: Cache 3.73 MB WASM bundle across sessions
2. **Offline Support**: Handle authorization checks when offline
3. **Background Sync**: Queue mutations when offline, sync when reconnected
4. **Fast Cold Starts**: Instant load from cache vs 2-5s download
5. **Shared State**: Graph data shared across all tabs

### Architecture Options

#### Option A: WASM in Main Thread (Recommended Start)

**How it works:**

```
Page Load
├── Check Service Worker cache for WASM
├── Load WASM into main thread
├── Load graph data from IndexedDB (or fetch)
├── Initialize KuzuDB
└── Ready for permission checks
```

**Pros:**

- ✅ Simple implementation
- ✅ Direct API access (no message passing)
- ✅ Easy debugging
- ✅ Service Worker just handles caching

**Cons:**

- ⚠️ Each tab has separate graph instance
- ⚠️ Each page load rebuilds graph (~100-500ms)
- ⚠️ More memory usage (multiple tabs = multiple graphs)

**Implementation:**

```typescript
// service-worker.js
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("kuzu-auth-v1").then((cache) => {
      return cache.addAll([
        "/node_modules/kuzu-wasm/index.js",
        "/kuzu-wasm.wasm",
        "/auth-client.js",
      ]);
    })
  );
});

// main.js
const kuzu = await import("kuzu-wasm"); // Served from cache
const db = new kuzu.Database(":memory:");
const graphData = await loadFromIndexedDB(); // or fetch
await db.loadData(graphData);
```

#### Option B: WASM in Service Worker (Advanced)

**How it works:**

```
Service Worker (Background)
├── Instantiate KuzuDB WASM
├── Load graph data
├── Handle permission checks via postMessage
└── Persist across page loads

Main Thread
├── Send check request to Service Worker
├── Receive response via postMessage
└── ~10-20ms latency (message passing overhead)
```

**Pros:**

- ✅ Graph persists across page loads/refreshes
- ✅ Shared across all tabs (single source of truth)
- ✅ Better offline support
- ✅ Memory efficient (one graph for all tabs)
- ✅ Background sync while page is closed

**Cons:**

- ⚠️ More complex (message passing for every check)
- ⚠️ 10-20ms latency overhead vs 0ms direct
- ⚠️ Harder to debug
- ⚠️ Service Worker lifecycle complexity

**Implementation:**

```typescript
// service-worker.js
importScripts("kuzu-wasm/index.js");

let db, conn;

self.addEventListener("message", async (event) => {
  if (event.data.type === "check_permission") {
    const { user, action, resource } = event.data;
    const allowed = await checkPermission(user, action, resource);
    event.ports[0].postMessage({ allowed });
  }
});

async function initKuzu() {
  const kuzu = await kuzu_wasm.init();
  db = new kuzu.Database(":memory:");
  conn = new kuzu.Connection(db);
  // Load graph data
}

// main.js
async function can(user, action, resource) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data.allowed);
    navigator.serviceWorker.controller.postMessage(
      {
        type: "check_permission",
        user,
        action,
        resource,
      },
      [channel.port2]
    );
  });
}
```

#### Option C: Hybrid (Best of Both Worlds)

**How it works:**

```
Service Worker
├── Cache WASM bundle
├── Cache graph data
├── Handle background sync
└── Update IndexedDB

Main Thread
├── Load WASM from cache (fast!)
├── Load graph from IndexedDB
├── Direct permission checks (0ms)
└── Subscribe to Service Worker updates
```

**Pros:**

- ✅ Fast: 0ms permission checks (main thread)
- ✅ Reliable: WASM + data cached
- ✅ Offline: Service Worker handles sync
- ✅ Simple: No message passing for checks

**Implementation:**

```typescript
// service-worker.js
// Just handle caching and sync
self.addEventListener("sync", async (event) => {
  if (event.tag === "sync-permissions") {
    await syncPendingMutations();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("kuzu-wasm")) {
    event.respondWith(
      caches
        .match(event.request)
        .then((response) => response || fetch(event.request))
    );
  }
});

// main.js
const kuzu = await import("kuzu-wasm"); // From cache
const db = new kuzu.Database(":memory:");

// Load from IndexedDB (managed by Service Worker)
const graphData = await idb.get("graph-data");
await db.loadData(graphData);

// Direct checks - no message passing!
const allowed = await db.checkPermission(user, action, resource);
```

### Recommended Approach: Hybrid (Option C)

**Phase 1: Basic Service Worker**

- Cache WASM bundle (3.73 MB)
- Cache graph data in IndexedDB
- WASM runs in main thread

**Phase 2: Background Sync**

- Service Worker queues offline mutations
- Syncs when connection restored
- Updates IndexedDB

**Phase 3: Advanced (Optional)**

- Move to Shared Worker for tab communication
- Consider WASM in Service Worker for specific use cases
- Optimize for PWA installation

### IndexedDB Schema

```typescript
// Store graph data locally
const db = await openDB('kuzu-auth', 1, {
  upgrade(db) {
    // Graph data store
    db.createObjectStore('graph-data', { keyPath: 'orgId' });

    // Pending mutations store
    db.createObjectStore('pending-mutations', {
      keyPath: 'id',
      autoIncrement: true
    });

    // Version tracking
    db.createObjectStore('sync-state', { keyPath: 'orgId' });
  }
});

// Store graph data
await db.put('graph-data', {
  orgId: 'org_acme',
  version: 47,
  users: [...],
  groups: [...],
  resources: [...],
  relationships: [...]
});

// Queue offline mutation
await db.add('pending-mutations', {
  operation: 'grant',
  params: { user, action, resource },
  timestamp: Date.now()
});
```

### WASM Loading Strategy

```typescript
async function initializeAuth() {
  // 1. Check if WASM is cached by Service Worker
  const wasmCached = await caches.match("/kuzu-wasm.wasm");

  // 2. Load WASM module
  const kuzu = await import("kuzu-wasm"); // Fast from cache
  await kuzu.init();

  // 3. Load graph data from IndexedDB
  const idb = await openDB("kuzu-auth");
  const graphData = await idb.get("graph-data", orgId);

  if (!graphData || graphData.version < latestVersion) {
    // Need to fetch from server
    const response = await fetch(`/org/${orgId}/data`);
    const newGraphData = await response.json();

    // Store in IndexedDB
    await idb.put("graph-data", newGraphData);

    // Build graph
    await buildKuzuGraph(newGraphData);
  } else {
    // Load from IndexedDB (much faster)
    await buildKuzuGraph(graphData);
  }

  // 4. Connect WebSocket for real-time updates
  connectWebSocket();
}
```

### Performance Comparison

| Scenario        | No Service Worker     | With Service Worker Cache | With IndexedDB                |
| --------------- | --------------------- | ------------------------- | ----------------------------- |
| **First Load**  | 2-5s (download WASM)  | 2-5s (same)               | 2-5s (same)                   |
| **Second Load** | 2-5s (download again) | 100-200ms (cached WASM)   | 50-100ms (cached WASM + data) |
| **Offline**     | ❌ Fails              | ⚠️ WASM cached, no data   | ✅ Full offline support       |
| **Tab Switch**  | 2-5s (reload)         | 100-200ms                 | 50-100ms                      |

### Key Recommendations

1. **Start Simple**: Implement Option C (Hybrid) with Service Worker caching only
2. **Add IndexedDB Early**: Store graph data locally to avoid re-downloading
3. **Background Sync**: Queue mutations when offline for reliability
4. **Progressive Enhancement**: Service Worker is optional, app works without it
5. **Monitor Performance**: Track WASM load time, graph build time, cache hit rates

### Updated Implementation Plan

**Phase 1: Client SDK Foundation ✅ COMPLETE**

- ✅ Created `@kuzu-auth/client` package structure
- ✅ KuzuDB WASM integration with IndexedDB caching
- ✅ Graph loading from CSV (via server endpoint)
- ✅ Basic permission check API: `can(user, action, resource)`
- ✅ Comprehensive benchmarking suite (6 scenarios)
- ✅ Interactive benchmark UI with results storage
- ✅ Report generator integration

**Phase 2: Server Data Endpoint 🔄 IN PROGRESS**

- [ ] Update Durable Object to serve graph data in JSON format
- [ ] Create `/org/{orgId}/data` endpoint for initial load
- [ ] Create `/org/{orgId}/csv` endpoint for raw CSV data
- [ ] Test client can fetch and load real data
- [ ] Run first client-side benchmark with real dataset

**Phase 3: WebSocket Sync Protocol**

- [ ] Durable Object WebSocket handler
- [ ] Client WebSocket connection manager
- [ ] Mutation handler (grant/revoke)
- [ ] Broadcast updates to connected clients
- [ ] Client-side update application

**Phase 4: Service Worker & Caching**

- [ ] Implement Service Worker with WASM caching
- [ ] Add IndexedDB schema for persistent graph data
- [ ] Warm start benchmark (cached loads)
- [ ] Background sync for offline mutations
- [ ] Test offline scenarios

**Phase 5: Production Features**

- [ ] Multi-org isolation testing
- [ ] Security audit (data exposure, auth)
- [ ] Rate limiting and abuse prevention
- [ ] Monitoring and observability
- [ ] Documentation and deployment guide

**Phase 6: Advanced Features (Future)**

- [ ] Partial graph loading (for large orgs)
- [ ] Graph delta compression
- [ ] Conflict resolution for offline mutations
- [ ] Admin UI for testing
- [ ] Service Worker in production

## Security Considerations

### Data Exposure

- ⚠️ Client downloads entire org's permission graph
- ✅ Only authenticated users can access their org's data
- ✅ Durable Object validates JWT/session before serving data
- ✅ R2 data is never publicly accessible
- ✅ Similar to how Google Docs loads all doc permissions to client

### Authorization

- ✅ Client-side checks are for UX only
- ✅ Server MUST validate all mutations
- ✅ Never trust client-side permission results for backend operations
- ✅ Use server-side validation for sensitive operations

### Abuse Prevention

- ✅ Rate limit WebSocket connections
- ✅ Rate limit mutations per client
- ✅ Monitor for excessive data downloads
- ✅ Cloudflare's built-in DDoS protection

## Comparison: Client-Side vs Server-Side

| Aspect                       | Client-Side (This Architecture) | Server-Side (Workers/Lambda)             |
| ---------------------------- | ------------------------------- | ---------------------------------------- |
| **Permission Check Latency** | 0ms (no network)                | 50-200ms (network + compute)             |
| **Scalability**              | Unlimited (distributed)         | Limited by server capacity               |
| **Cost**                     | ~$5/mo (sync only)              | $50-500/mo (compute)                     |
| **Offline Support**          | ✅ Yes                          | ❌ No                                    |
| **Complex Queries**          | ✅ Full graph power             | ❌ (Map-based) or needs external service |
| **Server Load**              | Minimal (mutations only)        | High (every check)                       |
| **Initial Load Time**        | ~2-5s (download + parse)        | N/A                                      |
| **UX**                       | Instant checks                  | Loading spinners                         |

## Migration Path from Map-Based

1. **Keep both running**: Maintain GraphStateCSV for server-side validation
2. **Add client SDK**: Deploy alongside existing system
3. **Gradual migration**: Start with read-only checks on client
4. **Validate**: Compare client vs server results
5. **Full cutover**: Move all checks to client, server validates mutations only

## Next Steps

1. **Prototype client SDK** with KuzuDB WASM
2. **Update Durable Object** for WebSocket + sync
3. **Test with real data** (5K users, 25K relationships)
4. **Benchmark** client-side query performance
5. **Deploy** and validate architecture

### Client SDK (Browser)

**Responsibilities:**

- Load KuzuDB WASM module (~3.73 MB, cached)
- Download initial graph data from R2 (via Durable Object)
- Build in-memory graph in KuzuDB
- Execute all permission checks locally (0ms latency)
- Maintain WebSocket connection for updates
- Apply incremental updates to local graph

**API:**

```typescript
const authClient = new KuzuAuthClient({
  orgId: "acme",
  workerUrl: "https://kuzu-auth-dev-worker.logan-607.workers.dev",
});

await authClient.initialize(); // Load graph data

// Zero-latency permission check (pure local computation)
const allowed = await authClient.can("user:alice", "edit", "resource:doc-123");

// Find all resources user can edit (graph traversal)
const editableResources = await authClient.findResources("user:alice", "edit");

// Subscribe to permission changes
authClient.onPermissionChange((change) => {
  console.log("Permission updated:", change);
});
```

```
┌─────────────────────────────────────────────────────────────────┐
│  R2 Bucket (Source of Truth - Per-Org Partitions)               │
│  ──────────────────────────────────────────────────────────     │
│  org_acme/                    org_widgets/                       │
│  ├── users.csv                ├── users.csv                      │
│  ├── groups.csv               ├── groups.csv                     │
│  ├── resources.csv            ├── resources.csv                  │
│  ├── member_of.csv            ├── member_of.csv                  │
│  ├── inherits_from.csv        ├── inherits_from.csv              │
│  ├── user_permissions.csv     ├── user_permissions.csv           │
│  └── group_permissions.csv    └── group_permissions.csv          │
│                                                                   │
│  • CSV is 30-40% faster to parse than JSON                       │
│  • Each org is fully isolated                                    │
│  • Write-through updates on grant/revoke                         │
└─────────────────────────────────────────────────────────────────┘
                         ↓ loaded on cold start
┌─────────────────────────────────────────────────────────────────┐
│  Durable Objects (One per Organization)                          │
│  ──────────────────────────────────────────────────────────     │
│  DO: "org_acme"               DO: "org_widgets"                  │
│  ├── KuzuDB WASM (~50MB)      ├── KuzuDB WASM (~50MB)            │
│  ├── In-memory graph          ├── In-memory graph                │
│  ├── COPY FROM CSV            ├── COPY FROM CSV                  │
│  └── Cypher-like queries      └── Cypher-like queries            │
│                                                                   │
│  • Isolated per organization                                     │
│  • Native graph traversal (DFS, BFS)                             │
│  • Transitive permission resolution                              │
└─────────────────────────────────────────────────────────────────┘
                         ↓ writes directly back to
┌─────────────────────────────────────────────────────────────────┐
│  R2 Bucket (Same - Write-Through)                                │
│  ──────────────────────────────────────────────────────────     │
│  • Grant: Append to org_acme/user_permissions.csv                │
│  • Revoke: Filter and rewrite org_acme/user_permissions.csv      │
│  • Closes the loop - R2 always up-to-date                        │
│  • Next cold start loads current state automatically             │
│  • No separate backup/merge process needed                       │
└─────────────────────────────────────────────────────────────────┘
```

## Multi-Tenant Routing

```typescript
// Worker entry point - extract orgId from request
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Extract org from path: /org/acme/check or header
    const orgId = extractOrgId(request); // e.g., "org_acme"

    // Get org-specific Durable Object
    const id = env.GRAPH_STATE.idFromName(orgId);
    const stub = env.GRAPH_STATE.get(id);

    // Forward request to org's DO
    return stub.fetch(request);
  },
};
```

## Permission Check with KuzuDB

```typescript
async checkPermission(
  user: string,
  resource: string,
  action: 'create' | 'read' | 'update' | 'delete'
): Promise<boolean> {
  const actionCol = `can_${action}`;

  // Cypher-like query: Find path from user to resource
  const query = `
    MATCH (u:User {id: $userId})-[:HAS_USER_PERMISSION]->(r:Resource {id: $resourceId})
    WHERE r.${actionCol} = true
    RETURN true AS allowed

    UNION

    MATCH (u:User {id: $userId})-[:MEMBER_OF]->(g:Group)
          -[:INHERITS_FROM*0..]->(pg:Group)
          -[:HAS_GROUP_PERMISSION]->(r:Resource {id: $resourceId})
    WHERE r.${actionCol} = true
    RETURN true AS allowed
  `;

  const result = await this.conn.query(query, { userId: user, resourceId: resource });
  return result.hasNext();
}
```

**Benefits:**

- ✅ Native graph traversal (handles inheritance automatically)
- ✅ Single query for complex permission resolution
- ✅ No manual index management
- ✅ Optimized for graph operations
- ✅ Multi-tenant isolation at DO level

## Write-Through Persistence

### On Grant - Direct R2 Update

```typescript
async handleGrant(user: string, permission: string, resource: string) {
  // 1. Add to KuzuDB (in-memory)
  await this.conn.query(`
    MATCH (u:User {id: $user}), (r:Resource {id: $resource})
    CREATE (u)-[:HAS_USER_PERMISSION {
      can_create: $isCreate,
      can_read: $isRead,
      can_update: $isUpdate,
      can_delete: $isDelete
    }]->(r)
  `, { user, resource, ...permissionFlags });

  // 2. Append to R2 CSV immediately (write-through)
  const csvRow = `${user},${resource},${permission === 'create'},${permission === 'read'},...\n`;

  const existing = await this.env.GRAPH_STATE.get(`${this.orgId}/user_permissions.csv`);
  const updated = (await existing.text()) + csvRow;
  await this.env.GRAPH_STATE.put(`${this.orgId}/user_permissions.csv`, updated);

  // ✅ Done! R2 is up-to-date, next cold start loads this automatically
}
```

### On Revoke - Direct R2 Update

```typescript
async handleRevoke(user: string, permission: string, resource: string) {
  // 1. Remove from KuzuDB
  await this.conn.query(`
    MATCH (u:User {id: $user})-[p:HAS_USER_PERMISSION]->(r:Resource {id: $resource})
    DELETE p
  `);

  // 2. Update R2 CSV (filter out revoked permission)
  const existing = await this.env.GRAPH_STATE.get(`${this.orgId}/user_permissions.csv`);
  const csv = await existing.text();

  const lines = csv.split('\n').filter(line =>
    !line.includes(`${user},${resource}`)
  );

  await this.env.GRAPH_STATE.put(
    `${this.orgId}/user_permissions.csv`,
    lines.join('\n')
  );

  // ✅ R2 is source of truth, always current
}
```

**Why write-through is simpler:**

- ✅ No snapshot/merge complexity
- ✅ No separate backup process needed
- ✅ R2 always reflects current state
- ✅ Next cold start loads correct data automatically
- ✅ Closed-loop architecture

## Durable Object Initialization

```typescript
export class GraphState implements DurableObject {
  private db: Database;
  private conn: Connection;
  private orgId: string;
  private initialized: boolean = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Extract org from DO name: GRAPH_STATE.idFromName('org_acme')
    this.orgId = state.id.name; // "org_acme"
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();

    const url = new URL(request.url);

    if (url.pathname === "/check") {
      const { user, resource, action } = await request.json();
      const allowed = await this.checkPermission(user, resource, action);
      return Response.json({ allowed });
    }

    if (url.pathname === "/grant") {
      const { user, permission, resource } = await request.json();
      await this.handleGrant(user, permission, resource);
      return Response.json({ success: true });
    }

    // ... other endpoints
  }

  private async ensureInitialized() {
    if (this.initialized) return;

    // 1. Initialize KuzuDB WASM
    const kuzu = await import("./wasm/kuzu.js");
    this.db = new kuzu.Database(":memory:");
    this.conn = new kuzu.Connection(this.db);

    // 2. Create schema
    await this.createSchema();

    // 3. Load CSV data from R2 for this org
    const tables = [
      "users",
      "groups",
      "resources",
      "member_of",
      "inherits_from",
      "user_permissions",
      "group_permissions",
    ];

    for (const table of tables) {
      const obj = await this.env.GRAPH_STATE.get(`${this.orgId}/${table}.csv`);
      if (!obj) continue; // Skip if file doesn't exist

      const csvText = await obj.text();

      // KuzuDB COPY FROM string
      await this.conn.query(`
        COPY ${table} FROM '${csvText}' (HEADER=true);
      `);
    }

    this.initialized = true;
    console.log(`Initialized ${this.orgId}: loaded ${tables.length} tables`);
  }

  private async createSchema() {
    // Node tables
    await this.conn.query(`
      CREATE NODE TABLE User(id STRING, name STRING, email STRING, PRIMARY KEY(id))
    `);
    await this.conn.query(`
      CREATE NODE TABLE Group(id STRING, name STRING, description STRING, PRIMARY KEY(id))
    `);
    await this.conn.query(`
      CREATE NODE TABLE Resource(id STRING, name STRING, type STRING, PRIMARY KEY(id))
    `);

    // Relationship tables
    await this.conn.query(`
      CREATE REL TABLE MEMBER_OF(FROM User TO Group, role STRING, joined_at TIMESTAMP)
    `);
    await this.conn.query(`
      CREATE REL TABLE INHERITS_FROM(FROM Group TO Group, created_at TIMESTAMP)
    `);
    await this.conn.query(`
      CREATE REL TABLE HAS_USER_PERMISSION(
        FROM User TO Resource,
        can_create BOOLEAN,
        can_read BOOLEAN,
        can_update BOOLEAN,
        can_delete BOOLEAN
      )
    `);
    await this.conn.query(`
      CREATE REL TABLE HAS_GROUP_PERMISSION(
        FROM Group TO Resource,
        can_create BOOLEAN,
        can_read BOOLEAN,
        can_update BOOLEAN,
        can_delete BOOLEAN
      )
    `);
  }
}
```

## KuzuDB Schema

```sql
-- Node tables
CREATE NODE TABLE User(id STRING, name STRING, email STRING, PRIMARY KEY(id));
CREATE NODE TABLE Group(id STRING, name STRING, description STRING, PRIMARY KEY(id));
CREATE NODE TABLE Resource(id STRING, name STRING, type STRING, PRIMARY KEY(id));

-- Relationship tables
CREATE REL TABLE MEMBER_OF(FROM User TO Group, role STRING, joined_at TIMESTAMP);
CREATE REL TABLE INHERITS_FROM(FROM Group TO Group, created_at TIMESTAMP);
CREATE REL TABLE HAS_USER_PERMISSION(
  FROM User TO Resource,
  can_create BOOLEAN,
  can_read BOOLEAN,
  can_update BOOLEAN,
  can_delete BOOLEAN
);
CREATE REL TABLE HAS_GROUP_PERMISSION(
  FROM Group TO Resource,
  can_create BOOLEAN,
  can_read BOOLEAN,
  can_update BOOLEAN,
  can_delete BOOLEAN
);
```

## Performance Characteristics

| Operation                   | Latency          | Notes                        |
| --------------------------- | ---------------- | ---------------------------- |
| Cold start (per org)        | 100-300ms        | R2 CSV fetch + KuzuDB load   |
| Simple permission check     | 1-5ms            | Single-hop query             |
| Complex check (inheritance) | 5-15ms           | Multi-hop graph traversal    |
| Grant/revoke                | 10-30ms          | KuzuDB write + R2 CSV update |
| Throughput                  | 50K-200K ops/sec | Graph query performance      |

**vs Map-based baseline (1.6M ops/sec):**

- KuzuDB adds query overhead but handles complex graph logic natively
- Trade: Throughput for correctness and transitive permission resolution
- Still well within <50ms p95 target
- **This is the actual performance we want to benchmark!**

## Resource Usage

| Resource          | Limit     | Usage        | Notes                   |
| ----------------- | --------- | ------------ | ----------------------- |
| Worker bundle     | 10MB      | ~2MB         | KuzuDB WASM             |
| DO memory         | 128MB     | ~50MB        | In-memory graph per org |
| R2 storage (free) | 10GB      | ~5MB per org | CSV files               |
| DO count          | Unlimited | 1 per org    | Multi-tenant isolation  |

## Bundling KuzuDB WASM

```bash
# Copy WASM from benchmarks directory
cp benchmarks/wasm/node_modules/@kuzu/wasm/dist/* \
   cloudflare/worker/src/wasm/

# Worker structure:
# worker/src/
#   ├── wasm/
#   │   ├── kuzu.wasm
#   │   └── kuzu.js
#   └── durable-objects/
#       └── graph-state.ts (imports ./wasm/kuzu.js)
```

Wrangler bundles WASM automatically. Total: ~2MB (20% of 10MB limit).

## Deployment Workflow

### Initial Setup

```bash
# 1. Upload CSV data to R2 with org partitioning
cd data/csv
for org in acme widgets; do
  for file in *.csv; do
    npx wrangler r2 object put "org_${org}/${file}" --file="${file}"
  done
done

# Verify upload
npx wrangler r2 object list | grep "org_"

# 2. Deploy worker with KuzuDB WASM bundle
cd cloudflare/worker
npm run deploy

# Worker URL: https://kuzu-auth.your-account.workers.dev
```

### Permission Operations

```bash
# Grant permission (write-through to R2)
curl -X POST https://kuzu-auth.workers.dev/org/acme/grant \
  -H "Content-Type: application/json" \
  -d '{"user": "user_123", "permission": "read", "resource": "doc_456"}'

# Check permission (query KuzuDB in-memory)
curl -X POST https://kuzu-auth.workers.dev/org/acme/check \
  -H "Content-Type: application/json" \
  -d '{"user": "user_123", "resource": "doc_456", "action": "read"}'
# Response: {"allowed": true}

# Revoke permission (write-through to R2)
curl -X DELETE https://kuzu-auth.workers.dev/org/acme/grant \
  -H "Content-Type: application/json" \
  -d '{"user": "user_123", "permission": "read", "resource": "doc_456"}'
```

### Adding New Organization

```bash
# 1. Upload org-specific CSV files to R2
npx wrangler r2 object put "org_newcorp/users.csv" --file=newcorp-users.csv
npx wrangler r2 object put "org_newcorp/groups.csv" --file=newcorp-groups.csv
# ... repeat for all CSV files

# 2. First request to /org/newcorp/* creates the DO
curl -X POST https://kuzu-auth.workers.dev/org/newcorp/check \
  -H "Content-Type: application/json" \
  -d '{"user": "admin", "resource": "test", "action": "read"}'

# DO created, CSV loaded from R2, ready to serve
```

## Architecture Benefits

✅ **Multi-tenant isolation** - One DO per organization, complete data separation
✅ **Write-through simplicity** - No snapshot/merge complexity, R2 always current
✅ **Closed-loop** - R2 upstream = R2 downstream, single source of truth
✅ **Sub-50ms latency** - Graph queries optimized, well within target
✅ **CSV performance** - 30-40% faster parsing than JSON (from benchmarks)
✅ **Native graph operations** - KuzuDB handles transitive permissions correctly
✅ **Auto-scaling** - Each org's DO scales independently
✅ **Cost effective** - Free tier: SQLite-backed DOs, R2 storage
✅ **Minimal bundle** - ~2MB for KuzuDB WASM (20% of limit)

## Tradeoffs

⚠️ **Cold start per org** - 100-300ms R2 fetch on first request per org per edge
⚠️ **R2 write latency** - 10-20ms on grant/revoke (acceptable for write ops)
⚠️ **Memory per org** - ~50MB per active DO (128MB limit allows 2+ orgs per worker)
⚠️ **Lower throughput** - 50K-200K vs 1.6M ops/sec (but correct graph logic!)

## Next Steps

1. ✅ Architecture documented (this file)
2. ⏳ Copy KuzuDB WASM: `cp benchmarks/wasm/node_modules/@kuzu/wasm/dist/* cloudflare/worker/src/wasm/`
3. ⏳ Upload CSV to R2 with org partitioning
4. ⏳ Implement GraphState DO with KuzuDB initialization
5. ⏳ Implement multi-tenant routing in worker
6. ⏳ Implement write-through on grant/revoke
7. ⏳ Deploy and benchmark vs baseline (1,240 ops/sec simple, 1.6M ops/sec Map-based)
8. ⏳ Validate transitive permission resolution
9. ⏳ Measure p95 latency under load
