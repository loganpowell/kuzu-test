# 🎯 Multi-Tenant Authorization System - Master Implementation Plan

**Last Updated:** January 11, 2026  
**Project Start:** December 2025  
**Overall Progress:** 38% Complete

> **Quick Links:** [Project Summary](../PROJECT_SUMMARY.md) | [Architecture](../ARCHITECTURE.md) | [TDD Success](../TDD_SUCCESS.md)

---

## 📊 Executive Summary

Building a **multi-tenant authorization system** with **<1ms client-side authorization checks** using KuzuDB WASM, Cloudflare Workers, and Durable Objects.

**Key Innovation:** Authorization happens in the browser (no network latency) with server-side validation for security.

### Current Status

| Component               | Progress | Status             |
| ----------------------- | -------- | ------------------ |
| Core Authorization Loop | 52%      | 🟡 In Progress     |
| Schema Infrastructure   | 18%      | 🟠 Started         |
| Auth.js Integration     | 0%       | ⏳ Not Started     |
| Production Readiness    | 0%       | ⏳ Not Started     |
| Advanced Features       | 0%       | ⏳ Not Started     |
| **Overall**             | **38%**  | **🟠 In Progress** |

---

## 🗺️ Implementation Roadmap

### ✅ Phase 0: Foundation (COMPLETE - Dec 2025)

**Status:** 100% Complete  
**Duration:** 2 weeks  
**Reference:** [Phase 1 Week 1](PHASE_1_WEEK_1_COMPLETION.md), [Phase 1 Week 2](PHASE_1_WEEK_2_COMPLETION.md)

- [x] Pulumi infrastructure setup (R2, KV, Durable Objects)
- [x] Worker deployment with Wrangler
- [x] GraphStateCSV implementation (1799 lines)
- [x] CSV loading from R2
- [x] Map-based indexes (O(1) lookups)
- [x] WebSocket infrastructure
- [x] Mutation log in KV
- [x] 35 passing tests (security + E2E)
- [x] Admin Dashboard API
- [x] D1 database setup

**Deliverables:**

- ✅ Working server-side authorization (2-10ms)
- ✅ CSV persistence (R2)
- ✅ Real-time sync (WebSocket)
- ✅ Production Worker deployed

---

### 🚧 Phase 1: Core Authorization Loop (52% - IN PROGRESS)

**Status:** 52% Complete (Server: 100%, Client: 4%)  
**Estimated Duration:** 3-4 weeks  
**Target:** Enable <1ms client-side authorization checks

**Detailed Plan:** [See Phase 1 Details](#phase-1-core-authorization-loop-detailed)

#### Quick Overview

- [x] **Loop Phase 1:** Server initialization (100%)
- [x] **Loop Phase 2:** Server validation (100%)
- [x] **Loop Phase 3:** Server mutations (100%)
- [x] **Loop Phase 4:** DO cold start (100%)
- [x] **Loop Phase 5:** Server catch-up (100%)
- [ ] **Client SDK:** Browser package (0%)
- [ ] **KuzuDB WASM:** Browser integration (0%)
- [ ] **Authorization Queries:** <1ms checks (0%)
- [ ] **Optimistic Updates:** Client-side mutations (0%)
- [ ] **Client Catch-Up:** Reconnection sync (0%)

**Next Actions:**

1. [ ] Create `/client/sdk/` package structure
2. [ ] Research KuzuDB WASM browser initialization
3. [ ] Implement CSV loading in browser
4. [ ] Port authorization queries to Cypher
5. [ ] Build WebSocket connection manager

---

### 🔨 Phase 2: Schema Infrastructure (18% - STARTED)

**Status:** 18% Complete  
**Estimated Duration:** 8-12 weeks  
**Target:** Enable customer self-service schema management (2-3 min vs 2-4 hours)

**Detailed Plan:** [See Phase 2 Details](#phase-2-schema-infrastructure-detailed)

#### Quick Overview

- [x] **Schema Format:** YAML + JSON Schema (90%)
- [ ] **Schema Compiler:** Generate TypeScript artifacts (0%)
- [ ] **Hot Reload:** Runtime schema updates (0%)
- [ ] **Customer Admin UI:** Schema editor web + Tauri (0%)
- [ ] **Relish Admin UI:** Tenant management (0%)

**Next Actions:**

1. [ ] Complete schema validation rules
2. [ ] Build schema compiler (YAML → TypeScript)
3. [ ] Implement hot reload system
4. [ ] Create Customer Admin UI (web version)
5. [ ] Create Relish Admin UI

**🐕 Dogfooding:** Both admin UIs use Relish authorization internally

---

### 🔑 Phase 3: Authentication Integration (0% - NOT STARTED)

**Status:** 0% Complete  
**Estimated Duration:** 2-3 weeks  
**Target:** Integrate Auth.js for user authentication

**Detailed Plan:** [See Phase 3 Details](#phase-3-authentication-integration-detailed)

#### Quick Overview

- [ ] **Auth.js Setup:** OAuth providers + D1 adapter (0%)
- [ ] **User Sync:** Auth → Relish graph (0%)
- [ ] **Middleware:** Combined auth + authz (0%)

**Dependencies:**

- Core Authorization Loop (Phase 1) must be 100%
- Customer Admin UI (Phase 2) recommended

**Next Actions:**

1. [ ] Install Auth.js + D1 adapter
2. [ ] Configure OAuth providers
3. [ ] Create auth endpoints in Worker
4. [ ] Build user sync service
5. [ ] Create combined middleware

---

### 🎨 Phase 4: Demo Applications (0% - NOT STARTED)

**Status:** 0% Complete  
**Estimated Duration:** 3-4 weeks  
**Target:** Showcase Relish authorization in real-world apps

**Detailed Plan:** [See Phase 4 Details](#phase-4-demo-applications-detailed)

#### Quick Overview

- [ ] **Document Management:** Web + Tauri, OpenAPI endpoints (0%)
- [ ] **Multi-Tenant SaaS:** Cross-org sharing (0%)
- [ ] **Healthcare Records:** HIPAA compliance demo (0%)

**Dependencies:**

- Core Authorization Loop (Phase 1) must be 100%
- Auth.js Integration (Phase 3) must be 100%

**Next Actions:**

1. [ ] Build document management system (web version)
2. [ ] Add OpenAPI specification
3. [ ] Create Tauri desktop version
4. [ ] Build multi-tenant SaaS example
5. [ ] Create healthcare records demo

---

### 🚀 Phase 5: Production Readiness (0% - NOT STARTED)

**Status:** 0% Complete  
**Estimated Duration:** 7-10 weeks  
**Target:** Production-grade operations, monitoring, CI/CD

**Detailed Plan:** [See Phase 5 Details](#phase-5-production-readiness-detailed)

#### Quick Overview

- [ ] **CI/CD Pipeline:** GitHub Actions, Pulumi automation (0%)
- [ ] **Monitoring:** Cloudflare Analytics, custom metrics (0%)
- [ ] **Load Testing:** k6 scenarios, bottleneck identification (0%)
- [ ] **Error Handling:** Retry logic, circuit breakers (0%)

**Dependencies:**

- Core Authorization Loop (Phase 1) must be 100%
- Schema Infrastructure (Phase 2) must be 80%+

**Next Actions:**

1. [ ] Setup GitHub Actions workflows
2. [ ] Configure Cloudflare Analytics
3. [ ] Write k6 load test scripts
4. [ ] Implement client-side retry logic
5. [ ] Add monitoring dashboards

---

### ✨ Phase 6: Advanced Features (0% - NOT STARTED)

**Status:** 0% Complete  
**Estimated Duration:** 10+ weeks  
**Target:** Nice-to-have enhancements

**Detailed Plan:** [See Phase 6 Details](#phase-6-advanced-features-detailed)

#### Quick Overview

- [ ] **Multi-Tenancy:** Per-org schema customization (0%)
- [ ] **Audit & Compliance:** SOC 2, GDPR, HIPAA reports (0%)
- [ ] **Advanced Queries:** Temporal queries, what-if analysis (0%)

**Dependencies:**

- Production Readiness (Phase 5) must be 100%

**Next Actions:**

1. [ ] Design per-org schema customization
2. [ ] Build audit log export
3. [ ] Implement temporal queries

---

## 🎯 Key Metrics & Success Criteria

### Performance Targets

| Metric                     | Target     | Current   | Status     |
| -------------------------- | ---------- | --------- | ---------- |
| Client authorization check | <1ms (p95) | N/A       | ⏳ Phase 1 |
| Server validation          | <10ms      | 2-10ms    | ✅         |
| Cold start (DO)            | <500ms     | ~200ms    | ✅         |
| WebSocket sync             | <50ms      | 10-50ms   | ✅         |
| CSV load + parse           | <300ms     | ~150ms    | ✅         |
| Time to add entity         | <5min      | 2-4 hours | ⏳ Phase 2 |

### Production Readiness

| Metric         | Target          | Status      |
| -------------- | --------------- | ----------- |
| Test coverage  | >80%            | ✅ 35 tests |
| Error rate     | <1%             | ⏳ Phase 5  |
| Load capacity  | 100K users      | ⏳ Phase 5  |
| CI/CD pipeline | Automated       | ⏳ Phase 5  |
| Monitoring     | Live dashboards | ⏳ Phase 5  |

---

## 📅 Timeline

| Phase                          | Duration  | Status      | Target Completion |
| ------------------------------ | --------- | ----------- | ----------------- |
| Phase 0: Foundation            | 2 weeks   | ✅ Complete | Dec 2025          |
| Phase 1: Core Loop             | 4 weeks   | 🟡 52%      | Jan 2026          |
| Phase 2: Schema Infrastructure | 12 weeks  | 🟠 18%      | Apr 2026          |
| Phase 3: Auth Integration      | 3 weeks   | ⏳ 0%       | May 2026          |
| Phase 4: Demo Apps             | 4 weeks   | ⏳ 0%       | Jun 2026          |
| Phase 5: Production            | 10 weeks  | ⏳ 0%       | Aug 2026          |
| Phase 6: Advanced              | 10+ weeks | ⏳ 0%       | Nov 2026+         |

**Total:** 43+ weeks (10+ months from start)

---

## 📋 Phase Details

For comprehensive implementation details, task breakdowns, code examples, and acceptance criteria, see the individual phase documents:

### Phase-Specific Documentation

- **[Phase 1: Core Authorization Loop](../details/PHASE_1_CLIENT_SDK.md)** - Client SDK implementation with KuzuDB WASM
- **[Phase 2: Schema Infrastructure](../details/PHASE_2_SCHEMA_INFRASTRUCTURE.md)** - Schema compiler, hot reload, admin UIs
- **Phase 3: Authentication Integration** _(coming soon)_
- **Phase 4: Demo Applications** _(coming soon)_
- **Phase 5: Production Readiness** _(coming soon)_
- **Phase 6: Advanced Features** _(coming soon)_

---

## 🚀 Getting Started

### For Development Sessions

1. **Check current phase** in Progress Overview above
2. **Open relevant detail document** (e.g., [Phase 1 Details](../details/PHASE_1_CLIENT_SDK.md))
3. **Find next unchecked task** in detail doc
4. **Implement with TDD approach** (see [TDD_SUCCESS.md](../TDD_SUCCESS.md))
5. **Update checkboxes** in detail doc as you complete tasks
6. **Update progress percentages** in this master plan

### For Quick Status Checks

- **Overall progress:** See Progress Overview table above
- **Current focus:** See "Current Focus" section at top
- **Blockers:** Check Dependencies in each phase summary
- **Metrics:** See Key Metrics section

### For Project Planning

- **Timeline:** See Timeline table
- **Phase summaries:** Quick overview in Phase Summaries section
- **Detailed plans:** Full task breakdowns in detail documents
- **Success criteria:** Performance and functionality targets in each phase

---

## 📚 Supporting Documentation

### Core Architecture

- **[PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md)** - High-level overview with architecture diagrams
- **[ARCHITECTURE.md](../ARCHITECTURE.md)** - Complete technical architecture (2331 lines)

### Development

- **[TDD_SUCCESS.md](../TDD_SUCCESS.md)** - Test-driven development approach, 35 passing tests
- **[AUTH_JS_CF_AUTH_MIGRATION.md](AUTH_JS_CF_AUTH_MIGRATION.md)** - Auth.js integration guide

### Archive

- **[archive/]()** - Historical completion documents from Phase 0

---

## 🎓 Learning Resources

### Technology Stack

- [KuzuDB Documentation](https://kuzudb.github.io/docs) - Graph database (WASM & server)
- [Cloudflare Workers](https://developers.cloudflare.com/workers) - Edge computing platform
- [Durable Objects](https://developers.cloudflare.com/durable-objects) - Stateful coordination
- [Auth.js Documentation](https://authjs.dev) - Authentication framework
- [Pulumi Documentation](https://www.pulumi.com/docs) - Infrastructure as Code

### API Standards

- [OpenAPI Specification](https://swagger.io/specification/) - REST API documentation
- [WebSocket Protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) - Real-time communication

---

## 📝 Documentation Philosophy

### Two-Level Structure

**High-Level (this document):**

- Quick status overview
- Phase summaries with key goals
- Progress tracking
- Links to detailed plans
- **Audience:** Quick reference, status checks, getting up to speed

**Low-Level (detail documents):**

- Complete task breakdowns
- Code examples and file structures
- Week-by-week implementation guides
- Acceptance criteria
- **Audience:** Active development sessions, comprehensive implementation

### Why This Structure?

1. **Context Management:** Copilot gets only relevant context for current work
2. **Progress Tracking:** Clear checkboxes at both levels
3. **Onboarding:** Quick overview without information overload
4. **Focus:** Detail docs keep sessions focused on one phase
5. **Modularity:** Easy to update individual phases independently

---

## ✅ Phase 0 Foundation Details (Archived)

**Reference:** [Phase 1 Week 1](PHASE_1_WEEK_1_COMPLETION.md), [Phase 1 Week 2](PHASE_1_WEEK_2_COMPLETION.md)

<details>
<summary>Click to expand Phase 0 details</summary

**Goal:** Build server-side authorization foundation with Pulumi infrastructure

### Completed Components

#### 1.1 Client SDK Package (Week 1)

**Tasks:**

- [ ] Create `/client/sdk/` directory structure
  - [ ] `package.json` with dependencies (KuzuDB WASM, WebSocket client)
  - [ ] `tsconfig.json` for TypeScript configuration
  - [ ] `rollup.config.js` for bundle generation
- [ ] Define SDK API surface
  - [ ] `AuthClient` class with initialization
  - [ ] `canUserRead(userId, resourceId)` → Promise<boolean>
  - [ ] `canUserWrite(userId, resourceId)` → Promise<boolean>
  - [ ] `grantPermission(mutation)` → Promise<void>
- [ ] Setup testing infrastructure
  - [ ] Jest configuration
  - [ ] Mock WASM for unit tests

**Files to Create:**

```
/client/sdk/
  package.json
  tsconfig.json
  rollup.config.js
  src/
    index.ts              # Main export
    auth-client.ts        # AuthClient class
    types.ts              # TypeScript types
  tests/
    auth-client.test.ts   # Unit tests
```

**Deliverable:** NPM package ready for import

#### 1.2 KuzuDB WASM Integration (Week 1-2)

**Tasks:**

- [ ] Research KuzuDB WASM browser compatibility
  - [ ] Test WASM initialization in browser
  - [ ] Measure memory usage with 10K/100K/1M nodes
  - [ ] Benchmark query performance
- [ ] Create WASM wrapper (`kuzu-client.ts`)
  - [ ] Initialize KuzuDB database
  - [ ] Create schema (User, Group, Resource nodes)
  - [ ] Create relationships (member_of, inherits_from, permissions)
  - [ ] Index creation for fast lookups
- [ ] CSV loading into WASM
  - [ ] Parse CSV files in browser
  - [ ] Bulk insert into KuzuDB
  - [ ] Validate data integrity

**Files to Create:**

```
/client/sdk/src/
  kuzu-client.ts        # WASM wrapper
  csv-loader.ts         # CSV parsing
  schema-builder.ts     # KuzuDB schema
```

**Deliverable:** Working WASM graph in browser

#### 1.3 Authorization Query API (Week 2)

**Tasks:**

- [ ] Port server authorization logic to Cypher queries
  - [ ] Transitive permission lookup
  - [ ] Group hierarchy traversal
  - [ ] Permission aggregation
- [ ] Implement query methods
  - [ ] `canUserRead()` - Check read permission
  - [ ] `canUserWrite()` - Check write permission
  - [ ] `canUserDelete()` - Check delete permission
  - [ ] `getUserPermissions()` - List all user permissions
  - [ ] `getResourceAccessors()` - List users with access
- [ ] Benchmark queries
  - [ ] Target: <1ms for authorization checks
  - [ ] Measure p50, p95, p99 latencies

**Files to Create:**

```
/client/sdk/src/
  query-engine.ts       # Cypher query execution
  auth-api.ts           # Authorization API methods
```

**Deliverable:** <1ms authorization checks working

#### 1.4 WebSocket Sync Manager (Week 2-3)

**Tasks:**

- [ ] Connection lifecycle management
  - [ ] Connect on SDK initialization
  - [ ] Heartbeat to detect disconnects
  - [ ] Automatic reconnection with exponential backoff
- [ ] Message handling
  - [ ] Parse mutation broadcasts
  - [ ] Apply to local WASM graph
  - [ ] Version tracking
- [ ] Catch-up synchronization
  - [ ] Send client version on reconnect
  - [ ] Fetch missing mutations (incremental)
  - [ ] Full reload if >100 mutations behind

**Files to Create:**

```
/client/sdk/src/
  websocket-manager.ts  # WS connection
  version-tracker.ts    # Version sync
  mutation-applier.ts   # Apply mutations
```

**Deliverable:** Real-time sync working

#### 1.5 Optimistic Updates (Week 3)

**Tasks:**

- [ ] Optimistic mutation application
  - [ ] Apply mutation to local graph immediately
  - [ ] Show UI changes instantly
  - [ ] Send to server for validation
- [ ] Rollback on failure
  - [ ] Detect rejected mutations
  - [ ] Revert local graph state
  - [ ] Show error to user
- [ ] Conflict resolution
  - [ ] Handle concurrent mutations
  - [ ] Last-write-wins strategy

**Files to Create:**

```
/client/sdk/src/
  optimistic-updater.ts # Optimistic updates
  rollback-manager.ts   # Rollback logic
```

**Deliverable:** Instant UI updates with validation

**Phase 1 Success Criteria:**

- ✅ Client SDK installable via NPM
- ✅ <1ms authorization checks in browser
- ✅ Real-time synchronization working
- ✅ Optimistic updates with rollback
- ✅ All queries < 1ms (p95)
- ✅ Example app demonstrating <1ms checks

---

### Phase 2: Schema Infrastructure (Detailed)

**Goal:** Enable customer self-service schema management

#### 2.1 Schema Validation Rules (Week 1)

**Current:** Schema format defined (90%), validation incomplete

**Tasks:**

- [ ] Complete schema validation
  - [ ] Required field enforcement
  - [ ] Type checking (string, number, boolean, reference)
  - [ ] Pattern validation (regex)
  - [ ] Entity reference validation (foreign keys)
  - [ ] Relationship cardinality enforcement
- [ ] Add validation error messages
  - [ ] Clear, actionable error descriptions
  - [ ] Line numbers for YAML errors
  - [ ] Suggest fixes

**Files to Update:**

```
schema/
  relish.schema.json    # Add validation rules
  validator.ts          # Runtime validation (to create)
```

**Deliverable:** Complete schema validation

#### 2.2 Schema Compiler (Week 1-3)

**Tasks:**

- [ ] Build TypeScript type generator
  - [ ] Interface generation from entities
  - [ ] Enum generation from entity lists
  - [ ] Type unions for relationships
- [ ] Build validator generator
  - [ ] Runtime type checking
  - [ ] Required field validation
  - [ ] Pattern matching
- [ ] Build CSV loader generator
  - [ ] Papa Parse integration
  - [ ] Bulk insert logic
  - [ ] Error handling
- [ ] Build index generator
  - [ ] CREATE INDEX statements
  - [ ] Unique constraints
  - [ ] Foreign key indexes
- [ ] Build test generator
  - [ ] Basic CRUD test templates
  - [ ] Validation test templates

**Files to Create:**

```
schema/compiler/
  src/
    index.ts              # Main compiler entry
    parsers/
      yaml-parser.ts      # YAML → AST
      validator.ts        # Schema validation
    generators/
      type-generator.ts   # TypeScript interfaces
      validator-gen.ts    # Runtime validators
      loader-gen.ts       # CSV loaders
      index-gen.ts        # Index definitions
      test-gen.ts         # Test generation
    templates/
      entity.ts.hbs       # Type template
      validator.ts.hbs    # Validator template
      loader.ts.hbs       # Loader template
  package.json
  tsconfig.json
```

**Deliverable:** Working schema compiler

#### 2.3 Hot Reload System (Week 4-5)

**Tasks:**

- [ ] Schema version tracking
  - [ ] Store schema version in DO state
  - [ ] Include in WebSocket messages
  - [ ] Client tracks schema version
- [ ] Runtime artifact loader
  - [ ] Dynamic import() of generated modules
  - [ ] Module cache invalidation
  - [ ] Error handling for bad schemas
- [ ] Index rebuilding
  - [ ] Add indexes for new entities
  - [ ] Remove indexes for deleted entities
  - [ ] Preserve data during rebuild
- [ ] Client-side schema sync
  - [ ] Detect schema version mismatch
  - [ ] Fetch new schema artifacts
  - [ ] Rebuild WASM graph with new schema
- [ ] Rollback mechanism
  - [ ] Store previous schema version
  - [ ] Auto-rollback if errors detected
  - [ ] Admin manual rollback endpoint

**API Endpoints (to add to Worker):**

```typescript
POST   /admin/schema/upload       // Upload and validate
GET    /admin/schema/versions     // List version history
POST   /admin/schema/activate/:v  // Activate version
GET    /admin/schema/current      // Get active schema
POST   /admin/schema/rollback/:v  // Rollback to version
```

**Files to Create:**

```
cloudflare/worker/src/
  admin/
    schema-manager.ts   # Schema version management
    hot-reload.ts       # Runtime reload logic
  durable-objects/
    schema-state.ts     # DO for schema versioning
```

**Deliverable:** Hot reload working

#### 2.4 Customer Admin UI - Web (Week 6-8)

**Tasks:**

- [ ] Project setup (Next.js + TypeScript)
- [ ] Visual schema editor component
  - [ ] Drag-and-drop entity builder
  - [ ] Field type picker
  - [ ] Relationship connector (React Flow)
  - [ ] Real-time validation feedback
- [ ] Field configuration forms
  - [ ] Required/optional toggle
  - [ ] Unique constraint checkbox
  - [ ] Index configuration
  - [ ] Validation rules (regex, min/max)
- [ ] Code preview pane
  - [ ] Monaco Editor integration
  - [ ] Live TypeScript preview
  - [ ] CSV schema preview
- [ ] Version management
  - [ ] Schema version history table
  - [ ] Diff viewer (compare versions)
  - [ ] Rollback button
  - [ ] Export schema as YAML
- [ ] Deployment
  - [ ] "Save & Reload" button
  - [ ] "Save as Draft" (don't activate)
  - [ ] Progress indicator

**🐕 Dogfooding:** UI uses Relish authorization

```yaml
# Permission Schema
tenant:admin → User        # Full schema edit access
tenant:viewer → User       # Read-only access

schema:view → tenant:viewer
schema:edit → tenant:admin
schema:publish → tenant:admin
schema:rollback → tenant:admin
```

**Files to Create:**

```
customer-admin-ui/web/
  src/
    app/
      page.tsx              # Dashboard
      schema/
        editor/page.tsx     # Visual editor
        versions/page.tsx   # Version history
        preview/page.tsx    # Code preview
    components/
      SchemaEditor.tsx      # Main editor
      EntityNode.tsx        # Entity card
      RelationshipEdge.tsx  # Relationship line
      FieldConfig.tsx       # Field form
      CodePreview.tsx       # Monaco wrapper
    lib/
      api-client.ts         # Admin API client
      schema-validator.ts   # Client-side validation
  package.json
  next.config.js
```

**Deliverable:** Working web UI

#### 2.5 Customer Admin UI - Tauri (Week 9-10)

**Tasks:**

- [ ] Tauri project setup
- [ ] Reuse React components from web version
- [ ] Native menu integration (File, Edit, View)
- [ ] Local file system access (import/export schemas)
- [ ] Offline mode with local SQLite cache
- [ ] Auto-update configuration
- [ ] Code signing for macOS/Windows
- [ ] Build for all platforms (macOS, Windows, Linux)

**Files to Create:**

```
customer-admin-ui/tauri/
  src-tauri/
    src/
      main.rs           # Tauri Rust backend
      commands.rs       # Custom commands
      menu.rs           # Native menu
    tauri.conf.json   # Tauri configuration
    Cargo.toml        # Rust dependencies
  src/                # Symlink to ../web/src
  package.json
```

**Deliverable:** Desktop app for macOS/Windows/Linux

#### 2.6 Relish Admin UI (Week 11-12)

**Tasks:**

- [ ] Project setup (Next.js + TypeScript)
- [ ] Tenant list view with search/filter
- [ ] Tenant creation wizard
- [ ] Tenant detail page (metrics, users, permissions)
- [ ] Usage metrics dashboard (Recharts)
- [ ] System health monitoring
- [ ] Tenant suspend/resume actions
- [ ] Internal authentication
- [ ] Deploy to Cloudflare Pages (via Pulumi)

**🐕 Dogfooding:** UI uses Relish authorization

```yaml
# Permission Schema
relish:operator → User       # Read-only
relish:admin → User          # Manage tenants
relish:superadmin → User     # Full access

tenant:view → relish:operator
tenant:create → relish:admin
tenant:suspend → relish:admin
tenant:delete → relish:superadmin
metrics:view → relish:operator
```

**Files to Create:**

```
relish-admin-ui/
  src/
    app/
      page.tsx          # Tenant list
      tenants/
        [id]/page.tsx   # Tenant details
        new/page.tsx    # Create tenant
      metrics/page.tsx  # System metrics
      health/page.tsx   # Health dashboard
    components/
      TenantList.tsx    # Tenant table
      TenantCard.tsx    # Tenant summary
      MetricsChart.tsx  # Usage charts
      HealthIndicator.tsx # Health status
    lib/
      internal-api.ts   # Internal API client
  package.json
  next.config.js
```

**Deliverable:** SaaS operator dashboard

**Phase 2 Success Criteria:**

- ✅ Schema compiler working (YAML → TypeScript)
- ✅ Hot reload system operational
- ✅ Customer Admin UI deployed (web + Tauri)
- ✅ Relish Admin UI deployed
- ✅ Time to add entity: 2-3 minutes (vs 2-4 hours before)
- ✅ Both UIs use Relish authorization (dogfooding)

---

### Phase 3: Authentication Integration (Detailed)

**Goal:** Integrate Auth.js for user authentication

#### 3.1 Auth.js Setup (Week 1)

**Tasks:**

- [ ] Install dependencies
  - [ ] `npm install next-auth @auth/d1-adapter`
- [ ] Configure OAuth providers
  - [ ] Google OAuth
  - [ ] GitHub OAuth
  - [ ] Microsoft OAuth (optional)
- [ ] Setup D1 database for auth tables
  - [ ] Create `relish-auth` D1 database
  - [ ] Add binding to `wrangler.toml`
- [ ] Create auth endpoints in Worker
  - [ ] `/auth/signin`
  - [ ] `/auth/signout`
  - [ ] `/auth/callback/:provider`
  - [ ] `/auth/session`
- [ ] Implement session management
  - [ ] JWT session tokens
  - [ ] Secure cookie configuration

**Files to Create:**

```
cloudflare/worker/src/
  auth/
    auth.ts             # Auth.js configuration
    middleware.ts       # Auth middleware
  routes/
    auth-routes.ts      # Auth endpoints
```

**Environment Variables:**

```bash
AUTH_SECRET="..."
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
AUTH_GITHUB_ID="..."
AUTH_GITHUB_SECRET="..."
```

**Deliverable:** Working authentication

#### 3.2 User Sync to Authorization Graph (Week 1-2)

**Tasks:**

- [ ] Create user sync service
  - [ ] Sync authenticated users to Relish graph
  - [ ] Automatic sync on first login
  - [ ] User profile updates propagation
  - [ ] User deletion handling
- [ ] Add user to authorization graph
  - [ ] Create User node in DO
  - [ ] Assign default group membership
  - [ ] Grant initial permissions

**Flow:**

```typescript
// After Auth.js authenticates user
const session = await auth.api.getSession({ headers });
const userId = `user:${session.user.id}`;

// Sync to Relish graph
await syncUserToGraph({
  id: userId,
  name: session.user.name,
  email: session.user.email,
});

// Now user can be granted permissions
await authClient.grantPermission({
  user: userId,
  resource: "resource:docs",
  permission: "read",
});
```

**Files to Create:**

```
cloudflare/worker/src/
  auth/
    user-sync.ts        # Sync users to graph
```

**Deliverable:** Authenticated users in authorization graph

#### 3.3 Combined Auth + Authz Middleware (Week 2)

**Tasks:**

- [ ] Create `requireAuth()` middleware
  - [ ] Check Auth.js session
  - [ ] Return 401 if not authenticated
- [ ] Create `requirePermission()` middleware
  - [ ] Check Relish authorization
  - [ ] Return 403 if not authorized
- [ ] Create combined middleware helper
  - [ ] `requireAuthAndPermission(permission)`
- [ ] Error handling
  - [ ] 401 Unauthorized (not logged in)
  - [ ] 403 Forbidden (no permission)

**Example Usage:**

```typescript
// Protected endpoint
app.get(
  "/api/documents/:id",
  requireAuth(), // Auth.js: Must be logged in
  requirePermission("read"), // Relish: Must have read permission
  async (c) => {
    const doc = await getDocument(c.req.param("id"));
    return c.json(doc);
  }
);
```

**Files to Create:**

```
cloudflare/worker/src/
  middleware/
    require-auth.ts         # Auth middleware
    require-permission.ts   # Authz middleware
    combined.ts             # Combined helper
```

**Deliverable:** Protected API endpoints

**Phase 3 Success Criteria:**

- ✅ OAuth login working (Google, GitHub)
- ✅ User sessions managed
- ✅ Authenticated users synced to Relish graph
- ✅ Combined auth + authz middleware working
- ✅ Example protected endpoints

---

### Phase 4: Demo Applications (Detailed)

**Goal:** Showcase Relish authorization in real-world applications

#### 4.1 Document Management System (Week 1-2)

**Features:**

- User authentication (Auth.js)
- Document CRUD (create, read, update, delete)
- Folder hierarchy with inherited permissions
- Share documents with users/groups
- Real-time collaboration (multiple users editing)
- Permission levels: owner, editor, commenter, viewer
- Audit log (who accessed what, when)

**OpenAPI REST Endpoints:**

```yaml
# Documents
GET    /api/documents                # List (filtered by read permission)
POST   /api/documents                # Create (checks create permission)
GET    /api/documents/:id            # Get (checks read permission)
PATCH  /api/documents/:id            # Update (checks write permission)
DELETE /api/documents/:id            # Delete (checks delete permission)

# Folders
GET    /api/folders                  # List (filtered by read permission)
POST   /api/folders                  # Create (checks create permission)
GET    /api/folders/:id/documents    # List (inherited permissions)

# Sharing
POST   /api/documents/:id/share      # Share (checks owner permission)
DELETE /api/documents/:id/share/:userId  # Revoke (checks owner permission)
GET    /api/documents/:id/permissions    # List who has access

# Collaboration
WS     /api/documents/:id/collaborate    # WebSocket for real-time editing
GET    /api/documents/:id/activity       # Audit log
```

**Web Version Tasks:**

- [ ] Next.js project setup
- [ ] Document list view
- [ ] Document editor (rich text)
- [ ] Folder tree view
- [ ] Share dialog
- [ ] Real-time collaboration (WebSocket)
- [ ] Audit log viewer
- [ ] OpenAPI spec (`openapi.yaml`)
- [ ] Swagger UI at `/api/docs`

**Tauri Version Tasks:**

- [ ] Tauri project setup
- [ ] Reuse React components
- [ ] Local document storage (SQLite)
- [ ] Offline mode with sync
- [ ] Native file system integration
- [ ] Desktop notifications

**Files to Create:**

```
examples/document-management/
  web/
    src/
      app/
        api/              # OpenAPI REST endpoints
          documents/route.ts
          folders/route.ts
        documents/
          page.tsx        # Document list
          [id]/page.tsx   # Document editor
        folders/[id]/page.tsx
      components/
        DocumentList.tsx
        DocumentEditor.tsx
        ShareDialog.tsx
        PermissionBadge.tsx
      lib/
        relish-client.ts  # Relish SDK instance
        auth-middleware.ts
    openapi.yaml          # OpenAPI 3.0 spec
    package.json

  tauri/
    src-tauri/src/
      main.rs
      db.rs               # Local SQLite
      sync.rs             # Sync with server
    src/                  # Shared with web
    package.json

  README.md               # Setup instructions
  DEMO.md                 # Demo script
```

**Deliverable:** Full-featured document management demo

#### 4.2 Multi-Tenant SaaS App (Week 3)

**Features:**

- Multiple organizations (tenants)
- Per-org resource isolation
- Cross-org sharing (optional)
- Org admin role (can manage org users)
- Billing/usage dashboard per org

**OpenAPI REST Endpoints:**

```yaml
# Organizations
GET    /api/orgs                     # List user's orgs
POST   /api/orgs                     # Create org
GET    /api/orgs/:id                 # Get org details

# Org Members
GET    /api/orgs/:id/members         # List members
POST   /api/orgs/:id/members         # Add member
DELETE /api/orgs/:id/members/:userId # Remove member

# Org Resources
GET    /api/orgs/:id/resources       # List resources
POST   /api/orgs/:id/resources       # Create resource

# Cross-Org Sharing
POST   /api/resources/:id/share-external  # Share with another org
GET    /api/resources/shared-with-me      # Resources shared from other orgs
```

**Tasks:**

- [ ] Org switcher component
- [ ] Org member management
- [ ] Cross-org sharing UI
- [ ] Usage dashboard
- [ ] Billing integration (mock)

**Files to Create:**

```
examples/multi-tenant-saas/
  src/
    app/api/
      orgs/route.ts
      orgs/[id]/members/route.ts
      orgs/[id]/resources/route.ts
    components/
      OrgSwitcher.tsx
      MemberList.tsx
  openapi.yaml
  README.md
```

**Deliverable:** Multi-tenant SaaS demo

#### 4.3 Healthcare Records System (Week 4)

**Features:**

- Patient records with strict access control
- Doctor/nurse role-based access
- Temporary access grants (e.g., on-call doctor)
- Break-glass emergency access (with audit)
- Complete audit trail (HIPAA compliance)

**OpenAPI REST Endpoints:**

```yaml
# Patient Records
GET    /api/patients                 # List patients
GET    /api/patients/:id/records     # Get records
POST   /api/patients/:id/records     # Add record

# Emergency Access
POST   /api/emergency-access/:patientId  # Break-glass access

# Audit
GET    /api/audit/patient/:id        # Patient access log
GET    /api/audit/user/:id           # User activity log
```

**Tasks:**

- [ ] Patient list view
- [ ] Medical record viewer
- [ ] Emergency access dialog
- [ ] Audit log viewer
- [ ] Role-based dashboards

**Files to Create:**

```
examples/healthcare-records/
  web/src/app/api/
    patients/route.ts
    emergency-access/route.ts
    audit/route.ts
  tauri/src-tauri/src/
    main.rs
  openapi.yaml
  README.md
```

**Deliverable:** Healthcare demo with HIPAA compliance

**Phase 4 Success Criteria:**

- ✅ Document management system working (web + Tauri)
- ✅ Multi-tenant SaaS demo working
- ✅ Healthcare records demo working
- ✅ All OpenAPI specs complete
- ✅ Swagger UI hosted for each demo
- ✅ Demo scripts for presentations

---

### Phase 5: Production Readiness (Detailed)

**Goal:** Production-grade operations

#### 5.1 CI/CD Pipeline (Week 1-2)

**Tasks:**

- [ ] GitHub Actions workflows
  - [ ] Run tests on every PR
  - [ ] Lint check (TypeScript, ESLint)
  - [ ] Type check (tsc --noEmit)
  - [ ] Security scan (npm audit)
  - [ ] **Pulumi preview on infrastructure changes**
- [ ] Automated deployment
  - [ ] **Deploy infrastructure: `pulumi up` (staging/production stacks)**
  - [ ] Deploy Worker code: `wrangler deploy`
  - [ ] Deploy to staging on merge to main
  - [ ] Deploy to production on tag/release
- [ ] Environment management
  - [ ] **Pulumi stack per environment (dev/staging/prod)**
  - [ ] Staging environment setup
  - [ ] Production environment config
  - [ ] Secret management (Pulumi encrypted config)
- [ ] Schema validation in CI
  - [ ] Validate schema.yaml on changes
  - [ ] Run schema compiler
  - [ ] Check for breaking changes
- [ ] Performance regression tests
  - [ ] Benchmark authorization checks
  - [ ] Fail if >10% slower than baseline

**Files to Create:**

```
.github/workflows/
  test.yml              # Run tests on PR
  deploy-staging.yml    # Deploy to staging
  deploy-prod.yml       # Deploy to production
  schema-check.yml      # Validate schema changes
```

**Deliverable:** Automated CI/CD

#### 5.2 Monitoring & Observability (Week 3-4)

**Tasks:**

- [ ] Cloudflare Analytics integration
- [ ] Custom metrics
  - [ ] Authorization check latency (p50, p95, p99)
  - [ ] Error rates by endpoint
  - [ ] WebSocket connection count
  - [ ] Durable Object wake count
  - [ ] CSV load times
- [ ] Health checks
  - [ ] Worker health endpoint
  - [ ] Durable Object health
  - [ ] Database connectivity
- [ ] Alerting
  - [ ] Error rate >1%
  - [ ] Latency p95 >50ms
  - [ ] WebSocket disconnects >10%
- [ ] Dashboards
  - [ ] Real-time metrics (Grafana/DataDog)
  - [ ] Authorization check heatmap
  - [ ] Error distribution

**Integration Options:**

- Cloudflare Analytics (built-in)
- Grafana + Prometheus
- DataDog
- New Relic

**Deliverable:** Complete monitoring

#### 5.3 Load Testing (Week 5-6)

**Tasks:**

- [ ] k6 load test scripts
- [ ] Test scenarios
  - [ ] 1K concurrent clients
  - [ ] 10K concurrent clients
  - [ ] 100K concurrent clients
  - [ ] Burst traffic (0 → 10K in 10s)
- [ ] Measure performance
  - [ ] Authorization check latency
  - [ ] Cold start frequency
  - [ ] WebSocket broadcast time
  - [ ] CSV load time (1MB, 10MB, 100MB)
- [ ] Identify bottlenecks
  - [ ] Worker CPU usage
  - [ ] Durable Object memory
  - [ ] R2 read latency
  - [ ] KV read latency
- [ ] Optimize hot paths
  - [ ] Cache optimization
  - [ ] Index tuning
  - [ ] Batch operations

**Files to Create:**

```
loadtests/
  scenarios/
    auth-check.js       # Authorization check load test
    mutations.js        # Mutation load test
    websocket.js        # WebSocket connection test
    cold-start.js       # Cold start measurement
  package.json
```

**Deliverable:** Performance benchmarks

#### 5.4 Error Handling & Resilience (Week 7-8)

**Tasks:**

- [ ] Client-side retry logic
  - [ ] Exponential backoff
  - [ ] Max retry attempts
  - [ ] Retry only on transient errors
- [ ] WebSocket reconnection
  - [ ] Automatic reconnect on disconnect
  - [ ] Exponential backoff
  - [ ] Version sync after reconnect
- [ ] Graceful degradation
  - [ ] Offline mode (use stale data)
  - [ ] Fallback to server validation
  - [ ] Queue mutations for later
- [ ] Better error messages
  - [ ] User-friendly messages
  - [ ] Actionable guidance
  - [ ] Error codes
- [ ] Data validation
  - [ ] CSV corruption detection
  - [ ] Schema compatibility checker
  - [ ] Migration safety checks
- [ ] Circuit breaker pattern
  - [ ] Stop calling failing services
  - [ ] Automatic recovery

**Deliverable:** Resilient system

**Phase 5 Success Criteria:**

- ✅ CI/CD pipeline operational
- ✅ Monitoring dashboards live
- ✅ Load tests passing (100K concurrent clients)
- ✅ Error handling robust
- ✅ <1% error rate
- ✅ p95 latency <50ms

---

### Phase 6: Advanced Features (Detailed)

**Goal:** Nice-to-have enhancements

#### 6.1 Multi-Tenancy Enhancements (Week 1-3)

**Tasks:**

- [ ] Per-org schema customization
  - [ ] Each org can have different entity types
  - [ ] Org-specific schema.yaml
- [ ] Cross-org authorization
  - [ ] Shared resources across orgs
  - [ ] Federated permissions
- [ ] Tenant provisioning API
  - [ ] Create new tenant
  - [ ] Delete tenant
  - [ ] Suspend/resume tenant

**Deliverable:** Advanced multi-tenancy

#### 6.2 Audit & Compliance (Week 4-6)

**Tasks:**

- [ ] Complete audit log export
  - [ ] Export as CSV/JSON
  - [ ] Date range filtering
  - [ ] User/resource filtering
- [ ] Compliance reports
  - [ ] SOC 2 audit trail
  - [ ] GDPR access logs
  - [ ] HIPAA audit requirements
- [ ] Permission history tracking
  - [ ] Who granted permission?
  - [ ] When was it granted?
  - [ ] When was it revoked?
  - [ ] Why was it changed?
- [ ] Automated access reviews
  - [ ] List all users with access to resource
  - [ ] Flag stale permissions (>90 days unused)
  - [ ] Recommend revocations

**Deliverable:** Compliance tools

#### 6.3 Advanced Query Features (Week 7-10)

**Tasks:**

- [ ] Temporal queries
  - [ ] "Did user X have access to resource Y on date Z?"
  - [ ] Point-in-time permission reconstruction
  - [ ] Time-travel debugging
- [ ] What-if analysis
  - [ ] "What would happen if I grant this permission?"
  - [ ] Simulate permission changes
  - [ ] Preview cascading effects
- [ ] Permission recommendations
  - [ ] "User X needs access to Y, suggest permissions"
  - [ ] ML-based recommendations
  - [ ] Role template suggestions
- [ ] Access path visualization
  - [ ] Show permission chain graphically
  - [ ] Highlight critical paths
  - [ ] Export as diagram

**Deliverable:** Advanced analytics

**Phase 6 Success Criteria:**

- ✅ Per-org schema customization working
- ✅ Compliance reports available
- ✅ Temporal queries working
- ✅ What-if analysis functional
- ✅ Access path visualization live

---

## 📚 Reference Documents

### Core Documentation

- **[PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md)** - High-level project overview, architecture diagrams
- **[ARCHITECTURE.md](../ARCHITECTURE.md)** - Complete technical architecture (2331 lines)
- **[TDD_SUCCESS.md](../TDD_SUCCESS.md)** - Test-driven development approach, 35 passing tests
- **[AUTH_JS_CF_AUTH_MIGRATION.md](AUTH_JS_CF_AUTH_MIGRATION.md)** - Auth.js integration guide

### Archived Documents

- [ADMIN_DASHBOARD_API_COMPLETE.md](ADMIN_DASHBOARD_API_COMPLETE.md) - Admin API completion
- [CF_AUTH_INTEGRATION.md](CF_AUTH_INTEGRATION.md) - CF auth integration
- [PHASE_1_WEEK_1_COMPLETION.md](PHASE_1_WEEK_1_COMPLETION.md) - Phase 1 Week 1
- [PHASE_1_WEEK_2_COMPLETION.md](PHASE_1_WEEK_2_COMPLETION.md) - Phase 1 Week 2
- [WEEK_2_COMPLETE_SUMMARY.md](WEEK_2_COMPLETE_SUMMARY.md) - Week 2 summary

---

## 🎯 Key Metrics & Success Criteria

### Performance Targets

| Metric                     | Target | Current | Status     |
| -------------------------- | ------ | ------- | ---------- |
| Client authorization check | <1ms   | N/A     | ⏳ Phase 1 |
| Server validation          | <10ms  | 2-10ms  | ✅         |
| Cold start (DO)            | <500ms | ~200ms  | ✅         |
| WebSocket sync             | <50ms  | 10-50ms | ✅         |
| CSV load + parse           | <300ms | ~150ms  | ✅         |

### Developer Experience Targets

| Metric                     | Target  | Current   | Status     |
| -------------------------- | ------- | --------- | ---------- |
| Time to add entity type    | <5min   | 2-4 hours | ⏳ Phase 2 |
| Test coverage              | >80%    | 35 tests  | ✅         |
| Documentation completeness | 100%    | ~95%      | ✅         |
| Time to first contribution | <1 hour | ~2 hours  | 🟡         |

### Production Readiness Targets

| Metric                | Target     | Status     |
| --------------------- | ---------- | ---------- |
| CI/CD pipeline        | Automated  | ⏳ Phase 5 |
| Monitoring dashboards | Live       | ⏳ Phase 5 |
| Error rate            | <1%        | ⏳ Phase 5 |
| Load testing          | 100K users | ⏳ Phase 5 |
| Offline capability    | Supported  | ⏳ Phase 1 |

---

## 🚀 Getting Started

### For Contributors

1. **Read Core Docs:**

   - [PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md) - Start here
   - [ARCHITECTURE.md](../ARCHITECTURE.md) - Deep dive
   - [TDD_SUCCESS.md](../TDD_SUCCESS.md) - Testing approach

2. **Pick a Phase:**

   - Phase 1 (In Progress) - Client SDK work
   - Phase 2 (Started) - Schema infrastructure
   - Phase 3+ (Not Started) - Future work

3. **Check Phase Details:**

   - Find detailed tasks above
   - Review file structure
   - Check dependencies

4. **Start Contributing:**
   - Create feature branch
   - Follow TDD approach
   - Submit PR for review

### For Project Managers

- **Track Progress:** Use phase percentages above
- **Plan Sprints:** Each phase has week-by-week breakdown
- **Monitor Metrics:** Performance and DX targets listed
- **Review Phases:** Detailed plans with deliverables

### For Stakeholders

- **Current Status:** 38% complete, Phase 1 in progress
- **Next Milestone:** Client SDK completion (Phase 1) - 3-4 weeks
- **Major Milestones:**
  - Phase 1 (4 weeks) - <1ms client authorization
  - Phase 2 (12 weeks) - Self-service schema management
  - Phase 3 (3 weeks) - Auth.js integration
  - Phase 4 (4 weeks) - Demo applications
  - Phase 5 (10 weeks) - Production readiness
  - Phase 6 (10+ weeks) - Advanced features

---

## 📅 Timeline Summary

| Phase                              | Duration  | Status      | Target Completion |
| ---------------------------------- | --------- | ----------- | ----------------- |
| **Phase 0: Foundation**            | 2 weeks   | ✅ Complete | Dec 2025          |
| **Phase 1: Core Loop**             | 4 weeks   | 🟡 52%      | Jan 2026          |
| **Phase 2: Schema Infrastructure** | 12 weeks  | 🟠 18%      | Apr 2026          |
| **Phase 3: Auth Integration**      | 3 weeks   | ⏳ 0%       | May 2026          |
| **Phase 4: Demo Apps**             | 4 weeks   | ⏳ 0%       | Jun 2026          |
| **Phase 5: Production**            | 10 weeks  | ⏳ 0%       | Aug 2026          |
| **Phase 6: Advanced**              | 10+ weeks | ⏳ 0%       | Nov 2026+         |

**Total Estimated Timeline:** 43+ weeks from start (10+ months)

---

## 🎓 Learning Resources

### Internal Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - Complete system architecture
- [TDD_SUCCESS.md](../TDD_SUCCESS.md) - Testing philosophy
- [PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md) - Project overview

### External Resources

- [KuzuDB Documentation](https://kuzudb.github.io/docs) - Graph database
- [Cloudflare Workers](https://developers.cloudflare.com/workers) - Edge computing
- [Auth.js Documentation](https://authjs.dev) - Authentication
- [Pulumi Documentation](https://www.pulumi.com/docs) - Infrastructure as Code
- [OpenAPI Specification](https://swagger.io/specification/) - API docs

---

## 📝 Contributing

See detailed tasks in phase sections above. General workflow:

1. Pick a task from current phase
2. Create feature branch
3. Implement with TDD approach
4. Write/update tests
5. Update documentation
6. Submit PR for review

**Current Phase:** Phase 1 (Core Authorization Loop) - Client SDK work

---

**Last Updated:** January 11, 2026  
**Maintained By:** Relish Team  
**Status:** Living document, updated weekly
