
# Multi-Tenant Architecture Implementation

## Overview

This document describes the multi-tenant infrastructure for the Relish authentication platform. The architecture implements the "graph-of-graphs" dogfooding concept where Relish uses its own authorization system to manage itself and its tenants.

## Architecture Principles

### 1. Graph-of-Graphs (Dogfooding)

**Core Concept**: Relish is a tenant of itself.

```
Relish Platform
├── tenant: relish-platform (dogfooding itself)
│   ├── entities: admin, api_key, tenant
│   ├── relationships: manages, creates, owns
│   └── permissions: defined in platform-schema.yaml
│
└── Customer Tenants
    ├── tenant: acme-corp
    │   └── schema: customer-defined in acme-corp-schema.yaml
    ├── tenant: globex-corp
    │   └── schema: customer-defined in globex-corp-schema.yaml
    └── ... more tenants
```

**Benefits**:
- Platform behavior is not hardcoded; it's driven by data (platform-schema.yaml)
- Tenants can implement custom authorization logic through their own schemas
- Hierarchical tenants with parent/child relationships (up to 5 levels deep)
- Future: Support for multi-level organizations using graph relationships

### 2. Tenant Identification

All requests are routed to identify which tenant they belong to using 4 strategies (in priority order):

1. **API Key** (Primary): Extract tenant from API key lookup
   - Example: Bearer sk_live_xxx in Authorization header
   - Stored in `api_keys.tenant_id`

2. **X-Tenant-ID Header** (Admin): Explicit tenant ID
   - Example: X-Tenant-ID: tenant:acme-corp
   - Used for platform admin operations

3. **Subdomain** (Standard): Extract from request hostname
   - Example: acme-corp.auth.example.com → tenant:acme-corp
   - Maps to `tenants.slug`

4. **Query Parameter** (Fallback): Webhook handling
   - Example: ?tenant=tenant:acme-corp
   - Used when subdomain/header routing is not possible

**Implementation**: `/src/middleware/tenant-router.ts`

```typescript
// Automatically extracts tenant context from request
const tenantContext = extractTenant(db, request);

// Use in middleware
app.use("*", (c, next) => {
  c.set("tenantContext", tenantRouterMiddleware(db)(c));
  await next();
});
```

### 3. Namespace Isolation

**Purpose**: Prevent accidental cross-tenant data leakage through SQL bugs.

**Pattern**: All resource IDs are namespaced with tenant prefix.

```typescript
// Format: tenant:{slug}:{resourceType}:{resourceId}
const userId = namespaceId("tenant:acme-corp", "user", "alice");
// → "tenant:acme-corp:user:alice"

// Extract components
extractTenantId(userId)     // → "tenant:acme-corp"
extractResourceType(userId) // → "user"
extractResourceId(userId)   // → "alice"

// Verify ownership (prevents cross-tenant access)
verifyTenantOwnership(userId, "tenant:acme-corp") // → true
verifyTenantOwnership(userId, "tenant:other-corp") // → false
```

**SQL Usage**:

```sql
-- Build WHERE clause with tenant prefix
WHERE id LIKE 'tenant:acme-corp:%'

-- Or with explicit prefix
WHERE id LIKE CONCAT(?, ':%') USING (tenantId)
```

**Implementation**: `/src/utils/namespace-isolation.ts`

This creates **defense-in-depth**: even if tenant extraction fails, the namespace prefix protects data.

### 4. API Key Authentication

**Purpose**: Authenticate tenants and enforce permission scoping.

**Key Types**:

| Type | Prefix | Secrecy | Use Case |
|------|--------|---------|----------|
| `public` | `pk_live_xxx` | No secret | Client-side code (frontend) |
| `secret` | `sk_live_yyy` | Secret required | Server-to-server requests |
| `restricted` | `rk_live_zzz` | Secret + permissions | Limited-scope requests |

**Environments**: `test`, `live` (appended to prefix)

**Example Prefixes**:
- `pk_live_RwE3KzTvN9mQ2pXqZ7sH` (public key)
- `sk_test_AbCdEfGhIjKlMnOpQrSt` (test secret key)
- `rk_live_aB1cD2eF3gH4iJ5kL6mN` (restricted key)

**Security**:

1. **One-Way Hashing**: Secret is SHA256 hashed for storage (never recoverable)
   ```
   Storage: {keyPrefix: "sk_live_xxx", keyHash: "sha256(secret)"}
   ```

2. **Secret Only Shown Once**: Like password reset tokens
   - User creates key → secret displayed once → never retrievable again
   - If forgotten, user must rotate/regenerate the key

3. **Permission Scoping**: Restricted keys can scope permissions
   ```typescript
   // Example permissions
   ["read:users", "write:projects", "delete:audit"]
   
   // Wildcard support
   ["*"]  // All permissions
   ```

**Endpoints**:

```
POST   /admin/tenants/:id/keys       # Create key (platform admin)
GET    /admin/tenants/:id/keys       # List keys (platform admin)

POST   /v1/api-keys                   # Create key (tenant self-service)
GET    /v1/api-keys                   # List keys (tenant self-service)
POST   /v1/api-keys/:id/rotate        # Rotate key (tenant self-service)
DELETE /v1/api-keys/:id               # Revoke key (tenant self-service)
```

**Implementation**: `/src/utils/api-keys.ts` and `/src/routes/v1/api-keys.ts`

## Database Schema

### Core Infrastructure Tables

#### tenants
Multi-tenant tenants with hierarchical support.

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,                 -- tenant:acme-corp
  slug TEXT UNIQUE,                    -- acme-corp (for subdomain routing)
  name TEXT,                           -- ACME Corporation
  plan TEXT DEFAULT 'free',            -- free | pro | enterprise
  status TEXT DEFAULT 'active',        -- active | suspended | deleted
  public_key TEXT,                     -- Default public API key prefix
  secret_key TEXT,                     -- Default secret API key prefix
  
  -- Hierarchical multi-tenancy
  parent_id TEXT,                      -- Parent tenant (for sub-orgs)
  depth INTEGER DEFAULT 0,             -- Nesting depth (max 5)
  
  -- Tenant customization
  branding JSON,                       -- Logo, colors, domain
  limits JSON,                         -- Rate limits, storage, users
  
  -- Schema versioning
  schema_version INTEGER DEFAULT 1,    -- For tenant data schema
  
  created_at INTEGER,                  -- Unix timestamp
  updated_at INTEGER,                  -- Unix timestamp
  
  FOREIGN KEY (parent_id) REFERENCES tenants(id)
);
```

#### api_keys
API keys for tenant authentication.

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,                 -- uuid
  tenant_id TEXT NOT NULL,             -- tenant:acme-corp
  name TEXT,                           -- "Production Secret Key"
  
  -- Key material
  key_prefix TEXT UNIQUE,              -- sk_live_xxx (publicly visible)
  key_hash TEXT,                       -- SHA256(secret) - stored for validation
  
  -- Key properties
  type TEXT,                           -- public | secret | restricted
  environment TEXT,                    -- test | live
  
  -- Permissions (for restricted keys)
  permissions JSON,                    -- ["read:users", "write:projects"]
  
  -- Lifecycle
  created_at INTEGER,
  revoked_at INTEGER,                  -- Soft delete on revocation
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

#### platform_admins
Platform administrators (not tenants themselves).

```sql
CREATE TABLE platform_admins (
  id TEXT PRIMARY KEY,                 -- uuid
  email TEXT UNIQUE,
  name TEXT,
  role TEXT,                           -- superadmin | support | billing | readonly
  password_hash TEXT,                  -- bcrypt hash
  
  created_at INTEGER,
  updated_at INTEGER
);
```

#### platform_admin_tenant_permissions
Granular permissions for admins on specific tenants.

```sql
CREATE TABLE platform_admin_tenant_permissions (
  admin_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  permission TEXT,                     -- view | edit | delete | manage_keys | etc.
  
  PRIMARY KEY (admin_id, tenant_id, permission),
  FOREIGN KEY (admin_id) REFERENCES platform_admins(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

#### tenant_data_schemas
Stores tenant-defined data schemas (YAML compiled to Drizzle).

```sql
CREATE TABLE tenant_data_schemas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER,
  
  yaml_content TEXT,                   -- Original YAML schema
  compiled_drizzle_types TEXT,         -- Generated TypeScript types
  compilation_status TEXT,             -- success | error
  compilation_error TEXT,              -- Error message if failed
  
  created_at INTEGER,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

#### usage_metrics
Track tenant usage for billing and rate limiting.

```sql
CREATE TABLE usage_metrics (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  
  metric_type TEXT,                    -- api_calls | storage_bytes | users | etc.
  count INTEGER,
  
  period_start INTEGER,                -- Unix timestamp (start of billing period)
  period_end INTEGER,                  -- Unix timestamp (end of billing period)
  
  created_at INTEGER,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

#### Auth.js Tables
Standard Auth.js adapter tables (all multi-tenant).

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  tenant_id TEXT,                      -- Multi-tenant
  type TEXT,
  provider TEXT,
  provider_account_id TEXT,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  session_token TEXT UNIQUE,
  user_id TEXT,
  tenant_id TEXT,                      -- Multi-tenant
  expires INTEGER,
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE verification_tokens (
  identifier TEXT,
  token TEXT UNIQUE,
  expires INTEGER,
  
  PRIMARY KEY (identifier, token)
);
```

## API Endpoints

### Platform Admin API

**Protected by**: Platform API key (sk_live_xxx with type=secret, tenant_id=tenant:relish-platform)

#### Tenant Management

```
POST   /admin/tenants
GET    /admin/tenants
GET    /admin/tenants/:id
PUT    /admin/tenants/:id
DELETE /admin/tenants/:id
```

**Create Tenant** (POST /admin/tenants)

```json
{
  "slug": "acme-corp",
  "name": "ACME Corporation",
  "plan": "pro",
  "parent_id": "tenant:parent-org"  // Optional: for sub-tenants
}
```

Response includes generated credentials:
```json
{
  "tenant": { ... },
  "credentials": {
    "publicKey": "pk_live_xxx",
    "secretKey": "sk_live_yyy"  // Only shown once!
  }
}
```

#### API Key Management (Admin)

```
POST   /admin/tenants/:id/keys
GET    /admin/tenants/:id/keys
```

### Tenant Self-Service API

**Protected by**: Tenant's own API key (any type)

#### API Key Management

```
POST   /v1/api-keys                    # Create key
GET    /v1/api-keys                    # List keys
POST   /v1/api-keys/:id/rotate         # Rotate key (generates new, revokes old)
DELETE /v1/api-keys/:id                # Revoke key
```

**Create API Key** (POST /v1/api-keys)

```json
{
  "name": "Production API",
  "type": "secret",
  "environment": "live",
  "permissions": ["read:users", "write:projects"]  // For restricted keys only
}
```

## Implementation Files

### Core Utilities

1. **`/src/middleware/tenant-router.ts`** (280 lines)
   - `extractTenant()` - Extract tenant from 4 sources
   - `tenantRouterMiddleware()` - Hono middleware
   - Guard functions: `requireTenant()`, `requireAPIKey()`, `requireKeyType()`

2. **`/src/utils/namespace-isolation.ts`** (300+ lines)
   - `namespaceId()` - Create namespaced ID
   - `extractTenantId()`, `extractResourceType()`, `extractResourceId()`
   - `verifyTenantOwnership()` - Prevent cross-tenant access
   - `buildTenantWhereClause()` - SQL helper
   - `NamespaceBuilder` class - Type-safe builder

3. **`/src/utils/api-keys.ts`** (350+ lines)
   - `generateAPIKey()` - Create key
   - `hashAPIKey()` - One-way hash
   - `saveAPIKey()` - Persist to database
   - `validateAPIKey()` - Authenticate request
   - `hasPermission()` - Check permissions
   - `revokeAPIKey()` - Soft delete
   - `rotateAPIKey()` - Generate new, revoke old
   - `apiKeyAuthMiddleware()` - Hono middleware

### Routes

4. **`/src/routes/admin/tenants.ts`** (300+ lines)
   - Tenant CRUD endpoints
   - API key creation (admin)
   - Hierarchical tenant validation

5. **`/src/routes/v1/api-keys.ts`** (250+ lines)
   - Tenant self-service API key management
   - Permission enforcement
   - Rotation and revocation

### Database

6. **`/src/db/schema.ts`** (485 lines)
   - Complete multi-tenant schema with 9 tables
   - Drizzle ORM definitions
   - Type exports for TypeScript safety

7. **`/drizzle/migrations/0001_dark_revanche.sql`**
   - Generated Drizzle migration
   - Creates all infrastructure tables

### Testing

8. **`/tests/integration.test.ts`** (450+ lines)
   - Tenant router tests (header, subdomain)
   - Namespace isolation tests
   - API key lifecycle tests
   - CRUD operation tests
   - Cross-tenant isolation verification

## Security Layers (Defense-in-Depth)

### Layer 1: Tenant Extraction
- **What it does**: Identifies which tenant owns the request
- **Strategies**: API key, header, subdomain, query param
- **Failure mode**: Request rejected if tenant cannot be identified

### Layer 2: Authentication
- **What it does**: Verifies the request is legitimate
- **Mechanism**: API key secret validation (SHA256 comparison)
- **Failure mode**: Request rejected if API key secret doesn't match

### Layer 3: Namespace Isolation
- **What it does**: Prevents accidental SQL bugs from leaking cross-tenant data
- **Mechanism**: ID prefixes force SQL queries to include tenant prefix
- **Failure mode**: Even if layers 1-2 fail, namespace prefix protects data

### Layer 4: Permission Scoping
- **What it does**: Restricts what a tenant can do
- **Mechanism**: Restricted API keys have explicit permission lists
- **Failure mode**: Operations beyond granted permissions are rejected

### Layer 5: Soft Deletes
- **What it does**: Prevents accidental permanent data loss
- **Mechanism**: Deleted records are marked but not removed
- **Failure mode**: Audit trail preserved for recovery

## Multi-Tenancy Patterns

### 1. Hierarchical Tenants

Tenants can have parent/child relationships:

```
ParentOrg (depth: 0)
├── ChildOrg1 (depth: 1, parent_id: ParentOrg)
│   └── SubChildOrg1 (depth: 2, parent_id: ChildOrg1)
└── ChildOrg2 (depth: 1, parent_id: ParentOrg)
```

Validation: Maximum depth is 5 levels.

**Use cases**:
- Enterprise with regional offices
- SaaS customers with internal org structures
- Multi-brand holding companies

### 2. Namespace Prefixing

All resource IDs include tenant and resource type:

```
Format: tenant:{slug}:{type}:{id}

Examples:
- tenant:acme-corp:user:alice
- tenant:acme-corp:project:roadmap-2024
- tenant:acme-corp:api-key:sk_live_abc123
```

### 3. Per-Tenant Schemas

Each tenant can define custom data structures:

```
tenant:acme-corp has custom-schema.yaml:
  entities:
    - name: Department
      fields:
        - name: deptCode
          type: string
        - name: budget
          type: decimal
  relationships:
    - name: employee_department
      from: Employee
      to: Department
```

(Schema compilation and validation in next phase)

## Migration to D1

To apply the schema to Cloudflare D1:

```bash
cd cf-auth

# Install dependencies
npm install

# Apply migration to D1
npx drizzle-kit push

# Verify schema applied
npx drizzle-kit introspect
```

## Testing

Run integration tests:

```bash
npm test

# Run specific test file
npm test integration.test.ts

# Run in watch mode
npm test -- --watch
```

## Next Steps (Phase 1, Week 2)

1. **Durable Objects per Tenant**
   - Each tenant gets a Durable Object instance
   - Handles rate limiting, caching, real-time features

2. **Admin Dashboard**
   - List and manage tenants
   - View usage metrics
   - Manage platform admins

3. **Tenant Onboarding**
   - Generate default API keys
   - Create initial schema
   - Send welcome email

## Glossary

- **Tenant**: A customer organization using the Relish platform
- **Dogfooding**: Using your own product to manage your own operations
- **Namespace**: A prefix added to all resource IDs to ensure isolation
- **API Key**: Authentication credential used by tenants to call the API
- **Platform Admin**: Internal staff managing the Relish platform
- **Hierarchical Tenants**: Parent-child relationships between tenants
- **Soft Delete**: Marking a record as deleted without removing it physically

## References

- Database Schema: [`/src/db/schema.ts`](/src/db/schema.ts)
- Tenant Router: [`/src/middleware/tenant-router.ts`](/src/middleware/tenant-router.ts)
- Namespace Isolation: [`/src/utils/namespace-isolation.ts`](/src/utils/namespace-isolation.ts)
- API Keys: [`/src/utils/api-keys.ts`](/src/utils/api-keys.ts)
- Platform Schema: [`/schema/platform-schema.yaml`](/schema/platform-schema.yaml)
- Integration Tests: [`/tests/integration.test.ts`](/tests/integration.test.ts)
