# Cloudflare Durable Objects: Key Findings & Lessons Learned

## The Problem We're Facing

**Symptom**: Old Durable Object instances continue running with old code/schema even after deployments.

**Impact**: SQL errors persist because the old `org_default` DO has wrong `mutation_log` schema, and it won't reinitialize.

---

## Critical DO Lifecycle Facts

### 1. **Durable Objects Are Long-Lived by Design**

From [Cloudflare Docs](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/):

> "While in the idle, in-memory, non-hibernateable state, **after 70-140 seconds of inactivity (no incoming requests or events), the Durable Object will be evicted entirely from memory** and potentially from the Cloudflare host and transition to the inactive state"

**Key Points:**

- DOs stay in memory as long as they receive requests
- **Eviction only happens after 70-140 seconds of ZERO activity**
- During active development/testing, DOs rarely become inactive
- Our benchmark tests keep the DO alive indefinitely

### 2. **`idFromName()` Creates Deterministic, Persistent IDs**

From [Cloudflare Docs](https://developers.cloudflare.com/durable-objects/api/namespace/):

> "idFromName creates a unique DurableObjectId which refers to an individual instance of the Durable Object class"

**Key Points:**

- Same name = same DO instance forever
- `idFromName("org_default")` always returns the same DO
- Changing org names (org_fresh, org_fresh2) doesn't help if they were created earlier
- The first DO created with a name persists until manually deleted or evicted

### 3. **In-Memory State vs SQLite Storage**

From [Cloudflare Docs](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/):

> "A Durable Object's in-memory state is preserved as long as the Durable Object is not evicted from memory. **There are normal operations like code deployments that trigger Durable Objects to restart and lose their in-memory state.**"

**But SQLite storage persists across evictions!**

**Key Points:**

- Code deployments DO NOT automatically update running DOs
- In-memory variables (like `this.mutationLogInitialized`) persist during active use
- SQLite storage persists even when DO is evicted
- Guards like `if (this.mutationLogInitialized) return;` prevent re-initialization

---

## Why Our Fixes Didn't Work

### Attempt 1: Change Org Names (org_fresh, org_fresh2, org_v3)

❌ **Failed**: All new org names were created earlier during testing, so they also have old code

### Attempt 2: Add DROP/CREATE Logic

❌ **Failed**: Guard prevents execution on already-initialized DOs

### Attempt 3: Deploy New Code

❌ **Failed**: Running DO instances don't automatically update to new code

### Attempt 4: Disable Guard

✅ **Worked Once**: Table recreated successfully
❌ **Then Failed**: Guard re-enabled too quickly, old DO still running with old flag

---

## Proper Solutions

### Solution 1: Force DO Eviction (Wait It Out)

**How:**

1. Stop all requests to the DO for 70-140 seconds
2. DO will be evicted from memory
3. Next request reconstructs DO with new code

**Pros:**

- Guaranteed to work eventually
- No manual intervention needed

**Cons:**

- Unpredictable timing (70-140 seconds)
- Can't send ANY requests during waiting period
- Not practical during active development

### Solution 2: Manual DO Deletion via Cloudflare Dashboard

From [Community Discussion](https://community.cloudflare.com/t/how-to-delete-durable-object-completely/560427):

**How:**

1. Navigate to Cloudflare Dashboard
2. Workers & Pages → Your Worker → Durable Objects
3. Find the specific DO instance (e.g., `org_default`)
4. Delete the instance

**Pros:**

- Immediate effect
- Guaranteed fresh start

**Cons:**

- Manual process via web UI
- Data loss (not acceptable for production)

### Solution 3: Schema Version Tracking (Recommended)

From [cris-o.com](https://www.cris-o.com/notes/sqlite-migrations-durable-objects/):

**Pattern:**

```typescript
private async initializeMutationLog(): Promise<void> {
  // Always check schema version, even if already initialized
  const currentVersion = await this.getSchemaVersion();

  if (currentVersion < REQUIRED_SCHEMA_VERSION) {
    console.log(`[DO ${this.orgId}] Migrating schema from v${currentVersion} to v${REQUIRED_SCHEMA_VERSION}`);
    await this.migrateSchema(currentVersion, REQUIRED_SCHEMA_VERSION);
    await this.setSchemaVersion(REQUIRED_SCHEMA_VERSION);
  }

  this.mutationLogInitialized = true;
}

private async getSchemaVersion(): Promise<number> {
  try {
    const result = await this.state.storage.sql.exec(
      `SELECT version FROM schema_version LIMIT 1`
    );
    return result.one()?.version || 0;
  } catch {
    // Table doesn't exist, version is 0
    return 0;
  }
}
```

**Pros:**

- Works on existing DOs without eviction
- Handles schema changes gracefully
- Production-safe (no data loss)
- Idempotent (safe to run multiple times)

**Cons:**

- Requires schema version table
- More complex migration logic

### Solution 4: Use `blockConcurrencyWhile()` in Constructor

From [Cloudflare Docs](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/):

> "Use blockConcurrencyWhile() in the constructor to run migrations and initialize state before any requests are processed. This ensures your schema is ready and prevents race conditions during initialization."

**Pattern:**

```typescript
constructor(state: DurableObjectState, env: Env) {
  super(state, env);

  // Block all requests until initialization complete
  state.blockConcurrencyWhile(async () => {
    await this.initializeMutationLog();
  });
}
```

**Pros:**

- Prevents race conditions
- Guarantees initialization happens first
- No need for manual guards

**Cons:**

- Still doesn't help with already-running DOs
- Blocks all requests during initialization

---

## Our Immediate Fix Strategy

### Option A: Wait for Natural Eviction

1. Stop benchmark tests for 2-3 minutes
2. Wait for `org_default` DO to be evicted (70-140 seconds)
3. Next request will construct fresh DO with new code
4. Keep guard disabled temporarily to force table recreation

### Option B: Delete DO Manually

1. Go to Cloudflare Dashboard
2. Delete `org_default` DO instance
3. Next request creates fresh DO with new code
4. Re-enable guard after confirming success

### Option C: Implement Schema Versioning (Recommended)

1. Add `schema_version` table
2. Check version on every `initializeMutationLog()` call
3. Migrate if version mismatch
4. Works on running DOs without eviction

---

## Long-Term Best Practices

### 1. Always Use Schema Versioning

```typescript
// Store in DO class
private static CURRENT_SCHEMA_VERSION = 2;

// Check on every initialization
private async ensureSchemaVersion(): Promise<void> {
  const currentVersion = await this.getSchemaVersion();

  if (currentVersion < GraphStateCSV.CURRENT_SCHEMA_VERSION) {
    await this.migrateSchema(currentVersion);
  }
}
```

### 2. Use `blockConcurrencyWhile()` for Initialization

```typescript
constructor(state: DurableObjectState, env: Env) {
  super(state, env);

  state.blockConcurrencyWhile(async () => {
    await this.ensureSchemaVersion();
    await this.initializeMutationLog();
  });
}
```

### 3. Design for In-Memory State Loss

- **Never rely on in-memory state for critical data**
- **Always persist to SQLite storage**
- **Assume DO can be evicted/restarted at any time**
- **Initialize from storage in constructor**

### 4. Use Migrations Table

```sql
CREATE TABLE IF NOT EXISTS migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  description TEXT NOT NULL
);
```

Track which migrations have been applied to handle incremental updates.

### 5. Test DO Eviction During Development

```typescript
// Add debug endpoint to force eviction
async fetch(request: Request): Promise<Response> {
  if (request.url.endsWith('/debug/evict')) {
    // Process any pending work
    await this.flush();

    // Return response, then DO will evict after idle timeout
    return new Response('DO will evict in 70-140 seconds');
  }
  // ... normal handling
}
```

---

## References

1. [Durable Objects Lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)
2. [Access Durable Objects Storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
3. [Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
4. [SQLite Migrations in Durable Objects](https://www.cris-o.com/notes/sqlite-migrations-durable-objects/)
5. [Durable Objects FAQ](https://developers.cloudflare.com/durable-objects/reference/faq/)

---

## Action Items

**Immediate (to fix current issue):**

- [ ] Implement schema version checking
- [ ] Add schema_version table
- [ ] Remove reliance on in-memory `mutationLogInitialized` flag
- [ ] OR: Wait 2-3 minutes with no requests to force eviction

**Long-term (prevent future issues):**

- [ ] Use `blockConcurrencyWhile()` in constructor
- [ ] Add migrations table and versioning system
- [ ] Document DO persistence behavior in ARCHITECTURE.md
- [ ] Consider using Pulumi for infrastructure management (easier teardown/recreation)
