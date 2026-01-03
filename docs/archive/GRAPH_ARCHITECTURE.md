# Permission Graph Architecture

## The "One Graph, Two Instances" Pattern

### Core Concept

We maintain **one authoritative graph state**, but instantiate it in two places:

```
                    ┌─────────────────────────────────┐
                    │  Durable Object Storage         │
                    ├─────────────────────────────────┤
                    │  SQLite: mutation_log           │
                    │  - Version-ordered mutations    │
                    │  - Source of truth              │
                    │  - Append-only log              │
                    └─────────────────┬───────────────┘
                                      │
                         Every 5s or on broadcast
                                      │
                                      ↓
                    ┌─────────────────────────────────┐
                    │  CSV Export (Single File)       │
                    ├─────────────────────────────────┤
                    │  Users: Alice, Bob, Charlie     │
                    │  Resources: doc1, doc2, doc3    │
                    │  Grants: Alice→doc1→read        │
                    │  Groups: eng, leads             │
                    │  Memberships: Alice∈eng         │
                    └─────────────────┬───────────────┘
                                      │
                        Stored in KV (R2-backed)
                                      │
                        ┌─────────────┴─────────────┐
                        │                           │
                        ↓                           ↓
        ┌───────────────────────────┐   ┌───────────────────────────┐
        │  SERVER KuzuDB Instance   │   │  CLIENT KuzuDB Instance   │
        ├───────────────────────────┤   ├───────────────────────────┤
        │  • Loads CSV from KV      │   │  • Loads CSV from HTTP    │
        │  • Initialized on-demand  │   │  • Initialized on mount   │
        │  • Validates permissions  │   │  • Fast UI checks         │
        │  • Authoritative checks   │   │  • Read-only queries      │
        │  • Lives in DO process    │   │  • Lives in browser WASM  │
        └───────────────────────────┘   └───────────────────────────┘
                   ^                                    ^
                   │                                    │
            Used for validation                  Used for UX
```

### Data Flow

#### Mutation Flow (Write Path)

```
1. User Action (Client)
   "Grant Alice read access to doc1"
   │
   ↓
2. WebSocket Message to Server
   {type: 'mutate', op: 'grant', user: 'Alice', resource: 'doc1', permission: 'read'}
   │
   ↓
3. Durable Object Validates
   • Authenticate: Is this user allowed to grant permissions?
   • Authorize: Check actor's role (admin, owner, etc.)
   • Validate: Is this a valid mutation?
   │
   ↓
4. Append to SQLite Log
   INSERT INTO mutation_log (version, type, data, timestamp)
   version++
   │
   ↓
5. Export to CSV (debounced 5s)
   SELECT all grants, groups, memberships → CSV format
   │
   ↓
6. Store CSV in KV
   await env.AUTH_CSV.put(orgId, csvData)
   │
   ↓
7. Broadcast to All Clients
   {type: 'update', version: N, grant: {user: 'Alice', ...}}
   │
   ↓
8. Clients Apply Update Locally
   KuzuDB incremental update or CSV reload
```

#### Query Flow (Read Path)

##### Client-Side (Fast UX)

```
User: Can Alice edit doc1?
   │
   ↓
Client KuzuDB (0ms, in-memory):
   MATCH (u:User {name: 'Alice'})-[:HAS_PERMISSION]->(r:Resource {name: 'doc1'})
   WHERE permission = 'edit'
   RETURN count(*) > 0
   │
   ↓
UI Decision:
   if (canEdit) show EditButton()
   else hide EditButton()
```

##### Server-Side (Authoritative Validation)

```
User: DELETE /documents/doc1
   │
   ↓
Server validates JWT/session
   │
   ↓
Server KuzuDB queries:
   MATCH (u:User {name: 'Alice'})-[:HAS_PERMISSION]->(r:Resource {name: 'doc1'})
   WHERE permission = 'delete' OR permission = 'owner'
   RETURN count(*) > 0
   │
   ↓
if (canDelete) {
  await db.documents.delete(doc1)
  return 200 OK
} else {
  return 403 Forbidden
}
```

## Server-Side Validation Options

### Option 1: Server-Side KuzuDB (Recommended)

**Pros**:

- Same query language as client (consistent logic)
- Complex relationship queries (inherited permissions, groups)
- Reuses existing CSV export
- No schema duplication

**Cons**:

- Memory overhead (~10-50MB per org for large graphs)
- Need to handle KuzuDB initialization in DO
- Graph reload on schema changes

**Implementation**:

```typescript
class GraphStateCSV {
  private serverKuzu: Database | null = null;

  private async ensureServerKuzu(): Promise<Database> {
    if (this.serverKuzu) return this.serverKuzu;

    // Load CSV from KV
    const csvData = await this.env.AUTH_CSV.get(this.orgId);

    // Initialize KuzuDB in DO process
    this.serverKuzu = new Database(":memory:");
    await this.serverKuzu.loadCSV(csvData);

    return this.serverKuzu;
  }

  async validatePermission(
    userId: string,
    permission: string,
    resourceId: string
  ): Promise<boolean> {
    const db = await this.ensureServerKuzu();

    const result = await db.query(
      `
      MATCH (u:User {id: $userId})-[:HAS_PERMISSION]->(r:Resource {id: $resourceId})
      WHERE permission = $permission
      RETURN count(*) > 0 AS allowed
    `,
      { userId, permission, resourceId }
    );

    return result.rows[0].allowed;
  }

  async handleCRUDOperation(
    userId: string,
    operation: string,
    resourceId: string
  ): Promise<Response> {
    // Server-side validation using KuzuDB
    const allowed = await this.validatePermission(
      userId,
      operation,
      resourceId
    );

    if (!allowed) {
      return new Response("Forbidden", { status: 403 });
    }

    // Execute actual CRUD operation
    await this.executeCRUD(operation, resourceId);
    return new Response("OK");
  }
}
```

### Option 2: Simple SQLite Permission Table

**Pros**:

- Lightweight (no graph engine overhead)
- Simple queries (no complex traversal)
- Fast for direct permission checks

**Cons**:

- Duplicate schema (SQLite + KuzuDB)
- Hard to handle inherited permissions, groups
- Can't reuse complex queries from client
- Manual sync with CSV export

**Implementation**:

```typescript
class GraphStateCSV {
  async initializePermissionTable(): Promise<void> {
    await this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS permissions (
        user_id TEXT,
        resource_id TEXT,
        permission TEXT,
        granted_at INTEGER,
        PRIMARY KEY (user_id, resource_id, permission)
      )
    `);

    await this.state.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_permissions_lookup 
      ON permissions(user_id, resource_id, permission)
    `);
  }

  async validatePermission(
    userId: string,
    permission: string,
    resourceId: string
  ): Promise<boolean> {
    const result = await this.state.storage.sql.exec(
      `SELECT COUNT(*) as count FROM permissions 
       WHERE user_id = ? AND resource_id = ? AND permission = ?`,
      userId,
      resourceId,
      permission
    );

    return result.rows[0].count > 0;
  }

  // Must keep SQLite table in sync with CSV export
  async applyMutation(mutation: Mutation): Promise<void> {
    if (mutation.type === "grant") {
      await this.state.storage.sql.exec(
        `INSERT OR REPLACE INTO permissions (user_id, resource_id, permission, granted_at)
         VALUES (?, ?, ?, ?)`,
        mutation.user,
        mutation.resource,
        mutation.permission,
        Date.now()
      );
    } else if (mutation.type === "revoke") {
      await this.state.storage.sql.exec(
        `DELETE FROM permissions 
         WHERE user_id = ? AND resource_id = ? AND permission = ?`,
        mutation.user,
        mutation.resource,
        mutation.permission
      );
    }

    // Also update CSV export for client sync
    await this.exportToCSV();
  }
}
```

**Problem with Option 2**: Can't handle complex queries like:

```cypher
// Check if Alice can access doc1 through group membership
MATCH (u:User {name: 'Alice'})-[:MEMBER_OF]->(g:Group)
      -[:HAS_PERMISSION]->(r:Resource {name: 'doc1'})
WHERE permission = 'read'
RETURN count(*) > 0
```

This requires graph traversal, which KuzuDB excels at but SQLite struggles with.

### Option 3: Dedicated Authorization Service

**Pros**:

- Separation of concerns
- Can use specialized auth engine (OpenFGA, Ory Keto, etc.)
- Centralized across multiple apps
- Battle-tested implementations

**Cons**:

- Additional service to deploy/maintain
- Network latency for auth checks
- More complex architecture
- Licensing/cost considerations

**Architecture**:

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│ Client       │────▶│ Workers + DO     │────▶│ Auth Service   │
│ (UX checks)  │     │ (app logic)      │     │ (validation)   │
└──────────────┘     └──────────────────┘     └────────────────┘
     │                        │                        │
     │                        │                        │
     └────────── Both read from same graph ───────────┘
                    (synced via events)
```

## Recommended Approach: Server-Side KuzuDB

### Why This Works Best

1. **No Duplication**: Same CSV data loaded in both places
2. **Consistent Logic**: Same Cypher queries client and server
3. **Complex Queries**: Handles groups, inheritance, relationships
4. **Single Source of Truth**: SQLite mutation log drives everything
5. **Performance**: In-memory graph queries are fast (<1ms)
6. **Simplicity**: No separate auth service needed

### Memory Considerations

**Typical permission graph sizes**:

- Small org (10 users, 100 resources): ~1MB
- Medium org (100 users, 10K resources): ~10MB
- Large org (1000 users, 100K resources): ~50-100MB

**Durable Object memory limits**: 128MB per DO instance

**Strategy**: Each org gets its own DO instance (`idFromName(orgId)`), so each has 128MB available.

### Implementation Phases

**Phase 1: Add Server-Side KuzuDB to DO** ✅ (Ready to implement)

- [ ] Initialize KuzuDB in Durable Object
- [ ] Load CSV from KV storage
- [ ] Implement `validatePermission(user, permission, resource)` method
- [ ] Handle graph reloads on mutation

**Phase 2: Add Validation to CRUD Endpoints** ✅ (Ready to implement)

- [ ] Wrap all CRUD operations with permission checks
- [ ] Return 403 Forbidden for unauthorized requests
- [ ] Audit log all access attempts

**Phase 3: Performance Optimization** (Future)

- [ ] Cache validation results (with TTL)
- [ ] Lazy-load graph (only when first validation needed)
- [ ] Incremental graph updates (avoid full CSV reload)

## Graph Consistency Guarantees

### Strong Consistency on Server

The Durable Object provides **strong consistency** for the authoritative graph:

- Single-instance per org (no split brain)
- Sequential mutation log (ordered by version)
- Atomic SQLite transactions
- All mutations linearizable

### Eventual Consistency on Clients

Clients have **eventual consistency**:

- May be behind server by 1-2 versions during concurrent updates
- Catch up via WebSocket broadcasts
- Can request full state with GET /changes?since=version
- Acceptable for UX (not for security)

### Validation Always Uses Latest State

```typescript
async handleCRUD(request: Request): Promise<Response> {
  const user = await authenticateRequest(request);

  // ALWAYS validate against current server graph
  const allowed = await this.validatePermission(user.id, 'delete', resourceId);

  // Client may have stale state (showing delete button)
  // But server always uses authoritative state
  if (!allowed) {
    return new Response('Forbidden', { status: 403 });
  }

  await this.executeDelete(resourceId);
  return new Response('OK');
}
```

## Example: Complete Flow

### Scenario: Alice tries to delete a document

```
1. Client UI Check (UX optimization)
   ─────────────────────────────────────
   const canDelete = await authClient.can('delete', 'doc1');
   // Queries client KuzuDB (may be slightly stale)
   // Returns: true (shows Delete button)

2. User Clicks Delete
   ─────────────────────────────────────
   await fetch('/documents/doc1', { method: 'DELETE' })

3. Server Receives Request
   ─────────────────────────────────────
   • Extracts session from HTTP-only cookie
   • Validates JWT → userId = 'alice'

4. Server Validates Permission (AUTHORITATIVE)
   ─────────────────────────────────────
   const db = await this.ensureServerKuzu();
   const allowed = await db.query(`
     MATCH (u:User {id: 'alice'})-[:HAS_PERMISSION]->(r:Resource {id: 'doc1'})
     WHERE permission IN ['delete', 'owner']
     RETURN count(*) > 0
   `);

   // Uses SERVER KuzuDB (always current)

5. Execute or Reject
   ─────────────────────────────────────
   if (allowed) {
     await db.documents.delete('doc1');
     await auditLog('alice', 'delete', 'doc1', 'success');
     return 200 OK;
   } else {
     await auditLog('alice', 'delete', 'doc1', 'denied');
     return 403 Forbidden;
   }
```

### What if Client State is Stale?

```
Timeline:
  t=0: Alice has delete permission
  t=1: Admin revokes Alice's permission (server updated)
  t=2: Alice's client hasn't received WebSocket update yet (stale)
  t=3: Alice clicks Delete button (client thinks she can)
  t=4: Server validates → DENIED (uses current state)
  t=5: Client shows error: "Permission denied"
  t=6: WebSocket update arrives → button disappears
```

**Result**: Even with stale client state, security is maintained by server validation.

## Summary

**Question**: "Won't we need a duplicate graph representation on the server?"

**Answer**: Yes and no:

- ✅ **Yes**: We instantiate KuzuDB on both client and server
- ❌ **No**: It's not a "duplicate" - same CSV data, different purposes
- 🎯 **Design**: Single source of truth (SQLite) → CSV → Two KuzuDB instances

**Benefits**:

- Consistent query language (Cypher) everywhere
- Fast UX (client checks 0ms, no network)
- Secure validation (server checks authoritative state)
- Simple architecture (no separate auth service)
- Complex queries (groups, inheritance, relationships)

**Next Steps**: Implement server-side KuzuDB validation in Durable Object.
