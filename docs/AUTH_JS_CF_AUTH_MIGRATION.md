# Relish: Multi-Tenant Auth Platform Migration & Architecture Plan

**Date:** January 10, 2026  
**Status:** Architecture Planning  
**Target:** Build multi-tenant authentication + authorization platform for third-party developers

---

## Executive Summary

**Relish** is a vertically integrated **authentication + authorization platform** designed for third-party developers to add auth to their web, mobile, native, and desktop applications. This document outlines the architecture for a multi-tenant system that combines:

1. **CF-Auth** - Multi-tenant authentication service (credentials + OAuth)
2. **Relish Authorization** - Client-side graph-based authorization (<1ms queries)
3. **Tenant Isolation** - Each customer gets isolated namespace for users and schemas

### Vision: "Cloudflare Auth0 + Clerk + FGA"

Build a developer platform that provides:

- 🔐 **Authentication** for any platform (web, mobile, native, desktop)
- ⚡ **Authorization** with client-side sub-millisecond queries
- 🏢 **Multi-tenancy** with complete namespace isolation
- 🔧 **Self-service** tenant setup and management
- 📦 **Flexible SDKs** not married to any single framework
- 🍴 **Dogfooding** - Relish uses Relish to manage itself (graph-of-graphs architecture)

### Target Customers

**Third-party developers** who want to add authentication and authorization to their applications:

- SaaS founders building multi-user applications
- Enterprise teams needing fine-grained permissions
- Mobile/desktop app developers requiring auth
- API providers needing access control

### Key Differentiators

1. **Client-Side Authorization**: Unlike Auth0 (server-side checks), Relish runs authorization queries in the browser (<1ms)
2. **Unified Platform**: Authentication + Authorization in one system (not two separate products)
3. **Schema-Driven**: Developers define custom authorization schemas via YAML
4. **Edge-Native**: Built on Cloudflare Workers (globally distributed, zero cold starts)
5. **Any Platform**: Web, mobile, native, desktop via flexible APIs

### Current State: Prototype Phase

**CF-Auth:**

- ✅ JWT authentication working
- ✅ Email verification (AWS SES)
- ✅ Pulumi infrastructure
- ❌ **No production users** (greenfield migration)

**Relish:**

- ✅ Client-side KuzuDB WASM
- ✅ Graph-based authorization
- ✅ Schema infrastructure started
- ❌ Not yet integrated with auth

**Next Step:** Architect multi-tenant system from ground up

---

## Multi-Tenant Architecture: Graph-of-Graphs (Dogfooding)

### Core Concept: Relish Uses Relish 🍴

**The big idea:** Instead of hardcoding tenant management, **Relish is itself a Relish tenant**. The platform's organizational structure (tenants, API keys, billing, etc.) is managed using Relish's own graph-based authorization system.

This creates a **fractal architecture** where:

1. **Relish Platform** = A special Relish tenant ("tenant:relish-platform")
2. **Customer Tenants** = Nodes in Relish Platform's authorization graph
3. **End Users** = Nodes in each customer tenant's authorization graph
4. **Sub-Organizations** = Customer tenants can have hierarchical sub-graphs (enterprise departments, teams, etc.)

```
┌─────────────────────────────────────────────────────────────────┐
│           Relish Platform (tenant:relish-platform)              │
│                   Uses its own authorization graph              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Platform Schema (schema.yaml):                                │
│  ┌────────────────────────────────────────────────────┐        │
│  │ entities:                                          │        │
│  │   - Tenant (customer organizations)                │        │
│  │   - PlatformAdmin (Relish employees)               │        │
│  │   - APIKey (tenant credentials)                    │        │
│  │   - Schema (tenant authorization models)           │        │
│  │                                                    │        │
│  │ relationships:                                     │        │
│  │   - owns: Tenant → APIKey                          │        │
│  │   - manages: PlatformAdmin → Tenant                │        │
│  │   - has_schema: Tenant → Schema                    │        │
│  │   - parent_of: Tenant → Tenant (hierarchies!)      │        │
│  └────────────────────────────────────────────────────┘        │
│                                                                 │
│  Authorization Graph (KuzuDB):                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │                                                     │       │
│  │  (Tenant:acme-corp) ──owns──> (APIKey:pk_live_xxx) │       │
│  │         │                                           │       │
│  │         └──has_schema──> (Schema:acme-v1.0)        │       │
│  │         │                                           │       │
│  │         └──parent_of──> (Tenant:acme-engineering)  │       │
│  │                                  │                  │       │
│  │                                  └──has_users──> …  │       │
│  │                                                     │       │
│  │  (Tenant:startup-xyz) ──owns──> (APIKey:pk_test_y) │       │
│  │         │                                           │       │
│  │         └──has_schema──> (Schema:startup-v2.1)     │       │
│  │                                                     │       │
│  │  (PlatformAdmin:logan) ──manages──> (Tenant:*)     │       │
│  │                                                     │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
│  Each Customer Tenant = Sub-graph:                             │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  Tenant: acme-corp                                  │       │
│  │  ┌───────────────────────────────────────────┐      │       │
│  │  │ Their Schema:                             │      │       │
│  │  │   - User, Project, Task                   │      │       │
│  │  │   - member_of, assigned_to                │      │       │
│  │  │                                           │      │       │
│  │  │ Their Graph:                              │      │       │
│  │  │   (User:alice) ──member_of──> (Proj:123) │      │       │
│  │  │   (User:bob) ──assigned_to──> (Task:456) │      │       │
│  │  └───────────────────────────────────────────┘      │       │
│  │                                                     │       │
│  │  Tenant: acme-engineering (sub-org of acme-corp)   │       │
│  │  ┌───────────────────────────────────────────┐      │       │
│  │  │ Inherits parent schema or extends it      │      │       │
│  │  │ Isolated sub-graph within parent tenant   │      │       │
│  │  └───────────────────────────────────────────┘      │       │
│  └─────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘

              Graphs all the way down! 🐢🐢🐢
```

### Why This is Powerful

**1. Dogfooding = Better Product**

- We use Relish to manage Relish
- Every limitation we hit, our customers hit
- Forces us to build what we need

**2. Flexible Hierarchies**

- Enterprises can have departments (sub-tenants)
- Agencies can manage client tenants
- Resellers can white-label with their own tenant structure

**3. Schema-Driven Platform Management**

- No hardcoded tenant logic in code
- Platform behavior defined by schema.yaml
- Can evolve platform structure without code changes

**4. Unified Query Model**

- Platform queries: "Can admin X manage tenant Y?"
- Tenant queries: "Can user A delete project B?"
- Same authorization engine, different graphs

**5. Recursive Multi-Tenancy**

- Tenant → Sub-Tenant → Sub-Sub-Tenant (unlimited depth)
- Each level has isolated graph
- Inheritance and delegation patterns

### Platform Schema: Relish Managing Relish

The Relish platform itself uses a `platform-schema.yaml` to define its own authorization model:

```yaml
# platform-schema.yaml
# This is the schema that Relish uses to manage itself!

name: relish-platform-authorization
version: 1.0.0

entities:
  - name: Tenant
    description: Customer organizations using Relish
    fields:
      - name: id
        type: string
        required: true
        unique: true
      - name: slug
        type: string
        required: true
        unique: true
      - name: plan
        type: enum
        values: [free, pro, enterprise]
        required: true
      - name: status
        type: enum
        values: [active, suspended, deleted]
        required: true
      - name: parent_id
        type: tenant_reference # Enables hierarchies!
        description: Parent tenant for sub-organizations

  - name: PlatformAdmin
    description: Relish employees who manage the platform
    fields:
      - name: id
        type: string
        required: true
      - name: email
        type: string
        format: email
        required: true
      - name: role
        type: enum
        values: [superadmin, support, billing, readonly]

  - name: APIKey
    description: Tenant API credentials
    fields:
      - name: id
        type: string
        required: true
      - name: key_prefix
        type: string
        required: true
      - name: type
        type: enum
        values: [public, secret, restricted]
      - name: environment
        type: enum
        values: [test, live]

  - name: TenantSchema
    description: Authorization schemas uploaded by tenants
    fields:
      - name: id
        type: string
        required: true
      - name: version
        type: string
        required: true
      - name: is_active
        type: boolean
        required: true

relationships:
  - name: owns
    from: Tenant
    to: APIKey
    cardinality: one_to_many
    permissions:
      - view
      - rotate
      - revoke

  - name: manages
    from: PlatformAdmin
    to: Tenant
    cardinality: many_to_many
    permissions:
      - view
      - suspend
      - configure
      - delete

  - name: has_schema
    from: Tenant
    to: TenantSchema
    cardinality: one_to_many
    permissions:
      - upload
      - activate
      - rollback

  - name: parent_of
    from: Tenant
    to: Tenant
    cardinality: one_to_many
    description: Enables hierarchical tenant structures
    permissions:
      - create_child
      - view_children
      - inherit_config

indexes:
  - fields: [Tenant.slug]
    unique: true
  - fields: [Tenant.parent_id]
  - fields: [APIKey.key_prefix]
```

**Platform Authorization Queries:**

```typescript
// Query 1: Can this admin suspend this tenant?
await relishPlatform.authz.can("suspend", "tenant:acme-corp", {
  actor: "admin:logan",
});

// Query 2: Get all tenants this admin manages
await relishPlatform.authz.query`
  MATCH (admin:PlatformAdmin {id: $adminId})-[:manages]->(t:Tenant)
  RETURN t
`;

// Query 3: Can this tenant create a sub-organization?
await relishPlatform.authz.can("create_child", "tenant:enterprise-corp", {
  actor: "tenant:enterprise-corp",
});

// Query 4: Get all API keys for a tenant (including sub-tenants)
await relishPlatform.authz.query`
  MATCH (t:Tenant {id: $tenantId})-[:parent_of*0..]->(child:Tenant)-[:owns]->(key:APIKey)
  WHERE key.environment = 'live'
  RETURN key
`;
```

### Tenant Data Model

```typescript
interface Tenant {
  id: string; // tenant:acme-corp
  slug: string; // acme-corp (unique, URL-friendly)
  name: string; // "Acme Corporation"
  plan: "free" | "pro" | "enterprise";

  // Hierarchical multi-tenancy (graph-of-graphs)
  parentId?: string; // tenant:enterprise-corp (for sub-orgs)
  depth: number; // 0 = root, 1 = first level, etc.

  // Authentication config
  authMethods: {
    email: boolean; // Email/password enabled?
    oauth: {
      google?: OAuthConfig;
      github?: OAuthConfig;
      microsoft?: OAuthConfig;
      custom?: SAMLConfig[];
    };
    magicLink: boolean;
    passkeys: boolean; // WebAuthn/FIDO2
  };

  // Authorization schema
  schemaVersion: string; // "1.2.0"
  schemaUrl: string; // R2 URL to schema.yaml

  // API credentials
  publicKey: string; // pk_live_xxx (for client-side)
  secretKey: string; // sk_live_xxx (for server-side)

  // Customization
  branding?: {
    logoUrl: string;
    primaryColor: string;
    domain?: string; // Custom domain: auth.acme.com
  };

  // Limits & billing
  limits: {
    maxUsers: number;
    maxRequests: number; // Per month
    maxSchemaSize: number; // KB
  };

  createdAt: number;
  updatedAt: number;
  status: "active" | "suspended" | "deleted";
}

interface TenantUser {
  id: string; // Globally unique
  tenantId: string; // Which tenant owns this user

  // Auth.js standard fields
  email: string;
  emailVerified: boolean;
  name?: string;
  image?: string;

  // Tenant-scoped ID (what apps see)
  externalId: string; // user:alice@acme-corp

  // Authentication metadata
  authMethod: "credentials" | "oauth" | "magic-link" | "passkey";
  lastLoginAt: number;

  // Custom metadata (tenant-defined)
  metadata: Record<string, any>;

  createdAt: number;
  updatedAt: number;
}

interface TenantAuthorizationSchema {
  tenantId: string;
  version: string;
  yaml: string; // Full schema.yaml content
  compiled: {
    types: string; // Generated TypeScript
    validators: string;
    loaders: string;
  };
  publishedAt: number;
}
```

### Database Schema: Multi-Tenant Tables

```sql
-- ============================================
-- TENANTS (Part of Relish Platform Graph)
-- ============================================
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('free', 'pro', 'enterprise')),

  -- Hierarchical multi-tenancy (dogfooding!)
  parent_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  depth INTEGER NOT NULL DEFAULT 0,     -- Graph depth level

  auth_methods TEXT NOT NULL,           -- JSON config
  schema_version TEXT,
  schema_url TEXT,
  public_key TEXT UNIQUE NOT NULL,
  secret_key TEXT UNIQUE NOT NULL,
  branding TEXT,                        -- JSON config
  limits TEXT NOT NULL,                 -- JSON config
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'suspended', 'deleted'))
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_public_key ON tenants(public_key);
CREATE INDEX idx_tenants_parent ON tenants(parent_id);  -- Hierarchy queries

-- ============================================
-- PLATFORM ADMINS (Relish employees)
-- Part of platform authorization graph
-- ============================================
CREATE TABLE platform_admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('superadmin', 'support', 'billing', 'readonly')),
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

-- ============================================
-- PLATFORM PERMISSIONS (Graph relationships)
-- Defines which admins can manage which tenants
-- ============================================
CREATE TABLE platform_admin_tenant_permissions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK(permission IN ('view', 'manage', 'suspend', 'delete')),
  granted_at INTEGER NOT NULL,

  UNIQUE(admin_id, tenant_id, permission)
);

CREATE INDEX idx_platform_perms_admin ON platform_admin_tenant_permissions(admin_id);
CREATE INDEX idx_platform_perms_tenant ON platform_admin_tenant_permissions(tenant_id);

-- ============================================
-- USERS (Multi-tenant)
-- ============================================
CREATE TABLE users (
  id TEXT PRIMARY KEY,                  -- Global ID
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  image TEXT,
  password_hash TEXT,                   -- NULL for OAuth-only
  external_id TEXT NOT NULL,            -- Tenant-scoped ID
  auth_method TEXT NOT NULL,
  metadata TEXT,                        -- JSON
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  UNIQUE(tenant_id, email),             -- Email unique per tenant
  UNIQUE(tenant_id, external_id)        -- External ID unique per tenant
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(tenant_id, email);
CREATE INDEX idx_users_external ON users(tenant_id, external_id);

-- ============================================
-- AUTH.JS ADAPTER TABLES (Multi-tenant)
-- ============================================
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,

  UNIQUE(tenant_id, provider, provider_account_id)
);

CREATE INDEX idx_accounts_user ON accounts(user_id);
CREATE INDEX idx_accounts_tenant ON accounts(tenant_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  session_token TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_tenant ON sessions(tenant_id);

-- ============================================
-- AUTHORIZATION SCHEMAS (Per-tenant)
-- ============================================
CREATE TABLE authorization_schemas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  yaml TEXT NOT NULL,
  compiled_types TEXT,
  compiled_validators TEXT,
  compiled_loaders TEXT,
  published_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,

  UNIQUE(tenant_id, version)
);

CREATE INDEX idx_schemas_tenant_active ON authorization_schemas(tenant_id, is_active);

-- ============================================
-- API KEYS (Per-tenant)
-- ============================================
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,              -- "sk_live_" or "pk_test_"
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('public', 'secret', 'restricted')),
  environment TEXT NOT NULL CHECK(environment IN ('test', 'live')),
  permissions TEXT,                      -- JSON array of scopes
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- ============================================
-- USAGE TRACKING (Per-tenant)
-- ============================================
CREATE TABLE usage_metrics (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,             -- 'auth_requests', 'authz_queries', etc
  count INTEGER NOT NULL,
  period_start INTEGER NOT NULL,         -- Unix timestamp (hour boundary)
  period_end INTEGER NOT NULL,

  UNIQUE(tenant_id, metric_type, period_start)
);

CREATE INDEX idx_usage_tenant_period ON usage_metrics(tenant_id, period_start);
```

---

## Hierarchical Tenants: Enterprise Sub-Organizations

Because the platform uses its own graph-based authorization, tenants can have **child tenants** (sub-organizations).

### Use Cases

**1. Enterprise Departments**

```
Tenant: enterprise-corp (parent)
  ├─ Tenant: engineering (child)
  ├─ Tenant: marketing (child)
  └─ Tenant: sales (child)
```

**2. Agency + Clients**

```
Tenant: design-agency (parent)
  ├─ Tenant: client-acme (child)
  ├─ Tenant: client-startup (child)
  └─ Tenant: client-bigco (child)
```

**3. White-Label Resellers**

```
Tenant: auth-reseller (parent)
  ├─ Tenant: resold-customer-1 (child)
  └─ Tenant: resold-customer-2 (child)
```

### Creating Sub-Tenants

```typescript
// Parent tenant creates child tenant
POST https://api.relish.dev/v1/tenants
Authorization: Bearer sk_live_parent_tenant_key

{
  "name": "Engineering Department",
  "slug": "enterprise-corp-engineering",
  "parentId": "tenant:enterprise-corp",
  "plan": "inherit",  // Inherit from parent or specify
  "isolation": "full"  // or "shared" (shares parent's users)
}

Response:
{
  "id": "tenant:enterprise-corp-engineering",
  "parentId": "tenant:enterprise-corp",
  "depth": 1,
  "publicKey": "pk_live_child_xxxxx",
  "inheritance": {
    "schema": "allowed",      // Can extend parent schema
    "users": "isolated",      // Separate user base
    "billing": "parent"        // Billed to parent
  }
}
```

### Authorization Across Hierarchy

```typescript
// Query: Can parent admin manage child tenant?
await relishPlatform.authz.query`
  MATCH (parent:Tenant {id: $parentId})-[:parent_of*1..]->(child:Tenant {id: $childId})
  RETURN count(*) > 0 AS canManage
`;

// Query: Get all child tenants (recursive)
await relishPlatform.authz.query`
  MATCH (root:Tenant {id: $rootId})-[:parent_of*0..]->(descendant:Tenant)
  RETURN descendant
  ORDER BY descendant.depth
`;

// Query: Aggregate usage across tenant hierarchy
await relishPlatform.authz.query`
  MATCH (root:Tenant {id: $rootId})-[:parent_of*0..]->(t:Tenant)-[:has_usage]->(u:Usage)
  RETURN 
    t.id AS tenantId,
    t.name AS tenantName,
    t.depth AS depth,
    SUM(u.auth_requests) AS totalAuthRequests,
    SUM(u.authz_queries) AS totalAuthzQueries
`;
```

---

## Platform APIs: Developer-Facing

### Admin API (Tenant Management)

Developers use this to set up and manage their Relish tenant.

#### Create Tenant

```http
POST https://api.relish.dev/v1/tenants
Authorization: Bearer <platform_admin_token>

{
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "plan": "pro",
  "authMethods": {
    "email": true,
    "oauth": {
      "google": {
        "clientId": "xxx",
        "clientSecret": "xxx"
      }
    }
  }
}

Response:
{
  "id": "tenant:acme-corp",
  "slug": "acme-corp",
  "publicKey": "pk_live_xxxxxxxxxxxxx",
  "secretKey": "sk_live_xxxxxxxxxxxxx",
  "apiUrl": "https://acme-corp.relish.dev",
  "createdAt": 1704931200
}
```

#### Upload Authorization Schema

```http
POST https://api.relish.dev/v1/tenants/{tenantId}/schema
Authorization: Bearer sk_live_xxxxxxxxxxxxx
Content-Type: text/yaml

version: "1.0"
name: "Acme Authorization Schema"
entities:
  Project:
    fields:
      - name: id
        type: string
        required: true
  # ... rest of schema.yaml

Response:
{
  "version": "1.0",
  "compiled": true,
  "artifacts": {
    "types": "https://cdn.relish.dev/acme-corp/types-v1.0.js",
    "loaders": "https://cdn.relish.dev/acme-corp/loaders-v1.0.js"
  },
  "publishedAt": 1704931200
}
```

### Authentication API (End-User Facing)

End users of your customers' applications use these endpoints.

#### Universal Authentication Endpoint

```http
POST https://acme-corp.relish.dev/auth/authenticate
Content-Type: application/json
X-Relish-Public-Key: pk_live_xxxxxxxxxxxxx

{
  "method": "credentials",
  "email": "alice@example.com",
  "password": "secure-password"
}

# OR OAuth

{
  "method": "oauth",
  "provider": "google",
  "redirectUrl": "https://myapp.com/callback"
}

# OR Magic Link

{
  "method": "magic-link",
  "email": "alice@example.com"
}

# OR Passkey

{
  "method": "passkey",
  "challenge": "base64-challenge",
  "credential": {...}
}

Response:
{
  "success": true,
  "sessionToken": "sess_xxxxxxxxxxxxx",
  "user": {
    "id": "user:alice",
    "email": "alice@example.com",
    "emailVerified": true,
    "metadata": {}
  },
  "expiresAt": 1704941200
}
```

#### Get Session

```http
GET https://acme-corp.relish.dev/auth/session
Authorization: Bearer sess_xxxxxxxxxxxxx

Response:
{
  "user": {
    "id": "user:alice",
    "email": "alice@example.com",
    "name": "Alice",
    "metadata": {}
  },
  "expiresAt": 1704941200
}
```

### Authorization API (Client-Side)

Runs in the browser/app for sub-millisecond queries.

#### Initialize Authorization Client

```http
GET https://acme-corp.relish.dev/authz/init
Authorization: Bearer sess_xxxxxxxxxxxxx

Response:
{
  "csvBundleUrl": "https://r2.relish.dev/acme-corp/auth-graph-v1.0.tar.gz",
  "schema": {
    "entities": ["User", "Project", "Task"],
    "relationships": ["member_of", "assigned_to"]
  },
  "version": "1.0"
}
```

#### Query Authorization (Client-Side WASM)

```javascript
// Runs in browser with KuzuDB WASM
const relish = await RelishClient.init({
  publicKey: "pk_live_xxxxxxxxxxxxx",
  sessionToken: "sess_xxxxxxxxxxxxx",
});

// <1ms query
const canDelete = await relish.query`
  MATCH (u:User {id: $userId})-[:member_of]->(p:Project {id: $projectId})
  WHERE u.role = 'admin'
  RETURN count(*) > 0 AS authorized
`;

if (canDelete) {
  // Show delete button
}
```

---

## Integration Strategy: Modular Auth Core

### Architecture: Auth-Agnostic Core + Pluggable Auth Providers

Don't marry the platform to Auth.js. Instead, build a **modular core** with pluggable authentication providers.

```
┌────────────────────────────────────────────────────┐
│              Relish Platform Core                  │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────────────────────────────────┐     │
│  │      Authentication Abstraction Layer    │     │
│  ├──────────────────────────────────────────┤     │
│  │  interface AuthProvider {                │     │
│  │    authenticate(...)                     │     │
│  │    createSession(...)                    │     │
│  │    validateSession(...)                  │     │
│  │    revokeSession(...)                    │     │
│  │  }                                       │     │
│  └──────────────────────────────────────────┘     │
│          │          │          │          │       │
│          ▼          ▼          ▼          ▼       │
│  ┌─────────┐ ┌─────────┐ ┌────────┐ ┌────────┐  │
│  │Auth.js  │ │ Custom  │ │ OIDC   │ │ SAML   │  │
│  │Provider │ │JWT Auth │ │Provider│ │Provider│  │
│  └─────────┘ └─────────┘ └────────┘ └────────┘  │
│                                                    │
│  ┌──────────────────────────────────────────┐     │
│  │      Authorization Engine (Relish)       │     │
│  ├──────────────────────────────────────────┤     │
│  │  Schema Compiler                         │     │
│  │  Graph Query Engine (KuzuDB)             │     │
│  │  CSV Export/Import                       │     │
│  │  WebSocket Sync                          │     │
│  └──────────────────────────────────────────┘     │
│                                                    │
│  ┌──────────────────────────────────────────┐     │
│  │      Multi-Tenant Infrastructure         │     │
│  ├──────────────────────────────────────────┤     │
│  │  Tenant Router (by subdomain/API key)    │     │
│  │  Namespace Isolation                     │     │
│  │  Usage Tracking & Rate Limiting          │     │
│  │  Billing Integration                     │     │
│  └──────────────────────────────────────────┘     │
└────────────────────────────────────────────────────┘
```

### Auth Provider Interface

```typescript
/**
 * Abstract authentication provider interface
 * Implementations: Auth.js, Custom JWT, OIDC, SAML, etc.
 */
interface AuthProvider {
  name: string;

  /**
   * Authenticate user with credentials
   */
  authenticate(
    tenantId: string,
    method: "credentials" | "oauth" | "magic-link" | "passkey",
    params: Record<string, any>
  ): Promise<AuthResult>;

  /**
   * Create session for authenticated user
   */
  createSession(
    tenantId: string,
    userId: string,
    metadata?: Record<string, any>
  ): Promise<Session>;

  /**
   * Validate existing session
   */
  validateSession(
    tenantId: string,
    sessionToken: string
  ): Promise<Session | null>;

  /**
   * Revoke session (logout)
   */
  revokeSession(tenantId: string, sessionToken: string): Promise<void>;

  /**
   * Link OAuth account to existing user
   */
  linkAccount(
    tenantId: string,
    userId: string,
    provider: string,
    providerAccountId: string,
    tokens: OAuthTokens
  ): Promise<void>;

  /**
   * Get OAuth authorization URL
   */
  getOAuthUrl(
    tenantId: string,
    provider: string,
    redirectUrl: string,
    state: string
  ): Promise<string>;

  /**
   * Handle OAuth callback
   */
  handleOAuthCallback(
    tenantId: string,
    provider: string,
    code: string,
    state: string
  ): Promise<AuthResult>;
}

interface AuthResult {
  success: boolean;
  user?: TenantUser;
  session?: Session;
  error?: string;
}

interface Session {
  id: string;
  token: string;
  userId: string;
  tenantId: string;
  expiresAt: number;
  metadata?: Record<string, any>;
}
```

### Implementation: Auth.js Provider

```typescript
/**
 * Auth.js implementation of AuthProvider
 * Good for: Web apps, OAuth, standard flows
 */
class AuthJsProvider implements AuthProvider {
  name = "authjs";

  async authenticate(tenantId, method, params) {
    const tenant = await getTenant(tenantId);

    if (method === "credentials") {
      // Use Auth.js Credentials Provider
      const result = await signIn("credentials", {
        email: params.email,
        password: params.password,
        redirect: false,
      });

      if (!result.ok) {
        return { success: false, error: "Invalid credentials" };
      }

      const user = await getUser(result.user.id);
      const session = await createSession(tenantId, user.id);

      return { success: true, user, session };
    }

    if (method === "oauth") {
      const url = await this.getOAuthUrl(
        tenantId,
        params.provider,
        params.redirectUrl,
        params.state
      );

      return { success: true, redirectUrl: url };
    }

    throw new Error(`Method ${method} not supported`);
  }

  async createSession(tenantId, userId, metadata) {
    // Auth.js session creation
    const session = await authJs.createSession({
      userId,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    return {
      id: session.id,
      token: session.sessionToken,
      userId,
      tenantId,
      expiresAt: session.expires.getTime(),
      metadata,
    };
  }

  // ... other methods
}
```

### Implementation: Custom JWT Provider

```typescript
/**
 * Custom JWT implementation (mobile/native/desktop)
 * Good for: Native apps, mobile, non-web platforms
 */
class JWTProvider implements AuthProvider {
  name = "jwt";

  async authenticate(tenantId, method, params) {
    if (method === "credentials") {
      const user = await validateCredentials(
        tenantId,
        params.email,
        params.password
      );

      if (!user) {
        return { success: false, error: "Invalid credentials" };
      }

      // Create JWT token
      const token = await createJWT(
        {
          sub: user.id,
          tenant: tenantId,
          email: user.email,
          exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        },
        env.JWT_SECRET
      );

      const session = {
        id: crypto.randomUUID(),
        token,
        userId: user.id,
        tenantId,
        expiresAt: Date.now() + 86400000,
      };

      return { success: true, user, session };
    }

    throw new Error(`Method ${method} not supported by JWT provider`);
  }

  async validateSession(tenantId, sessionToken) {
    try {
      const payload = await verifyJWT(sessionToken, env.JWT_SECRET);

      if (payload.tenant !== tenantId) {
        return null; // Wrong tenant
      }

      const user = await getUser(payload.sub);

      return {
        id: payload.jti,
        token: sessionToken,
        userId: user.id,
        tenantId,
        expiresAt: payload.exp * 1000,
      };
    } catch (error) {
      return null; // Invalid token
    }
  }

  // ... other methods
}
```

### Provider Registry

```typescript
/**
 * Registry of available auth providers
 */
class AuthProviderRegistry {
  private providers = new Map<string, AuthProvider>();

  register(provider: AuthProvider) {
    this.providers.set(provider.name, provider);
  }

  get(name: string): AuthProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Auth provider '${name}' not found`);
    }
    return provider;
  }

  getForTenant(tenant: Tenant): AuthProvider {
    // Choose provider based on tenant config
    // For now, default to Auth.js for web, JWT for native
    return this.get("authjs");
  }
}

// Initialize registry
const authRegistry = new AuthProviderRegistry();
authRegistry.register(new AuthJsProvider());
authRegistry.register(new JWTProvider());
authRegistry.register(new OIDCProvider());
authRegistry.register(new SAMLProvider());
```

---

## Client SDKs: Platform-Agnostic

### Web SDK (JavaScript/TypeScript)

```typescript
import { RelishClient } from "@relish/web";

// Initialize with tenant subdomain or custom domain
const relish = await RelishClient.init({
  tenant: "acme-corp", // or custom domain: 'auth.acme.com'
  publicKey: "pk_live_xxxxxxxxxxxxx",
});

// Authenticate (any method)
const session = await relish.auth.signIn({
  method: "credentials",
  email: "alice@example.com",
  password: "secure-password",
});

// OR OAuth
await relish.auth.signIn({
  method: "oauth",
  provider: "google",
});

// Initialize authorization (loads graph to WASM)
await relish.authz.initialize();

// Query permissions (<1ms)
const canDelete = await relish.authz.can("delete", "project:123");

if (canDelete) {
  await deleteProject("123");
}
```

### React SDK

```typescript
import { RelishProvider, useRelish, useAuthorization } from "@relish/react";

// Wrap app
function App() {
  return (
    <RelishProvider tenant="acme-corp" publicKey="pk_live_xxxxxxxxxxxxx">
      <Dashboard />
    </RelishProvider>
  );
}

// Use in components
function Dashboard() {
  const { user, signOut } = useRelish();
  const { can } = useAuthorization();

  const canCreateProject = can("create", "project");

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      {canCreateProject && <button onClick={createProject}>New Project</button>}
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

### Mobile SDK (React Native / Flutter)

```typescript
import { RelishClient } from "@relish/mobile";

// Initialize with JWT provider (better for mobile)
const relish = await RelishClient.init({
  tenant: "acme-corp",
  publicKey: "pk_live_xxxxxxxxxxxxx",
  provider: "jwt", // Use JWT instead of cookies
});

// Authenticate
const session = await relish.auth.signIn({
  method: "credentials",
  email: "alice@example.com",
  password: "secure-password",
});

// Store token in secure storage
await SecureStore.setItemAsync("relish_token", session.token);

// Later, restore session
const token = await SecureStore.getItemAsync("relish_token");
const user = await relish.auth.getSession(token);

// Authorization works same as web (WASM available on mobile)
await relish.authz.initialize();
const canDelete = await relish.authz.can("delete", "project:123");
```

### Native SDK (Desktop Apps - Electron/Tauri)

````typescript
import { RelishClient } from '@relish/native'

// Same API as web/mobile
const relish = await RelishClient.init({
  tenant: 'acme-corp',
  publicKey: 'pk_live_xxxxxxxxxxxxx',
  storage: 'filesystem', // Use filesystem instead of cookies/localStorage
})

// Desktop-specific: System keychain integration
await relish.auth.signIn({
  method: 'credentials',
  email: 'alice@example.com',

### Server SDK (Node.js, Python, Go)

Backend validation for API routes:

**Node.js:**
```typescript
import { Relish } from '@relish/node'

const relish = new Relish({
  tenant: 'acme-corp',
  secretKey: process.env.RELISH_SECRET_KEY, // Secret key for server
})

// Middleware: Validate user token
app.use(async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')

  const user = await relish.auth.validateToken(token)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  req.user = user
  next()
})

// Route: Check permission before action
app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params

  // Server-side permission check (validates against Relish API)
  const canDelete = await relish.authz.check(req.user.id, 'delete', `project:${id}`)

  if (!canDelete) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  await deleteProject(id)
  res.json({ success: true })
})
````

**Python (FastAPI):**

```python
from relish import Relish
from fastapi import FastAPI, Depends, HTTPException

relish = Relish(
    tenant="acme-corp",
    secret_key=os.environ["RELISH_SECRET_KEY"]
)

app = FastAPI()

async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    token = authorization.replace("Bearer ", "")
    user = await relish.auth.validate_token(token)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")

    return user

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, user = Depends(get_current_user)):
    can_delete = await relish.authz.check(user.id, "delete", f"project:{project_id}")

    if not can_delete:
        raise HTTPException(status_code=403, detail="Forbidden")

    await delete_project_logic(project_id)
    return {"success": True}
```

---

## Tenant Onboarding Flow

### Developer Journey

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Dashboard as Relish Dashboard
    participant API as Admin API
    participant DB as D1 Database
    participant DO as Durable Object

    Dev->>Dashboard: Sign up for Relish
    Dashboard->>API: POST /admin/tenants
    API->>DB: Create tenant record
    API->>DO: Initialize tenant namespace
    API-->>Dashboard: Tenant created + API keys
    Dashboard-->>Dev: Show API keys, docs link

    Dev->>Dashboard: Upload schema.yaml
    Dashboard->>API: POST /admin/tenants/{id}/schema
    API->>DB: Store schema (versioned)
    API->>DO: Compile schema → types
    API-->>Dashboard: Schema active

    Dev->>Dashboard: Configure auth (enable OAuth)
    Dashboard->>API: PUT /admin/tenants/{id}/config
    API->>DB: Update tenant config
    API-->>Dashboard: Config saved

    Dev->>Dev: Install @relish/web SDK
    Dev->>Dev: Integrate auth + authz
    Dev->>Dev: Deploy application
```

### Step-by-Step Onboarding

**Step 1: Create Tenant**

```typescript
// Developer signs up via dashboard
POST https://api.relish.sh/admin/tenants

{
  "name": "Acme Corp",
  "slug": "acme-corp",  // Becomes subdomain: acme-corp.auth.relish.sh
  "plan": "pro",
  "authMethods": ["credentials", "oauth"],
  "oauthProviders": ["google", "github"]
}

// Response
{
  "tenant": {
    "id": "tenant_abc123",
    "slug": "acme-corp",
    "authEndpoint": "https://acme-corp.auth.relish.sh",
    "plan": "pro"
  },
  "apiKeys": {
    "publicKey": "pk_live_xxxxxxxxxxxxx",      // Safe for client-side
    "secretKey": "sk_live_yyyyyyyyyyyyyyyyy"    // Server-side only
  }
}
```

**Step 2: Upload Authorization Schema**

```typescript
// Developer defines custom permissions
POST https://api.relish.sh/admin/tenants/acme-corp/schema

// Upload schema.yaml
{
  "version": "1.0.0",
  "yaml": `
    name: acme-corp-authz
    version: 1.0.0

    entities:
      - name: User
        fields:
          - name: id
            type: string
            required: true
          - name: email
            type: string
            required: true

      - name: Project
        fields:
          - name: id
            type: string
          - name: ownerId
            type: user_reference

    relationships:
      - name: owner
        from: Project
        to: User
        cardinality: many_to_one

      - name: member
        from: User
        to: Project
        cardinality: many_to_many
        permissions:
          - view
          - edit
          - delete
  `
}

// Response
{
  "schema": {
    "version": "1.0.0",
    "compiledAt": "2026-01-10T12:00:00Z",
    "status": "active"
  },
  "types": "https://cdn.relish.sh/acme-corp/schema-v1.d.ts"  // Generated types
}
```

**Step 3: Configure OAuth (Optional)**

```typescript
// Developer adds OAuth credentials
PUT https://api.relish.sh/admin/tenants/acme-corp/config

{
  "oauth": {
    "google": {
      "clientId": "google-client-id",
      "clientSecret": "google-client-secret",
      "callbackUrl": "https://acme-corp.auth.relish.sh/callback/google"
    },
    "github": {
      "clientId": "github-client-id",
      "clientSecret": "github-client-secret",
      "callbackUrl": "https://acme-corp.auth.relish.sh/callback/github"
    }
  },
  "session": {
    "maxAge": 2592000,  // 30 days
    "updateAge": 86400   // Update every day
  }
}
```

**Step 4: Integrate SDK**

```typescript
// Developer adds to their app
npm install @relish/web

// Initialize in app
import { RelishClient } from '@relish/web'

const relish = await RelishClient.init({
  tenant: 'acme-corp',
  publicKey: 'pk_live_xxxxxxxxxxxxx',
})

// Use authentication
await relish.auth.signIn({
  method: 'credentials',
  email: 'user@example.com',
  password: 'password',
})

// Use authorization
await relish.authz.initialize()
const canDelete = await relish.authz.can('delete', 'project:123')
```

---

## Implementation Roadmap

### Phase 1: Multi-Tenant Foundation (Weeks 1-3)

**Goal:** Build core multi-tenant infrastructure

**Week 1: Database & Tenant Routing**

- [ ] Create multi-tenant database schema (D1)
- [ ] Build tenant router middleware (subdomain → tenant_id)
- [ ] Implement namespace isolation (tenant:acme-corp prefix)
- [ ] Create tenant CRUD API
- [ ] Add API key generation and validation

**Week 2: Durable Objects Per Tenant**

- [ ] Create TenantDurableObject class
- [ ] Implement per-tenant state management
- [ ] Build tenant isolation layer
- [ ] Add usage tracking middleware
- [ ] Create rate limiting per tenant

**Week 3: Tenant Admin API**

- [ ] POST /admin/tenants (create tenant)
- [ ] GET /admin/tenants/:id (get tenant)
- [ ] PUT /admin/tenants/:id (update config)
- [ ] POST /admin/tenants/:id/schema (upload schema)
- [ ] GET /admin/tenants/:id/usage (metrics)
- [ ] DELETE /admin/tenants/:id (soft delete)

**Deliverables:**

- Multi-tenant database with isolation
- Tenant routing and namespace isolation
- Admin API for tenant management
- API key authentication
- Usage tracking foundation

---

### Phase 2: Modular Auth Providers (Weeks 4-6)

**Goal:** Build pluggable authentication system (not married to Auth.js)

**Week 4: Auth Provider Interface**

- [ ] Define AuthProvider abstract interface
- [ ] Create AuthProviderRegistry
- [ ] Build provider selection logic (per tenant)
- [ ] Add provider configuration storage
- [ ] Implement provider lifecycle (init, validate, destroy)

**Week 5: Auth.js Provider (Web Apps)**

- [ ] Implement AuthJsProvider
- [ ] Add Auth.js D1 adapter
- [ ] Build OAuth flows (Google, GitHub, Twitter)
- [ ] Implement credentials provider
- [ ] Add session management
- [ ] Create account linking logic

**Week 6: JWT Provider (Mobile/Native)**

- [ ] Implement JWTProvider
- [ ] Build JWT signing/validation
- [ ] Add refresh token flow
- [ ] Create token blacklist (logout)
- [ ] Implement PKCE for mobile OAuth

**Deliverables:**

- Pluggable auth provider system
- Auth.js provider (web, OAuth, credentials)
- JWT provider (mobile, native, desktop)
- Per-tenant provider configuration
- Account linking across providers

---

### Phase 3: Authentication API (Weeks 7-9)

**Goal:** Universal auth endpoints for all platforms

**Week 7: Core Auth Endpoints**

- [ ] POST /auth/signin (universal auth endpoint)
- [ ] POST /auth/signup (universal registration)
- [ ] POST /auth/signout (logout)
- [ ] GET /auth/session (get current session)
- [ ] POST /auth/refresh (refresh token)
- [ ] GET /auth/providers (list configured providers)

**Week 8: OAuth Flows**

- [ ] GET /auth/oauth/:provider (initiate OAuth)
- [ ] GET /auth/callback/:provider (OAuth callback)
- [ ] POST /auth/link/:provider (link account)
- [ ] DELETE /auth/unlink/:provider (unlink account)
- [ ] GET /auth/accounts (list linked accounts)

**Week 9: Email Workflows**

- [ ] POST /auth/verify-email (send verification)
- [ ] GET /auth/verify/:token (verify email)
- [ ] POST /auth/forgot-password (initiate reset)
- [ ] POST /auth/reset-password (reset with token)
- [ ] Integrate AWS SES (existing infrastructure)
- [ ] Keep MJML email templates

**Deliverables:**

- Complete authentication API
- OAuth integration (50+ providers via Auth.js)
- Email verification flow
- Password reset flow
- Session management
- Multi-platform support

---

### Phase 4: Authorization API & Client SDKs (Weeks 10-14)

**Goal:** Client-side authorization with platform-agnostic SDKs

**Week 10: Authorization API**

- [ ] GET /authz/graph/:tenant (download CSV graph)
- [ ] POST /authz/sync (incremental updates via KV)
- [ ] WebSocket /authz/ws (real-time updates)
- [ ] POST /authz/check (server-side validation)
- [ ] GET /authz/schema (get compiled schema)

**Week 11-12: Core Client SDKs**

- [ ] @relish/web (JavaScript/TypeScript)
  - Browser WASM authorization
  - Cookie-based auth
  - WebSocket sync
- [ ] @relish/react
  - RelishProvider context
  - useRelish hook (auth)
  - useAuthorization hook (permissions)
- [ ] @relish/mobile
  - Mobile WASM (React Native/Flutter)
  - JWT token storage
  - SecureStore integration

**Week 13-14: Extended SDKs**

- [ ] @relish/native (Electron/Tauri)
  - Desktop WASM
  - System keychain
- [ ] @relish/node (Server SDK)
  - Token validation
  - Server-side permission checks
- [ ] @relish/python (optional)
- [ ] @relish/go (optional)

**Deliverables:**

- Complete authorization API
- Client SDKs for all platforms
- Platform-agnostic API
- Generated TypeScript types per tenant

---

### Phase 5: Admin Dashboard & Billing (Weeks 15-18)

**Goal:** Self-service platform for developers

**Week 15-16: Admin Dashboard**

- [ ] Tenant creation flow
- [ ] API key management
- [ ] Schema editor (YAML with validation)
- [ ] OAuth provider configuration
- [ ] User management (list, search, delete)

**Week 17: Usage Analytics**

- [ ] Auth request metrics
- [ ] Authorization query metrics
- [ ] Active user counts
- [ ] Cost estimation

**Week 18: Billing Integration**

- [ ] Stripe integration
- [ ] Usage-based pricing
- [ ] Plan management (free, pro, enterprise)
- [ ] Payment flow

**Deliverables:**

- Complete admin dashboard
- Self-service tenant setup
- Usage analytics
- Billing system

---

## Security Model

### Multi-Tenant Isolation

**Database Isolation:**

```sql
-- All queries enforce tenant_id
SELECT * FROM users WHERE tenant_id = :current_tenant_id AND id = :user_id

-- Policies prevent cross-tenant leaks
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

**Namespace Isolation:**

```typescript
// All resource IDs include tenant prefix
const resourceId = `tenant:acme-corp:user:alice`;
const projectId = `tenant:acme-corp:project:123`;

// Authorization queries scoped to tenant
const canDelete = await relish.authz.can(
  "delete",
  `tenant:${tenantId}:project:123`
);
```

**API Key Scoping:**

- Public key (pk\_\*): Client-side, read-only, tenant-scoped
- Secret key (sk\_\*): Server-side, full access, tenant-scoped
- Admin key (adm\_\*): Platform admin only

### Rate Limiting

**Per-Tenant Limits:**

```typescript
// Free tier: 1,000 requests/minute
// Pro tier: 10,000 requests/minute
// Enterprise: Custom limits

interface TenantLimits {
  authRequestsPerMinute: number;
  authzQueriesPerMinute: number;
  usersMax: number;
  schemasMax: number;
}
```

**Implementation:**

```typescript
// Cloudflare KV-based rate limiting
async function checkRateLimit(
  tenantId: string,
  operation: string
): Promise<boolean> {
  const key = `ratelimit:${tenantId}:${operation}:${getMinuteWindow()}`;
  const count = await KV.get(key);

  const limit = getTenantLimit(tenantId, operation);

  if (count >= limit) {
    throw new RateLimitError(`Exceeded ${limit} ${operation}/minute`);
  }

  await KV.put(key, count + 1, { expirationTtl: 60 });
  return true;
}
```

---

## Migration from Prototype

### Current State (CF-Auth Prototype)

**What Exists:**

- JWT authentication (email/password)
- AWS SES email service
- Pulumi infrastructure
- D1 database
- Basic endpoints
- **No production users** (greenfield)

### Migration Strategy

**Phase 1: Add Multi-Tenancy (Week 1)**

1. Create `tenants` table
2. Add `tenant_id` to existing tables
3. Create default "platform" tenant for Relish itself
4. Migrate existing test data to default tenant

**Phase 2: Build Tenant Router (Week 2)**

1. Implement subdomain routing
2. Add API key middleware
3. Create namespace isolation
4. Test with multiple test tenants

**Phase 3: Add Modular Auth (Weeks 3-6)**

1. Extract JWT logic into JWTProvider
2. Add Auth.js as AuthJsProvider
3. Create provider registry
4. Per-tenant provider selection

**Phase 4: Authorization Integration (Weeks 7-10)**

1. Build Relish authorization API
2. Integrate with cf-auth
3. Create unified auth + authz endpoints
4. Test end-to-end flows

**Phase 5: Launch Platform (Weeks 11-18)**

1. Build admin dashboard
2. Add billing
3. Create documentation site
4. Beta launch with early customers

---

## Success Metrics

**Developer Experience:**

- Time to first auth: < 5 minutes
- Schema upload to active: < 1 minute
- SDK installation to working: < 10 minutes

**Performance:**

- Auth request latency: < 100ms (p95)
- Authorization query latency: < 1ms (p95, client-side)
- WebSocket sync latency: < 50ms (p95)

**Business:**

- Free tier: 1,000 MAU, 10,000 authz queries/day
- Pro tier: $49/mo, 10,000 MAU, unlimited queries
- Enterprise: Custom pricing, SLA, support

**Reliability:**

- 99.9% uptime SLA
- Zero cross-tenant data leaks
- < 1% false negative authorization checks

---

## Next Steps

1. **Review this architecture** with team
2. **Approve multi-tenant approach** (vs single-tenant service)
3. **Confirm technology stack** (Cloudflare, Auth.js, KuzuDB WASM)
4. **Begin Phase 1 implementation** (multi-tenant foundation)
5. **Set up project tracking** (GitHub Projects, weekly syncs)

---

**Last Updated:** January 10, 2026  
**Status:** Architecture Planning  
**Owner:** Logan Powell  
**Timeline:** 18 weeks to MVP (4.5 months)
