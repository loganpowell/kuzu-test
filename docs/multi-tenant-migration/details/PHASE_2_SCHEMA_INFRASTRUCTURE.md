# Phase 2: Schema Infrastructure - Self-Service Schema Management

**Status:** 40% Complete  
**Duration:** 8-12 weeks  
**Dependencies:** Phase 1 Core Loop (✅ Complete)

---

## 🎯 Goal

Enable **customer self-service schema management** with visual editor, hot reload, and runtime schema updates.

**Key Innovation:** Time to add entity type: **2-3 minutes** (down from 2-4 hours of manual coding).

**⚠️ Critical Migration:** Transform from single-tenant hardcoded schema to **true multi-tenant SaaS** with per-customer dynamic schemas.

---

## 🏗️ Migration Context

### Current State (Phase 0/1)

**Architecture Assumption:** Single tenant with hardcoded schema

```typescript
// Hardcoded in GraphStateCSV.ts, client.ts, SDK, etc.
const ENTITIES = ["User", "Group", "Resource"];
const RELATIONSHIPS = ["member_of", "inherits_from", "has_permission"];
```

**Problems:**

1. ❌ **Not truly multi-tenant** - All customers share same schema
2. ❌ **No schema isolation** - Can't customize per customer
3. ❌ **Hardcoded everywhere** - Schema baked into DO, worker, client, SDK
4. ❌ **No versioning** - Schema changes break existing deployments
5. ❌ **Manual migration** - Adding entity = code changes + redeployment

### Target State (Phase 2)

**Architecture:** True SaaS multi-tenancy with per-customer schemas

```typescript
// Dynamic schema per organization
const schema = await fetchSchema(orgId); // Each org has custom entities
await createTablesFromSchema(schema); // Generate SQL from YAML
```

**Solutions:**

1. ✅ **True multi-tenant** - Each customer (org) has own schema
2. ✅ **Schema isolation** - Org A: User/Document, Org B: Team/Project
3. ✅ **Dynamic loading** - Schema stored separately, loaded at runtime
4. ✅ **Versioning** - Schema v1, v2, v3 with rollback support
5. ✅ **Self-service** - Customers edit schema via UI, instant hot reload

---

## 🔄 Multi-Tenant Migration Strategy

### Data Model Changes

**Current (Single-Tenant):**

```
R2: graph-state-{env}/
  └── org_default/
      ├── users.csv
      ├── groups.csv
      └── resources.csv

Durable Object: GraphStateCSV (one schema for all)
```

**Target (Multi-Tenant SaaS):**

```
R2: graph-state-{env}/
  ├── {orgId}/
  │   ├── schema.json              # Compiled schema
  │   ├── schema-versions/
  │   │   ├── v1.json
  │   │   ├── v2.json
  │   │   └── v3.json
  │   └── data/
  │       ├── {EntityType1}.csv
  │       ├── {EntityType2}.csv
  │       └── {RelationshipType}.csv
  └── system/
      ├── orgs.csv                  # Tenant registry
      └── schema-registry.json      # Global schema catalog

Durable Object: GraphStateCSV per org (each loads own schema)
```

### Infrastructure Migration Steps

**Week 1-2: Add Schema Storage**

1. Create schema storage structure in R2
2. Add schema version DO for each org
3. Migrate existing hardcoded schema to YAML for `org_default`
4. Store compiled schema in R2

**Week 3-4: Update Durable Objects**

1. Add schema loading to `GraphStateCSV`
2. Make table creation dynamic based on schema
3. Update indexes to support arbitrary entity types
4. Add schema version tracking

**Week 5-6: Update Worker & SDKs**

1. Add `/org/{orgId}/schema` endpoint
2. Update server SDK with generic methods
3. Update client SDK with dynamic schema support
4. Add backward compatibility layer

**Week 7-8: Data Migration**

1. Migrate existing data to new structure
2. Create tenant registry
3. Set up default schema for existing orgs
4. Test multi-tenant isolation

---

## 📊 Progress Tracking

| Component                       | Status             | Progress |
| ------------------------------- | ------------------ | -------- |
| 2.0 Multi-Tenant Infrastructure | ✅ Complete        | 100%     |
| 2.1 Schema Format & Validation  | ✅ Complete        | 100%     |
| 2.2 Schema Compiler             | ✅ Complete        | 100%     |
| 2.3 Hot Reload System           | ✅ Complete (Dev)  | 80%      |
| 2.4 Customer Admin UI - Web     | 🟡 In Progress     | 15%      |
| 2.5 Customer Admin UI - Tauri   | ⏳ Not Started     | 0%       |
| 2.6 Relish Admin UI             | ⏳ Not Started     | 0%       |
| **Overall**                     | **🟡 In Progress** | **59%**  |

---

## 🐕 Dogfooding Strategy

Both admin UIs will **use Relish authorization internally** to manage access control.

### Permission Schema for Customer Admin UI

```yaml
# Roles
tenant:admin → User        # Full schema edit access
tenant:viewer → User       # Read-only access

# Permissions
schema:view → tenant:viewer
schema:edit → tenant:admin
schema:publish → tenant:admin
schema:rollback → tenant:admin
```

### Permission Schema for Relish Admin UI

```yaml
# Roles
relish:operator → User       # Read-only
relish:admin → User          # Manage tenants
relish:superadmin → User     # Full access

# Permissions
tenant:view → relish:operator
tenant:create → relish:admin
tenant:suspend → relish:admin
tenant:delete → relish:superadmin
metrics:view → relish:operator
```

---

---

## 📋 Task List

### 2.0 Multi-Tenant Infrastructure Foundation (Week 1-2) **NEW**

**Goal:** Build fresh multi-tenant infrastructure using Phase 0/1 as reference patterns

**🎯 Fresh Start:** No existing customers means we can build multi-tenant architecture from scratch without migration complexity.

**Reference Implementations (Phase 0/1):**

- **Durable Objects** (`cloudflare/worker/src/durable-objects/GraphStateCSV.ts`)
  - ✅ Good patterns: Map-based indexes, CSV loading, WebSocket sync, version tracking
  - 🔄 Adapt: Remove hardcoded schema, add dynamic schema loading
- **Worker** (`cloudflare/worker/src/index.ts`)
  - ✅ Good patterns: Per-org routing (`/org/{orgId}/*`), DO coordination
  - ➕ Add: Schema endpoints, tenant registry
- **Pulumi** (`cloudflare/pulumi/index.ts`)
  - ✅ Good patterns: R2 bucket, KV namespace, DO bindings, Worker deployment
  - ➕ Keep infrastructure, add tenant management
- **SDKs**
  - Server SDK: Reference HTTP client patterns, rebuild with `can(subject, capability, object)`
  - Client SDK: Reference WASM loading patterns, rebuild with dynamic `createSchemaFromDefinition()`

#### Implementation Tasks

- [x] **Implement multi-tenant R2 storage structure** ✅

  Schema types created in `cf-auth/src/types/schema.ts` with:

  - CompiledSchema interface with entities, relationships, indexes
  - EntityDefinition with field types and SQL generation
  - RelationshipDefinition with properties and SQL generation
  - getDefaultSchema() function for Phase 1 compatibility

- [x] **Add schema loading to GraphStateCSV** ✅

  Updated `cf-auth/src/durable-objects/GraphStateCSV.ts` with:

  - ensureSchemaLoaded() method for per-org schema loading
  - createDefaultSchema() for new organizations
  - Schema storage in R2: `{orgId}/schema/current.json`
  - Version tracking in R2: `{orgId}/schema/versions/v1.json`

- [x] **Add schema endpoint to Worker** ✅

  Added `/org/{orgId}/schema` endpoint to return compiled schema:

  - Extracts orgId from URL path
  - Loads schema before processing requests
  - Returns JSON schema response

- [x] **Make indexes dynamic instead of hardcoded** ✅

  Replaced hardcoded Map structures with dynamic indexes that support arbitrary entity/relationship types:

  ```typescript
  // NEW: Dynamic indexes for arbitrary entity/relationship types
  private entityIndexes = new Map<string, Map<string, any>>();  // entity name -> id -> entity data
  private relationshipIndexes = new Map<string, Map<string, Set<string>>>();  // rel name -> from_id -> Set<to_id>

  private getOrCreateEntityIndex(entityName: string): Map<string, any> {
    if (!this.entityIndexes.has(entityName)) {
      this.entityIndexes.set(entityName, new Map());
    }
    return this.entityIndexes.get(entityName)!;
  }

  private getOrCreateRelationshipIndex(relName: string): Map<string, Set<string>> {
    if (!this.relationshipIndexes.has(relName)) {
      this.relationshipIndexes.set(relName, new Map());
    }
    return this.relationshipIndexes.get(relName)!;
  }
  ```

  Benefits:

  - Supports any entity type (Team, Project, Author, Book, etc.)
  - Supports any relationship type (works_on, wrote, contributes_to, treats, etc.)
  - Each organization can have completely different schemas
  - Indexes are populated during `loadDataFromSchema()`
  - Tests validate custom entity/relationship types work correctly

  Implementation Files:

  - `cf-auth/src/durable-objects/GraphStateCSV.ts` - Dynamic index structures
  - `cf-auth/tests/phase2-dynamic-indexes.test.ts` - Comprehensive tests

  Test Coverage:

  - ✅ Custom entity indexing (Team, Project)
  - ✅ Custom relationship querying (works_on, wrote, contributes_to, treats)
  - ✅ Multi-tenant schema isolation (different schemas per org)
  - ✅ Dynamic data loading from CSVs

- [x] **Create tenant registry** ✅

  Created comprehensive tenant registry in `cf-auth/src/services/tenant-registry.ts` with:

  - CRUD operations for tenant lifecycle (create, get, update, delete)
  - Tenant status management (active, suspended, trial, deleted)
  - Plan management (free, starter, pro, enterprise)
  - Schema version tracking per tenant
  - Default schema initialization for new tenants
  - Tenant statistics and reporting
  - 37 passing tests with full coverage

  ```typescript
  // cf-auth/src/services/tenant-registry.ts
  export interface Tenant {
    id: string;
    name: string;
    schemaVersion: number;
    createdAt: string;
    status: "active" | "suspended" | "trial";
    plan: "free" | "starter" | "pro" | "enterprise";
  }

  export class TenantRegistry {
    constructor(private kv: KVNamespace, private r2: R2Bucket) {}

    async getTenant(orgId: string): Promise<Tenant | null> {
      const data = await this.kv.get(`tenant:${orgId}`);
      return data ? JSON.parse(data) : null;
    }

    async createTenant(tenant: Tenant): Promise<void> {
      await this.kv.put(`tenant:${tenant.id}`, JSON.stringify(tenant));

      // Initialize default schema for new tenant
      const defaultSchema = getDefaultSchema();
      await this.r2.put(
        `${tenant.id}/schema.json`,
        JSON.stringify(defaultSchema)
      );
    }

    async listTenants(): Promise<Tenant[]> {
      const list = await this.kv.list({ prefix: "tenant:" });
      const tenants = await Promise.all(
        list.keys.map(async (key) => {
          const data = await this.kv.get(key.name);
          return JSON.parse(data!);
        })
      );
      return tenants;
    }
  }
  ```

- [x] **Add backward compatibility for existing data** ✅

  Created migration service in `cf-auth/src/services/migration.ts` with:

  - Automatic detection of old single-tenant structure
  - Migration from root-level CSVs to per-tenant directories
  - Default tenant creation with migrated data
  - Migration metadata tracking (version, timestamps)
  - Migration verification and validation
  - Emergency rollback functionality
  - 15 passing tests with full coverage

  ```typescript
  // cf-auth/src/services/migration.ts
  async migrateExistingData(): Promise<void> {
    // Check if data exists in old structure (root level)
    const oldUsers = await this.env.GRAPH_STATE.get('users.csv');

    if (oldUsers && !this.schema) {
      console.log(`[Migration] Migrating org_default to new structure`);

      // Create default schema
      await this.ensureStorageStructure('org_default');

      // Move CSV files to new location
      const files = ['users.csv', 'groups.csv', 'resources.csv',
                     'member_of.csv', 'user_permissions.csv', 'group_permissions.csv'];

  ```

- [x] **Add default schema template** ✅

  Already implemented in `cf-auth/src/types/schema.ts` as `getDefaultSchema()`:

  - Phase 1-compatible schema (User, Group, Resource entities)
  - Standard relationships (member_of, inherits_from, has_permission)
  - Used by TenantRegistry for new tenant initialization
  - Used by MigrationService for backward compatibility

#### Acceptance Criteria

- ✅ Multi-tenant R2 structure implemented (per-org schema + data)
- ✅ Schema loaded dynamically from R2 per org
- ✅ Indexes created dynamically based on schema
- ✅ `/org/{orgId}/schema` endpoint working
- ✅ Tenant registry operational with create/list/get/update/delete
- ✅ Default schema template creates valid structure
- ✅ Migration utility handles backward compatibility
- ✅ Unit tests passing for new multi-tenant code (52 tests total)

---

### 2.1 Schema Validation Rules (Week 3)

**Current Status:** ✅ Complete

#### Tasks

- [x] **Complete schema validation rules** ✅

  - [x] Required field enforcement (`name`, `id`, `type`)
  - [x] Type checking (string, number, boolean, reference, array)
  - [x] Pattern validation (regex patterns)
  - [x] Entity reference validation (foreign keys exist)
  - [x] Relationship cardinality enforcement (one-to-one, one-to-many, many-to-many)
  - [x] Circular dependency detection
  - [x] Reserved keyword checking

- [x] **Add validation error messages** ✅

  - [x] Clear error descriptions (e.g., "Field 'email' must be unique")
  - [x] Line numbers for YAML errors
  - [x] Suggested fixes (e.g., "Did you mean 'User'?")
  - [x] Severity levels (error, warning, info)

- [x] **Create runtime validator** (`schema/validator.ts`) ✅

  Created comprehensive validator with:

  - Top-level schema validation (version, name, entities)
  - Entity validation (identifiers, reserved keywords, fields)
  - Field validation (types, patterns, enums, constraints)
  - Index validation (field existence, uniqueness)
  - Relationship validation (entity references, cardinality)
  - Circular dependency detection with warnings
  - Helpful error messages with suggestions
  - 27 passing tests with 100% coverage

- [x] **Update JSON Schema** (`schema/relish.schema.json`) ✅
  - Schema already includes comprehensive validation rules
  - Regex patterns for IDs and names
  - Enum constraints for types
  - Min/max constraints for numbers

#### Files Created

```
schema/
├── relish.schema.json       # JSON Schema with validation rules (existing)
├── validator.ts             # Runtime validation (NEW ✅)
├── validation-errors.ts     # Error types (NEW ✅)
└── tests/
    └── validator.test.ts    # Validation tests (NEW ✅)
```

#### Acceptance Criteria

- ✅ All validation rules implemented
- ✅ Clear error messages with suggestions
- ✅ Circular dependency detection working
- ✅ Foreign key validation working
- ✅ All tests passing (27/27)

---

### 2.2 Schema Compiler (Week 1-3)

**Status:** ✅ Complete

**Goal:** Generate TypeScript artifacts and KuzuDB SQL from YAML/JSON schema

#### Architecture

```
YAML/JSON Input → Parser → AST → Generators → Output
                                            ├── TypeScript types
                                            └── KuzuDB SQL
```

#### Completed Tasks

- [x] **Setup compiler project** ✅

  - Created `schema/compiler/` with TypeScript configuration
  - Added package.json with dependencies (yaml, vitest)
  - Configured ES modules and bundler module resolution

- [x] **Create schema parser** (`src/parser.ts`) ✅

  - SchemaParser class for YAML/JSON parsing
  - AST type definitions in `src/types.ts`
  - Support for entities, relationships, fields, indexes
  - Error handling for invalid schemas

- [x] **Create TypeScript type generator** (`src/generators/type-generator.ts`) ✅

  - Generates TypeScript interfaces from AST
  - JSDoc comments for descriptions
  - Optional field handling (required vs optional)
  - Enum type generation ('value1' | 'value2')
  - Type mapping (string, number, boolean, Date, etc.)
  - Schema helper types (EntityType, SchemaTypes)
  - Generation headers with version info

- [x] **Create SQL generator** (`src/generators/sql-generator.ts`) ✅

  - Generates KuzuDB CREATE NODE TABLE statements
  - CREATE REL TABLE for relationships
  - Field type mapping to KuzuDB types
  - PRIMARY KEY constraints
  - NOT NULL for required fields
  - Relationship properties support
  - SQL comments for descriptions
  - Index documentation (commented out)

- [x] **Create CLI tool** (`src/cli.ts`) ✅

  - Command-line interface for compiling schemas
  - Support for YAML and JSON input
  - Custom output directory option
  - User-friendly error messages

- [x] **Create comprehensive tests** (`tests/compiler.test.ts`) ✅

  - 24 passing tests with full coverage
  - Parser tests (4 tests)
  - TypeScript generation tests (7 tests)
  - SQL generation tests (8 tests)
  - Full compilation tests (2 tests)
  - Edge case tests (3 tests)

- [x] **Create example schema** (`example.yaml`) ✅
  - Complete authorization schema
  - User, Group, Resource, Role entities
  - Multiple relationship types with properties
  - Enum fields, timestamps, JSON fields
  - Demonstrates all compiler features

#### Files Created

```
schema/compiler/
├── package.json
├── tsconfig.json
├── README.md
├── example.yaml              # Example schema
├── src/
│   ├── index.ts             # Main compiler entry
│   ├── types.ts             # AST type definitions
│   ├── parser.ts            # YAML/JSON parser
│   ├── cli.ts               # Command-line interface
│   └── generators/
│       ├── type-generator.ts  # TypeScript generator
│       └── sql-generator.ts   # SQL generator
├── tests/
│   └── compiler.test.ts     # Test suite
└── generated/
    ├── example.types.ts     # Generated TypeScript
    └── example.sql          # Generated SQL
```

#### Usage Example

```bash
# Compile a schema
cd schema/compiler
pnpm build
node dist/cli.js example.yaml ./generated

# Output:
# ✓ Generated types: generated/example.types.ts
# ✓ Generated SQL: generated/example.sql
# ✨ Compilation complete!
```

#### Acceptance Criteria

- ✅ Parse YAML/JSON schemas into AST
- ✅ Generate TypeScript interfaces with JSDoc
- ✅ Generate KuzuDB SQL statements
- ✅ Handle optional/required fields correctly
- ✅ Support enum types
- ✅ Support relationships with properties
- ✅ CLI tool functional
- ✅ All tests passing (24/24)
- ✅ Documentation complete

---

### 2.3 Hot Reload System (Week 4-5)

**Status:** ✅ Complete (Development Features) - 80%

**Goal:** Watch schema files and automatically recompile + reload in development, with production runtime updates planned

---

### 📦 Impact on Server SDK (`cloudflare/sdk/`)

**Critical:** Server SDK also needs updates for schema-driven architecture.

#### Current Server SDK Implementation (Hardcoded)

```typescript
// cloudflare/sdk/src/index.ts
export class AuthClient {
  async check(request: CheckPermissionRequest): Promise<boolean> {
    // Hardcoded: assumes "user", "permission", "resource" entities
    const response = await this.request<CheckPermissionResponse>(
      "check",
      "GET",
      {
        params: {
          user: request.user, // Assumes "user" entity exists
          permission: request.permission,
          resource: request.resource, // Assumes "resource" entity exists
        },
      }
    );
    return response.allowed;
  }

  async grant(request: GrantPermissionRequest): Promise<void> {
    // Hardcoded: assumes specific permission structure
    await this.request("grant", "POST", { body: request });
  }
}
```

**Problem:** This SDK assumes:

- Entity types: "user", "resource"
- Relationships: "has_permission"
- Fixed API structure

With Phase 2, customers define **custom entities** (Document, Project, Team, etc.)

#### Phase 2 Requirements (Dynamic)

**Option 1: Generic Schema-Aware Methods**

```typescript
// cloudflare/sdk/src/index.ts
export class AuthClient {
  private schema?: CompiledSchema;

  constructor(config: AuthClientConfig) {
    // ... existing config
  }

  // Fetch organization's schema on initialization
  async initialize(): Promise<void> {
    const response = await fetch(`${this.config.workerUrl}/schema`);
    this.schema = await response.json();
  }

  // Generic check method - works with any schema
  async can(
    subject: string, // e.g., "user:alice" or "team:engineering"
    capability: string, // e.g., "read", "write", "admin"
    object: string // e.g., "doc:readme" or "project:alpha"
  ): Promise<boolean> {
    const response = await this.request<{ allowed: boolean }>("can", "GET", {
      params: { subject, capability, object },
    });
    return response.allowed;
  }

  // Generic grant method
  async grant(
    subject: string,
    capability: string,
    object: string
  ): Promise<void> {
    await this.request("grant", "POST", {
      body: { subject, capability, object },
    });
  }

  // Generic revoke method
  async revoke(
    subject: string,
    capability: string,
    object: string
  ): Promise<void> {
    await this.request("revoke", "POST", {
      body: { subject, capability, object },
    });
  }

  // Query all objects a subject can access
  async listAccessible(
    subject: string,
    capability: string,
    objectType?: string // Optional: filter by entity type
  ): Promise<string[]> {
    const response = await this.request<{ objects: string[] }>(
      "list-accessible",
      "GET",
      {
        params: { subject, capability, objectType },
      }
    );
    return response.objects;
  }

  // Query all subjects that can access an object
  async listAccessors(
    object: string,
    capability?: string // Optional: filter by capability
  ): Promise<Array<{ subject: string; capability: string }>> {
    const response = await this.request<{
      accessors: Array<{ subject: string; capability: string }>;
    }>("list-accessors", "GET", { params: { object, capability } });
    return response.accessors;
  }
}
```

**Option 2: Type-Safe Generated SDK (Advanced)**

```typescript
// Generated from customer's schema at build time
import { AuthClient } from "@kuzu-auth/sdk";
import type { SchemaTypes } from "./generated/schema-types";

const client = new AuthClient<SchemaTypes>({
  workerUrl: "https://auth.example.com",
  schemaVersion: "2.1.0",
});

// Type-safe methods generated from schema
await client.user.can("user:alice", "read", "document:readme");
await client.document.grant("user:alice", "write", "document:readme");
await client.team.listMembers("team:engineering");

// Schema types provide full autocomplete
type User = SchemaTypes["User"];
type Document = SchemaTypes["Document"];
```

#### Backward Compatibility Strategy

```typescript
export class AuthClient {
  // Keep old methods for backward compatibility (deprecated)
  /** @deprecated Use can() instead */
  async check(request: CheckPermissionRequest): Promise<boolean> {
    return this.can(request.user, request.permission, request.resource);
  }

  /** @deprecated Use grant() instead */
  async grantPermission(request: GrantPermissionRequest): Promise<void> {
    return this.grant(request.user, request.permission, request.resource);
  }

  // New schema-aware methods
  async can(
    subject: string,
    capability: string,
    object: string
  ): Promise<boolean> {
    // ... implementation
  }
}
```

#### Migration Path for Server SDK

**Phase 2 Timeline:**

1. **Week 1-2:** Add generic methods (`can`, `grant`, `revoke`) alongside existing
2. **Week 3:** Add schema fetching on initialization
3. **Week 4:** Deprecate old methods (`check`, `grantPermission`)
4. **Week 5:** Update documentation and examples
5. **Week 6:** Publish v2.0.0 with breaking changes
6. **Week 7+:** Migrate existing users to new API

**Version Strategy:**

- v1.x: Current hardcoded API (deprecated)
- v2.x: Schema-aware generic API (recommended)
- v3.x: Type-safe generated SDK (future)

---

### � Phase 1 Deferred Features

**Context:** These features were identified during Phase 1 but deferred to Phase 2 for better integration with dynamic schema infrastructure.

#### 2.X.1 Resource Accessors Query

**Status:** Deferred from Phase 1  
**Rationale:** This query depends on dynamic entity types, making it more suitable for Phase 2's dynamic schema system.

**Implementation:**

```typescript
// client/src/client.ts
async getResourceAccessors(resourceId: string): Promise<Accessor[]> {
  // Dynamic query based on schema relationships
  const schema = await this.getSchema();

  return this.kuzu.query(`
    MATCH (r:${schema.resourceEntity} {id: $resourceId})
    MATCH (u:${schema.userEntity})-[:has_permission]->(r)
    RETURN u.id AS userId, permission, 'direct' AS source
    UNION
    MATCH (g:${schema.groupEntity})-[:group_permission]->(r)
    MATCH (u:${schema.userEntity})-[:member_of*]->(g)
    RETURN u.id AS userId, permission, 'group' AS source
  `, { resourceId });
}
```

**Tasks:**

- [ ] Add `getResourceAccessors()` method to client SDK
- [ ] Support dynamic entity types from schema
- [ ] Add tests for resource accessor queries
- [ ] Document API in README

---

#### 2.X.2 Conflict Resolution for Optimistic Updates

**Status:** Deferred from Phase 1  
**Rationale:** Advanced feature requiring operational experience and monitoring to determine best conflict resolution strategies.

**Implementation:**

```typescript
// client/src/optimistic-updater.ts
async resolveConflict(
  localMutation: Mutation,
  serverMutation: Mutation
): Promise<void> {
  // Conflict resolution strategies:
  // 1. Last-write-wins (default)
  // 2. Server-always-wins (conservative)
  // 3. Client-wins-if-newer (aggressive)
  // 4. Custom merge logic (advanced)

  const strategy = this.options.conflictResolution || 'last-write-wins';

  switch (strategy) {
    case 'last-write-wins':
      if (serverMutation.timestamp > localMutation.timestamp) {
        await this.rollbackMutation(localMutation.id);
        await this.mutationApplier.applyMutation(serverMutation);
      }
      break;

    case 'server-always-wins':
      await this.rollbackMutation(localMutation.id);
      await this.mutationApplier.applyMutation(serverMutation);
      break;

    case 'client-wins-if-newer':
      if (localMutation.timestamp > serverMutation.timestamp) {
        // Keep local mutation, server will sync from us
        await this.sendToServer(localMutation, { force: true });
      }
      break;
  }
}
```

**Tasks:**

- [ ] Implement conflict resolution strategies
- [ ] Add configurable conflict resolution policies
- [ ] Add conflict detection and logging
- [ ] Add UI notifications for conflicts
- [ ] Document conflict resolution behavior

---

#### 2.X.3 HTTP Retry Logic for Mutations

**Status:** Deferred from Phase 1  
**Rationale:** WebSocket already has reconnection logic. HTTP retry is optimization for edge cases.

**Implementation:**

```typescript
// client/src/optimistic-updater.ts
private async sendToServerWithRetry(mutation: Mutation): Promise<void> {
  const maxRetries = this.options.maxRetries || 3;
  const baseDelay = this.options.retryDelay || 1000;

  let attempt = 0;
  let lastError: Error;

  while (attempt < maxRetries) {
    try {
      await this.sendToServer(mutation);
      return; // Success
    } catch (error) {
      lastError = error;

      // Don't retry on permission denied
      if (error.status === 403 || error.status === 401) {
        throw error;
      }

      // Don't retry on validation errors
      if (error.status === 400) {
        throw error;
      }

      attempt++;
      if (attempt >= maxRetries) {
        throw new Error(
          `Failed after ${maxRetries} attempts: ${lastError.message}`
        );
      }

      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

**Tasks:**

- [ ] Add retry logic with exponential backoff
- [ ] Add configurable retry policies
- [ ] Add retry metrics and logging
- [ ] Handle transient vs permanent errors
- [ ] Document retry behavior

---

### �📦 Impact on Phase 1 Client SDK

**Critical:** Phase 2 schema infrastructure requires changes to Phase 1 client SDK.

#### Current Phase 1 Implementation (Hardcoded)

```typescript
// client/src/client.ts
class KuzuAuthClient {
  async createSchema(): Promise<void> {
    // Hardcoded schema
    await this.conn.execute(`CREATE NODE TABLE User(...)`);
    await this.conn.execute(`CREATE NODE TABLE Group(...)`);
    await this.conn.execute(`CREATE NODE TABLE Resource(...)`);
  }
}
```

#### Phase 2 Requirements (Dynamic)

```typescript
// client/src/client.ts
class KuzuAuthClient {
  private currentSchemaVersion: number = 0;

  async initialize(orgId: string): Promise<void> {
    // Fetch organization's compiled schema
    const schema = await this.fetchCompiledSchema(orgId);
    await this.createSchemaFromDefinition(schema);

    // Subscribe to schema updates
    this.subscribeToSchemaUpdates();
  }

  async createSchemaFromDefinition(schema: CompiledSchema): Promise<void> {
    // Create tables from compiled schema
    for (const entity of schema.entities) {
      await this.conn.execute(entity.createTableSQL);
    }
    for (const rel of schema.relationships) {
      await this.conn.execute(rel.createRelTableSQL);
    }
    for (const index of schema.indexes) {
      await this.conn.execute(index.createIndexSQL);
    }

    this.currentSchemaVersion = schema.version;
  }

  async handleSchemaUpdate(newSchema: CompiledSchema): Promise<void> {
    // Hot reload: Apply schema changes without full reload
    const migration = this.computeSchemaMigration(
      this.currentSchemaVersion,
      newSchema.version
    );

    // Apply incremental changes
    for (const change of migration.changes) {
      if (change.type === "add_entity") {
        await this.conn.execute(change.createTableSQL);
      } else if (change.type === "add_field") {
        await this.conn.execute(change.alterTableSQL);
      } else if (change.type === "remove_entity") {
        await this.conn.execute(change.dropTableSQL);
      }
    }

    // Reload data for affected entities
    await this.reloadAffectedData(migration.affectedEntities);

    this.currentSchemaVersion = newSchema.version;
  }

  private async fetchCompiledSchema(orgId: string): Promise<CompiledSchema> {
    const response = await fetch(
      `${this.serverUrl}/org/${orgId}/schema/compiled`
    );
    return response.json();
  }

  private subscribeToSchemaUpdates(): void {
    this.wsManager.on("schema_update", async (message) => {
      const newSchema = message.schema;
      await this.handleSchemaUpdate(newSchema);
    });
  }
}
```

#### New Types Required

```typescript
// client/src/types/schema.ts
export interface CompiledSchema {
  version: number;
  entities: EntityDefinition[];
  relationships: RelationshipDefinition[];
  indexes: IndexDefinition[];
}

export interface EntityDefinition {
  name: string;
  fields: FieldDefinition[];
  createTableSQL: string; // Generated by compiler
}

export interface RelationshipDefinition {
  name: string;
  from: string;
  to: string;
  properties: FieldDefinition[];
  createRelTableSQL: string; // Generated by compiler
}

export interface IndexDefinition {
  entity: string;
  field: string;
  createIndexSQL: string; // Generated by compiler
}

export interface SchemaMigration {
  fromVersion: number;
  toVersion: number;
  changes: SchemaChange[];
  affectedEntities: string[];
}

export interface SchemaChange {
  type:
    | "add_entity"
    | "remove_entity"
    | "add_field"
    | "remove_field"
    | "modify_field";
  entity: string;
  field?: string;
  createTableSQL?: string;
  alterTableSQL?: string;
  dropTableSQL?: string;
}
```

#### Migration Path

**Phase 1 → Phase 2 Transition:**

1. **Week 1-2:** Keep hardcoded schema working
2. **Week 3:** Add `createSchemaFromDefinition()` alongside `createSchema()`
3. **Week 4:** Add schema fetching from server
4. **Week 5:** Add hot reload support
5. **Week 6:** Deprecate hardcoded `createSchema()`
6. **Week 7:** Remove hardcoded schema (breaking change)

**Backward Compatibility:**

```typescript
// Support both hardcoded and dynamic schemas during transition
class KuzuAuthClient {
  constructor(config: ClientConfig) {
    this.useDynamicSchema = config.dynamicSchema ?? false;
  }

  async initialize(): Promise<void> {
    if (this.useDynamicSchema) {
      const schema = await this.fetchCompiledSchema(this.orgId);
      await this.createSchemaFromDefinition(schema);
    } else {
      // Fallback to hardcoded schema
      await this.createSchema();
    }
  }
}
```

---

### 2.3 Hot Reload System (Week 4-5)

**Goal:** Runtime schema updates without downtime

#### Architecture

```
Schema Upload → Validation → Compilation → Version Storage → Activation → Runtime Reload
                                                                       → Client Sync
                                                                       → Index Rebuild
```

#### Tasks

- [ ] **Update server SDK for dynamic schemas** (`cloudflare/sdk/src/index.ts`)

  - [ ] Add `can(subject, capability, object)` generic method
  - [ ] Add `grant(subject, capability, object)` generic method
  - [ ] Add `revoke(subject, capability, object)` generic method
  - [ ] Add `listAccessible(subject, capability, objectType?)` method
  - [ ] Add `listAccessors(object, capability?)` method
  - [ ] Add `initialize()` to fetch schema on startup
  - [ ] Deprecate old methods (`check`, `grantPermission`, `revokePermission`)
  - [ ] Add backward compatibility layer
  - [ ] Update TypeScript types for generic API
  - [ ] Update tests for new API
  - [ ] Update README with migration guide
  - [ ] Publish v2.0.0 with breaking changes

- [ ] **Update client SDK for dynamic schemas** (`client/src/client.ts`)

  - [ ] Add `createSchemaFromDefinition()` method
  - [ ] Add `handleSchemaUpdate()` for hot reload
  - [ ] Add `computeSchemaMigration()` for incremental updates
  - [ ] Add `reloadAffectedData()` for changed entities
  - [ ] Add `fetchCompiledSchema()` API call
  - [ ] Update `initialize()` to support dynamic schemas
  - [ ] Add backward compatibility flag

- [ ] **Create schema version storage** (Durable Object)

  ```typescript
  export class SchemaVersionDO {
    private versions: Map<number, SchemaVersion> = new Map();
    private activeVersion: number = 1;

    async uploadVersion(schema: Schema): Promise<number> {
      // Validate schema
      const validation = this.validator.validate(schema);
      if (!validation.valid) {
        throw new Error(`Invalid schema: ${validation.errors.join(", ")}`);
      }

      // Compile schema
      const artifacts = await this.compiler.compile(schema);

      // Store version
      const version = this.versions.size + 1;
      this.versions.set(version, {
        version,
        schema,
        artifacts,
        uploadedAt: Date.now(),
        uploadedBy: "user:admin",
        active: false,
      });

      return version;
    }

    async activateVersion(version: number): Promise<void> {
      const schemaVersion = this.versions.get(version);
      if (!schemaVersion) {
        throw new Error(`Version ${version} not found`);
      }

      // Deactivate current version
      const current = this.versions.get(this.activeVersion);
      if (current) {
        current.active = false;
      }

      // Activate new version
      schemaVersion.active = true;
      this.activeVersion = version;

      // Broadcast to clients
      await this.broadcastSchemaChange(version);

      // Rebuild indexes
      await this.rebuildIndexes(schemaVersion);
    }
  }
  ```

- [ ] **Add API endpoints** (`cloudflare/worker/src/admin/schema-manager.ts`)

  ```typescript
  // Upload and validate schema
  app.post("/admin/schema/upload", async (c) => {
    const schema = await c.req.json();
    const schemaVersion = await c.env.SCHEMA_VERSION.get();
    const version = await schemaVersion.uploadVersion(schema);
    return c.json({ version, status: "uploaded" });
  });

  // List versions
  app.get("/admin/schema/versions", async (c) => {
    const schemaVersion = await c.env.SCHEMA_VERSION.get();
    const versions = await schemaVersion.listVersions();
    return c.json({ versions });
  });

  // Activate version
  app.post("/admin/schema/activate/:version", async (c) => {
    const version = parseInt(c.req.param("version"));
    const schemaVersion = await c.env.SCHEMA_VERSION.get();
    await schemaVersion.activateVersion(version);
    return c.json({ version, status: "activated" });
  });

  // Get current schema
  app.get("/admin/schema/current", async (c) => {
    const schemaVersion = await c.env.SCHEMA_VERSION.get();
    const current = await schemaVersion.getCurrentVersion();
    return c.json(current);
  });

  // Rollback to previous version
  app.post("/admin/schema/rollback/:version", async (c) => {
    const version = parseInt(c.req.param("version"));
    const schemaVersion = await c.env.SCHEMA_VERSION.get();
    await schemaVersion.activateVersion(version);
    return c.json({ version, status: "rolled-back" });
  });
  ```

- [ ] **Implement runtime artifact loader**

  ```typescript
  export class RuntimeLoader {
    private moduleCache = new Map<number, any>();

    async loadVersion(version: number): Promise<void> {
      // Fetch artifacts from DO
      const artifacts = await this.fetchArtifacts(version);

      // Dynamic import of generated modules
      const typesModule = await import(artifacts.types);
      const validatorsModule = await import(artifacts.validators);
      const loadersModule = await import(artifacts.loaders);

      // Cache modules
      this.moduleCache.set(version, {
        types: typesModule,
        validators: validatorsModule,
        loaders: loadersModule,
      });

      // Update global references
      global.currentSchema = this.moduleCache.get(version);
    }

    invalidateCache(version: number): void {
      this.moduleCache.delete(version);
      delete require.cache[require.resolve(`./generated/v${version}/types`)];
    }
  }
  ```

- [ ] **Implement index rebuilding**

  ```typescript
  async rebuildIndexes(schemaVersion: SchemaVersion): Promise<void> {
    const newEntities = schemaVersion.schema.entities;
    const oldEntities = this.previousSchema?.entities || [];

    // Add indexes for new entities
    for (const entity of newEntities) {
      if (!oldEntities.find(e => e.name === entity.name)) {
        await this.createIndexes(entity);
      }
    }

    // Remove indexes for deleted entities
    for (const entity of oldEntities) {
      if (!newEntities.find(e => e.name === entity.name)) {
        await this.dropIndexes(entity);
      }
    }

    // Update indexes for changed entities
    for (const entity of newEntities) {
      const oldEntity = oldEntities.find(e => e.name === entity.name);
      if (oldEntity && this.hasIndexChanges(entity, oldEntity)) {
        await this.updateIndexes(entity, oldEntity);
      }
    }
  }
  ```

- [ ] **Implement client-side schema sync**

  ```typescript
  // In client SDK
  export class SchemaSync {
    private currentSchemaVersion: number = 1;

    async checkForUpdates(): Promise<void> {
      const response = await fetch(`${this.workerUrl}/admin/schema/current`);
      const { version } = await response.json();

      if (version > this.currentSchemaVersion) {
        await this.updateSchema(version);
      }
    }

    private async updateSchema(version: number): Promise<void> {
      // Fetch new schema artifacts
      const artifacts = await this.fetchArtifacts(version);

      // Rebuild WASM graph with new schema
      await this.kuzu.createSchema(artifacts.schema);

      // Reload data
      await this.reloadData();

      this.currentSchemaVersion = version;
    }
  }
  ```

- [ ] **Add rollback mechanism**

  ```typescript
  async rollback(toVersion: number): Promise<void> {
    // Validate version exists
    const version = this.versions.get(toVersion);
    if (!version) {
      throw new Error(`Version ${toVersion} not found`);
    }

    // Store current version as backup
    const currentVersion = this.activeVersion;

    try {
      // Activate old version
      await this.activateVersion(toVersion);
    } catch (error) {
      // Rollback failed, restore current
      await this.activateVersion(currentVersion);
      throw error;
    }
  }
  ```

#### Files to Create

```
cloudflare/worker/src/
├── admin/
│   ├── schema-manager.ts      # Schema version API
│   ├── hot-reload.ts          # Runtime reload logic
│   └── index-rebuilder.ts     # Index management
├── durable-objects/
│   └── schema-version-do.ts   # Schema version storage
└── runtime/
    └── artifact-loader.ts     # Dynamic module loading

client/sdk/src/
└── schema-sync.ts             # Client schema sync
```

#### Acceptance Criteria

- ✅ Schema upload working
- ✅ Version storage working
- ✅ Schema activation working
- ✅ Runtime reload working (no downtime)
- ✅ Index rebuilding working
- ✅ Client sync working
- ✅ Rollback working
- ✅ All tests passing

---

### 2.4 Customer Admin UI - Web (Week 6-8)

**Goal:** Visual schema editor for tenant administrators

See [CUSTOMER_ADMIN_UI_WEB.md](./CUSTOMER_ADMIN_UI_WEB.md) for full implementation details.

#### High-Level Tasks

- [ ] Next.js project setup with TypeScript
- [ ] Visual schema editor (drag-and-drop entity builder)
- [ ] Field configuration forms
- [ ] Code preview pane (Monaco Editor)
- [ ] Version management UI
- [ ] Deploy to Cloudflare Pages (via Pulumi)

#### Key Features

- Drag-and-drop entity creation
- Real-time validation feedback
- Live TypeScript preview
- Schema version history
- Diff viewer
- One-click rollback
- Save & Reload vs Save as Draft

---

### 2.5 Customer Admin UI - Tauri (Week 9-10)

**Goal:** Desktop app version of Customer Admin UI

#### High-Level Tasks

- [ ] Tauri project setup
- [ ] Reuse React components from web version
- [ ] Native menu integration (File, Edit, View)
- [ ] Local file system access (import/export schemas)
- [ ] Offline mode with local SQLite cache
- [ ] Auto-update configuration
- [ ] Code signing for macOS/Windows
- [ ] Build for all platforms (macOS, Windows, Linux)

---

### 2.6 Relish Admin UI (Week 11-12)

**Goal:** SaaS operator dashboard for managing tenants

See [RELISH_ADMIN_UI.md](./RELISH_ADMIN_UI.md) for full implementation details.

#### High-Level Tasks

- [ ] Next.js project setup
- [ ] Tenant list view with search/filter
- [ ] Tenant creation wizard
- [ ] Tenant detail page (metrics, users, permissions)
- [ ] Usage metrics dashboard (Recharts)
- [ ] System health monitoring
- [ ] Tenant suspend/resume actions
- [ ] Deploy to Cloudflare Pages (via Pulumi)

---

## 🧪 Test-Driven Development (TDD) Approach

### TDD Workflow for Phase 2

**Schema Compiler & Hot Reload require rigorous TDD:**

1. **Write tests for each generator** before implementing
2. **Test schema validation rules** exhaustively
3. **Test hot reload scenarios** (happy path + edge cases)
4. **Test UI components** in isolation
5. Mark task complete **only when all tests pass**

### Test Framework Setup

```bash
cd schema/compiler
npm install --save-dev jest @types/jest ts-jest

cd ../../admin-ui/customer-admin
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install --save-dev @playwright/test
```

### Task 2.1: Schema Validation - Test Suite

**Write these tests BEFORE implementing validation:**

```typescript
// schema/validator.test.ts
import { SchemaValidator } from "./validator";

describe("SchemaValidator", () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe("required fields", () => {
    it("should error if entity name is missing", () => {
      const schema = { entities: [{ fields: [] }] };
      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Entity name is required");
    });

    it("should error if field name is missing", () => {
      const schema = {
        entities: [{ name: "User", fields: [{ type: "string" }] }],
      };
      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Field name is required");
    });
  });

  describe("foreign key validation", () => {
    it("should error if referenced entity does not exist", () => {
      const schema = {
        entities: [
          {
            name: "Document",
            fields: [
              { name: "owner", type: "reference", referenceType: "User" },
            ],
          },
        ],
      };
      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain(
        "Referenced entity 'User' does not exist"
      );
    });

    it("should pass if referenced entity exists", () => {
      const schema = {
        entities: [
          { name: "User", fields: [] },
          {
            name: "Document",
            fields: [
              { name: "owner", type: "reference", referenceType: "User" },
            ],
          },
        ],
      };
      const result = validator.validate(schema);
      expect(result.valid).toBe(true);
    });
  });

  describe("circular dependency detection", () => {
    it("should error on circular references", () => {
      const schema = {
        entities: [
          {
            name: "User",
            fields: [
              {
                name: "document",
                type: "reference",
                referenceType: "Document",
              },
            ],
          },
          {
            name: "Document",
            fields: [
              { name: "owner", type: "reference", referenceType: "User" },
            ],
          },
        ],
      };
      const result = validator.validate(schema);
      // Note: Circular references are allowed, so this should pass
      // But we should detect circular *dependencies* in schema ordering
      expect(result.valid).toBe(true);
    });
  });

  describe("pattern validation", () => {
    it("should validate regex patterns", () => {
      const schema = {
        entities: [
          {
            name: "User",
            fields: [
              { name: "email", type: "string", pattern: "[invalid regex" },
            ],
          },
        ],
      };
      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Invalid regex pattern");
    });
  });
});
```

**✅ Task 2.1 is DONE when:** All validation tests pass + clear error messages

---

### Task 2.2: Schema Compiler - Test Suite

**Write these tests BEFORE implementing generators:**

```typescript
// schema/compiler/generators/type-generator.test.ts
import { TypeGenerator } from "./type-generator";

describe("TypeGenerator", () => {
  let generator: TypeGenerator;

  beforeEach(() => {
    generator = new TypeGenerator();
  });

  it("should generate TypeScript interface from entity", () => {
    const ast = {
      entities: [
        {
          name: "User",
          fields: [
            { name: "id", type: "string", required: true },
            { name: "email", type: "string", required: true },
            { name: "age", type: "number", required: false },
          ],
        },
      ],
    };

    const output = generator.generate(ast);
    expect(output).toContain("export interface User {");
    expect(output).toContain("  id: string;");
    expect(output).toContain("  email: string;");
    expect(output).toContain("  age?: number;");
  });

  it("should handle reference types correctly", () => {
    const ast = {
      entities: [
        {
          name: "User",
          fields: [{ name: "id", type: "string", required: true }],
        },
        {
          name: "Document",
          fields: [
            {
              name: "owner",
              type: "reference",
              referenceType: "User",
              required: true,
            },
          ],
        },
      ],
    };

    const output = generator.generate(ast);
    expect(output).toContain("owner: string;"); // Reference stored as ID
  });

  it("should handle array types correctly", () => {
    const ast = {
      entities: [
        {
          name: "User",
          fields: [{ name: "tags", type: "array", required: true }],
        },
      ],
    };

    const output = generator.generate(ast);
    expect(output).toContain("tags: string[];");
  });
});

// schema/compiler/generators/validator-gen.test.ts
describe("ValidatorGenerator", () => {
  it("should generate runtime validator", () => {
    const ast = {
      entities: [
        {
          name: "User",
          fields: [
            {
              name: "email",
              type: "string",
              required: true,
              pattern: "^[^@]+@[^@]+$",
            },
          ],
        },
      ],
    };

    const generator = new ValidatorGenerator();
    const output = generator.generate(ast);

    expect(output).toContain("validators.User");
    expect(output).toContain(
      "if (!data.email) errors.push('email is required')"
    );
    expect(output).toContain("does not match pattern");
  });
});

// schema/compiler/index.test.ts
describe("SchemaCompiler", () => {
  it("should compile schema to all artifacts", async () => {
    const compiler = new SchemaCompiler();
    const schemaYaml = `
version: '1.0'
entities:
  - name: User
    fields:
      - name: id
        type: string
        required: true
`;

    const outputDir = "/tmp/test-output";
    await compiler.compile(schemaYaml, outputDir);

    // Verify files exist
    expect(fs.existsSync(`${outputDir}/types.ts`)).toBe(true);
    expect(fs.existsSync(`${outputDir}/validators.ts`)).toBe(true);
    expect(fs.existsSync(`${outputDir}/loaders.ts`)).toBe(true);
    expect(fs.existsSync(`${outputDir}/indexes.sql`)).toBe(true);
  });

  it("should complete compilation in <5 seconds", async () => {
    const compiler = new SchemaCompiler();
    const start = Date.now();
    await compiler.compile(largeSchemaYaml, "/tmp/test-output");
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000);
  });
});
```

**✅ Task 2.2 is DONE when:** All generator tests pass + compilation <5s

---

### Task 2.3: Hot Reload System - Test Suite

**Write these tests BEFORE implementing hot reload:**

```typescript
// cloudflare/worker/src/admin/hot-reload.test.ts
import { SchemaVersionDO } from "../durable-objects/schema-version-do";

describe("SchemaVersionDO", () => {
  let schemaVersion: SchemaVersionDO;

  beforeEach(() => {
    schemaVersion = new SchemaVersionDO();
  });

  describe("uploadVersion", () => {
    it("should validate and store new schema version", async () => {
      const schema = createValidSchema();
      const version = await schemaVersion.uploadVersion(schema);
      expect(version).toBe(1);
    });

    it("should reject invalid schema", async () => {
      const invalidSchema = { entities: [] }; // Missing required fields
      await expect(schemaVersion.uploadVersion(invalidSchema)).rejects.toThrow(
        "Invalid schema"
      );
    });
  });

  describe("activateVersion", () => {
    it("should activate new version", async () => {
      const schema = createValidSchema();
      const version = await schemaVersion.uploadVersion(schema);
      await schemaVersion.activateVersion(version);

      const current = await schemaVersion.getCurrentVersion();
      expect(current.version).toBe(version);
      expect(current.active).toBe(true);
    });

    it("should complete activation in <10 seconds", async () => {
      const schema = createValidSchema();
      const version = await schemaVersion.uploadVersion(schema);

      const start = Date.now();
      await schemaVersion.activateVersion(version);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10000);
    });

    it("should broadcast schema change to connected clients", async () => {
      const schema = createValidSchema();
      const version = await schemaVersion.uploadVersion(schema);
      const broadcastSpy = jest.spyOn(
        schemaVersion as any,
        "broadcastSchemaChange"
      );

      await schemaVersion.activateVersion(version);

      expect(broadcastSpy).toHaveBeenCalledWith(version);
    });
  });

  describe("rollback", () => {
    it("should rollback to previous version", async () => {
      const schema1 = createValidSchema();
      const schema2 = createValidSchema();

      const v1 = await schemaVersion.uploadVersion(schema1);
      await schemaVersion.activateVersion(v1);

      const v2 = await schemaVersion.uploadVersion(schema2);
      await schemaVersion.activateVersion(v2);

      await schemaVersion.rollback(v1);

      const current = await schemaVersion.getCurrentVersion();
      expect(current.version).toBe(v1);
    });

    it("should restore previous version on failed activation", async () => {
      const schema1 = createValidSchema();
      const schema2 = createInvalidRuntimeSchema(); // Compiles but fails at runtime

      const v1 = await schemaVersion.uploadVersion(schema1);
      await schemaVersion.activateVersion(v1);

      const v2 = await schemaVersion.uploadVersion(schema2);

      await expect(schemaVersion.activateVersion(v2)).rejects.toThrow();

      const current = await schemaVersion.getCurrentVersion();
      expect(current.version).toBe(v1); // Should still be on v1
    });
  });
});
```

**✅ Task 2.3 is DONE when:** All hot reload tests pass + zero downtime

---

### Task 2.4 & 2.5: Admin UI - Test Suite

**Component Tests:**

```typescript
// admin-ui/customer-admin/components/schema-canvas.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemaCanvas } from "./schema-canvas";

describe("SchemaCanvas", () => {
  it("should render empty canvas", () => {
    render(<SchemaCanvas />);
    expect(screen.getByText("Add Entity")).toBeInTheDocument();
  });

  it("should add entity on button click", () => {
    render(<SchemaCanvas />);
    fireEvent.click(screen.getByText("Add Entity"));
    expect(screen.getByText("NewEntity")).toBeInTheDocument();
  });

  it("should select entity on click", () => {
    render(<SchemaCanvas />);
    fireEvent.click(screen.getByText("Add Entity"));
    const entity = screen.getByText("NewEntity");
    fireEvent.click(entity);
    // Verify entity editor panel opens
    expect(screen.getByText("Edit Entity")).toBeInTheDocument();
  });
});

// admin-ui/customer-admin/components/entity-editor-panel.test.tsx
describe("EntityEditorPanel", () => {
  it("should update entity name", () => {
    render(<EntityEditorPanel />);
    const input = screen.getByLabelText("Entity Name");
    fireEvent.change(input, { target: { value: "User" } });
    expect(input).toHaveValue("User");
  });

  it("should add field on button click", () => {
    render(<EntityEditorPanel />);
    fireEvent.click(screen.getByText("Add Field"));
    expect(screen.getByPlaceholderText("Field name")).toBeInTheDocument();
  });
});
```

**E2E Tests:**

```typescript
// admin-ui/customer-admin/tests/e2e/schema-editor.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Schema Editor E2E", () => {
  test("should create complete schema in <3 minutes", async ({ page }) => {
    const startTime = Date.now();

    await page.goto("/schema");

    // Add User entity
    await page.click("text=Add Entity");
    await page.fill('input[name="entityName"]', "User");
    await page.click("text=Add Field");
    await page.fill('input[placeholder="Field name"]', "email");
    await page.selectOption("select", "string");
    await page.check('input[type="checkbox"][value="required"]');

    // Add Document entity
    await page.click("text=Add Entity");
    await page.fill('input[name="entityName"]', "Document");
    await page.click("text=Add Field");
    await page.fill('input[placeholder="Field name"]', "owner");
    await page.selectOption("select", "reference");
    await page.selectOption('select[name="referenceType"]', "User");

    // Save and activate
    await page.click("text=Save & Activate");
    await expect(
      page.locator("text=Schema activated successfully")
    ).toBeVisible();

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(180000); // <3 minutes
  });

  test("should show validation errors for invalid schema", async ({ page }) => {
    await page.goto("/schema");
    await page.click("text=Add Entity");
    // Leave entity name empty
    await page.click("text=Save & Activate");

    await expect(page.locator("text=Entity name is required")).toBeVisible();
  });

  test("should rollback to previous version", async ({ page }) => {
    await page.goto("/schema/versions");
    await page.click('button[aria-label="Rollback to v1"]');
    await expect(page.locator("text=Rolled back to version 1")).toBeVisible();
  });
});
```

**✅ Tasks 2.4-2.6 are DONE when:** All component + E2E tests pass

---

### Overall Phase 2 TDD Completion Criteria

**Phase 2 is considered COMPLETE when:**

- ✅ All validation tests pass (100+ test cases)
- ✅ All compiler generator tests pass
- ✅ All hot reload tests pass
- ✅ All UI component tests pass (>80% coverage)
- ✅ All E2E tests pass (schema creation <3 min)
- ✅ Performance tests meet targets
- ✅ No flaky tests (100% pass rate over 10 runs)

**Run full test suite:**

```bash
# Backend tests
cd schema/compiler && npm test -- --coverage
cd ../../cloudflare/worker && npm test -- --coverage

# Frontend tests
cd admin-ui/customer-admin && npm test -- --coverage

# E2E tests
cd admin-ui/customer-admin && npx playwright test
```

---

## 🧪 Testing Strategy

### Unit Tests

- [ ] Schema validator tests
- [ ] Compiler generators tests
- [ ] Hot reload logic tests
- [ ] UI component tests

### Integration Tests

- [ ] Schema upload → validation → compilation
- [ ] Schema activation → runtime reload → client sync
- [ ] Rollback → restore previous version
- [ ] UI → API → backend flow

### E2E Tests

- [ ] Complete schema creation flow in UI
- [ ] Schema activation with live client
- [ ] Rollback after failed activation

---

## 🎯 Success Criteria

### Performance Targets

- ✅ Time to add entity: <3 minutes (vs 2-4 hours)
- ✅ Schema compilation: <5 seconds
- ✅ Hot reload: <10 seconds
- ✅ Zero downtime during schema updates

### Functionality Targets

- ✅ Visual schema editor working
- ✅ Hot reload system working
- ✅ Version management working
- ✅ Rollback working
- ✅ Both admin UIs deployed
- ✅ Dogfooding: UIs use Relish authorization

### Developer Experience Targets

- ✅ Clear validation errors
- ✅ Live preview working
- ✅ One-click deployment
- ✅ Complete documentation

---

## 📚 Related Documents

- [MASTER_PLAN.md](../MASTER_PLAN.md) - High-level roadmap
- [PHASE_1_CLIENT_SDK.md](./PHASE_1_CLIENT_SDK.md) - Client SDK implementation
- [CUSTOMER_ADMIN_UI_WEB.md](./CUSTOMER_ADMIN_UI_WEB.md) - Customer Admin UI details
- [RELISH_ADMIN_UI.md](./RELISH_ADMIN_UI.md) - Relish Admin UI details

---

**Last Updated:** January 11, 2026  
**Next Review:** Weekly during implementation
