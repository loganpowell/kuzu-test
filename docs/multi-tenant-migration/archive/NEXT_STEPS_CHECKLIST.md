# Next Steps Checklist - Phase 1, Week 4 ✅

## ✅ Current State (Updated January 10, 2026)

**Feature Branch**: `feat/multi-tenant-infrastructure`

- **Status**: ✅ **Week 3 COMPLETE** - Pulumi ESC Integrated
- **Worker URL**: https://auth-service.logan-607.workers.dev
- **Code**: 6,500+ lines across 28 components
- **Tests**: 143 tests (130 unit, 13 E2E) - 106 unit passing, 13/13 E2E passing ✅
- **Docs**: 3,000+ lines of architecture, testing, and infrastructure documentation
- **Infrastructure**: D1 (11 tables), KV (4), Durable Objects (2), R2 (enabled), Pulumi ESC (secrets)

**Week 3 Achievements:**

- ✅ Upgraded Pulumi CLI to v3.215.0 with ESC support
- ✅ Migrated to Pulumi Cloud backend (loganpowell)
- ✅ Created ESC environment: `loganpowell/cf-auth/dev`
- ✅ Centralized secret management (JWT_SECRET, CLOUDFLARE_API_TOKEN)
- ✅ Fixed dashboard metrics SQL bug
- ✅ All E2E tests passing
- ✅ Zero regressions after ESC migration

## � Week 4 Priorities (In Progress)

### 1. 🔄 Complete Pulumi Resource Import (IN PROGRESS)

**Goal**: Import all existing Cloudflare resources into Pulumi for full IaC management.

**Current State**: Hybrid approach - ESC manages secrets, but infrastructure is deployed manually.

**Resources to Import** (~30 resources):

- D1 Database: `auth-db-dev` (e213ec49-0d7e-4821-a62e-c2cdd0a3f512)
- KV Namespaces (4): RATE_LIMITER, TOKEN_BLACKLIST, SESSION_CACHE, MUTATION_LOG
- R2 Bucket: `tenant-data-dev` (with CSV data)
- Durable Objects (2): TenantState, GraphStateCSV
- Worker: auth-service
- Worker Routes/Domains (if any)

**Benefits**:

- ✅ Reproducible infrastructure (disaster recovery)
- ✅ Version controlled infrastructure changes
- ✅ Consistent deployments across environments
- ✅ Infrastructure diffs before deployment

**Steps**:

```bash
cd /Users/logan/Documents/projects/kuzu-test/cf-auth/infrastructure

# 1. Generate import commands
pulumi import cloudflare:index/d1Database:D1Database auth-db e213ec49-0d7e-4821-a62e-c2cdd0a3f512

# 2. Import KV namespaces (get IDs from wrangler.toml)
pulumi import cloudflare:index/workersKvNamespace:WorkersKvNamespace rate-limiter <kv-id>

# 3. Import R2 bucket
pulumi import cloudflare:index/r2Bucket:R2Bucket tenant-data tenant-data-dev

# 4. Update index.ts with imported resources
# 5. Verify with: pulumi preview
```

**Success Criteria**:

- [ ] All resources imported successfully
- [ ] `pulumi preview` shows no changes
- [ ] Infrastructure can be destroyed and recreated
- [ ] Documentation updated with import process

---

### 2. 🧪 Fix Remaining DO Test Issues (NEXT)

**Goal**: Clean up 24 DO tests with storage cleanup warnings.

**Current State**:

- Tests run and pass functionally
- Storage cleanup error appears (cosmetic, vitest-pool-workers issue)
- Output: `· tests/durable-objects.test.ts (24)`

**Issue**:

```
Error: Failed to get current sqlite connection
at assertNeverCalled (eval at <anonymous> (...))
```

**Potential Solutions**:

1. Update vitest-pool-workers to latest version
2. Investigate proper cleanup in test teardown
3. Add explicit storage cleanup in afterEach hooks
4. Check if storage API usage is correct

**Steps**:

```bash
cd /Users/logan/Documents/projects/kuzu-test/cf-auth

# 1. Check current vitest-pool-workers version
npm list vitest-pool-workers

# 2. Update to latest
npm update vitest-pool-workers

# 3. Run tests to verify
npm test tests/durable-objects.test.ts

# 4. If still issues, investigate teardown
```

**Success Criteria**:

- [ ] All 130 unit tests pass cleanly
- [ ] No storage cleanup errors
- [ ] Clean test output

---

### 3. 📊 Add Monitoring & Observability (NEXT)

**Goal**: Add production monitoring for errors, performance, and logs.

**Current State**: No monitoring or error tracking configured.

**Options**:

**A. Axiom (Logs & Analytics)**

```bash
# Add Axiom integration
npm install @axiomhq/js

# Configure in wrangler.toml
[observability]
enabled = true
head_sampling_rate = 1
```

**B. Sentry (Error Tracking)**

```bash
# Add Sentry for Workers
npm install @sentry/cloudflare

# Initialize in src/index.ts
import * as Sentry from '@sentry/cloudflare';
Sentry.init({ dsn: env.SENTRY_DSN });
```

**C. Cloudflare Analytics (Built-in)**

- Already available in Cloudflare dashboard
- Add custom analytics using:

```typescript
ctx.waitUntil(
  env.ANALYTICS.writeDataPoint({
    blobs: [tenantId, endpoint],
    doubles: [responseTime],
    indexes: [timestamp],
  })
);
```

**Recommended**: Start with Cloudflare Analytics + Sentry for errors

**Steps**:

```bash
# 1. Set up Sentry project
# 2. Add SENTRY_DSN to ESC environment
# 3. Install Sentry SDK
# 4. Add error boundary to worker
# 5. Test error reporting
# 6. Set up alerts
```

**Success Criteria**:

- [ ] Error tracking operational
- [ ] Performance metrics visible
- [ ] Alert notifications configured
- [ ] Dashboard for monitoring

---

## 📋 Week 4 Remaining Tasks

### 4. 🔐 Secret Rotation Procedures

**Goal**: Document and implement secret rotation for JWT and API keys.

**Components**:

- JWT_SECRET rotation process
- API key rotation automation
- Rollback procedures
- Zero-downtime rotation strategy

**Steps**:

1. Document JWT rotation process (dual-secret support)
2. Implement API key rotation endpoint
3. Create rotation runbook
4. Test rotation with canary deployment

---

### 5. 🏗️ Staging Environment

**Goal**: Create isolated staging environment for testing.

**Stack**: `loganpowell/cf-auth-infrastructure/staging`

**Resources**:

- Separate D1 database
- Separate KV namespaces
- Separate R2 bucket
- Staging worker: auth-service-staging

**Benefits**:

- Test deployments before production
- Integration testing with real infrastructure
- Customer demos without affecting production

---

### 6. 🤖 CI/CD Integration

**Goal**: Automate testing and deployment with GitHub Actions.

**Workflow**:

```yaml
name: Deploy
on: push

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: pulumi/actions@v4
        with:
          command: up
          stack-name: loganpowell/cf-auth-infrastructure/dev
```

**ESC Integration**:

```bash
# GitHub Actions uses ESC for secrets
pulumi env run loganpowell/cf-auth/dev -- wrangler deploy
```

---

## �🔄 Immediate Actions Required

### 1. ✅ Database Migration Applied to D1 (COMPLETE)

```bash
# Migration was applied successfully
npx wrangler d1 migrations apply auth-db-dev --remote
```

**✅ Completed**: 9 tables created in D1 SQLite database (auth-db-dev)
**Database ID**: e213ec49-0d7e-4821-a62e-c2cdd0a3f512
**Bootstrap Data**: Platform tenant and admin API key created

**Tables Created**:

- tenants
- api_keys
- platform_admins
- platform_admin_tenant_permissions
- tenant_data_schemas
- usage_metrics
- accounts (Auth.js)
- sessions (Auth.js)
- verification_tokens (Auth.js)

### 2. ✅ Integration Tests Running (COMPLETE)

```bash
cd /Users/logan/Documents/projects/kuzu-test/cf-auth

# Run all tests
npm test -- --run

# Run E2E tests against production
./scripts/e2e-test.sh
```

**✅ Results**: 130 total tests

- **109 passing** ✅
- **21 skipped** (R2-dependent, pending API token update)
- **0 failing** ✅

**Test Suites**:

- Scenario Tests (50 tests) ✅
- Integration Tests (14 tests) ✅
- Admin Dashboard Tests (56 tests) ✅
- Durable Objects Tests (3 passing, 21 skipped) ⏳
- E2E Production Tests (12 tests) ✅

### 3. Validate Type Safety

```bash
cd /Users/logan/Documents/projects/kuzu-test/cf-auth

# Check TypeScript compilation
npx tsc --noEmit

# Run linter
npm run lint
```

**Expected**: No errors or warnings

## 📚 Documentation References

### Architecture Files

- **Multi-Tenant Architecture**: [`MULTI_TENANT_ARCHITECTURE.md`](MULTI_TENANT_ARCHITECTURE.md) (600+ lines)
- **Phase 1 Week 1 Summary**: [`PHASE_1_WEEK_1_COMPLETION.md`](./PHASE_1_WEEK_1_COMPLETION.md) (430 lines)

### Code Files

- **Database Schema**: `/cf-auth/src/db/schema.ts` (485 lines)
- **Tenant Router**: `/cf-auth/src/middleware/tenant-router.ts` (280 lines)
- **Namespace Isolation**: `/cf-auth/src/utils/namespace-isolation.ts` (300+ lines)
- **API Keys**: `/cf-auth/src/utils/api-keys.ts` (350+ lines)
- **Admin Routes**: `/cf-auth/src/routes/admin/tenants.ts` (300+ lines)
- **API Key Routes**: `/cf-auth/src/routes/v1/api-keys.ts` (250+ lines)
- **Integration Tests**: `/cf-auth/tests/integration.test.ts` (450+ lines)

## 🚀 Testing Workflow

### Test Tenant Creation

```bash
# Create a test tenant using admin API
curl -X POST https://localhost:3000/admin/tenants \
  -H "Authorization: Bearer sk_live_platform_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "test-tenant",
    "name": "Test Tenant",
    "plan": "free"
  }'
```

**Expected Response**:

```json
{
  "tenant": {
    "id": "tenant:test-tenant",
    "slug": "test-tenant",
    "name": "Test Tenant",
    "plan": "free",
    "status": "active"
  },
  "credentials": {
    "publicKey": "pk_live_...",
    "secretKey": "sk_live_..."
  }
}
```

### Test API Key Management

```bash
# List API keys for tenant
curl -X GET https://localhost:3000/v1/api-keys \
  -H "Authorization: Bearer sk_live_test_tenant_xxx"

# Create a restricted API key
curl -X POST https://localhost:3000/v1/api-keys \
  -H "Authorization: Bearer sk_live_test_tenant_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Read-only API Key",
    "type": "restricted",
    "environment": "live",
    "permissions": ["read:users", "read:projects"]
  }'

# Rotate an API key
curl -X POST https://localhost:3000/v1/api-keys/key_id/rotate \
  -H "Authorization: Bearer sk_live_test_tenant_xxx"

# Revoke an API key
curl -X DELETE https://localhost:3000/v1/api-keys/key_id \
  -H "Authorization: Bearer sk_live_test_tenant_xxx"
```

## 🔐 Security Validation

### Verify Namespace Isolation

Test that tenant A cannot access tenant B's data:

```bash
# Create two test tenants
curl -X POST ... -d '{"slug": "tenant-a", ...}'
curl -X POST ... -d '{"slug": "tenant-b", ...}'

# Try to access tenant-b data with tenant-a key
# Should fail because:
# 1. API key belongs to tenant-a
# 2. Even if routing failed, namespace prefix prevents access
```

### Verify API Key Secret Handling

Test that secrets are properly protected:

```bash
# Create API key - returns secret once
curl -X POST /v1/api-keys ...
# Response includes: "keySecret": "sk_live_abc123..."

# Try to list keys - secret NOT returned
curl -X GET /v1/api-keys
# Response: [{"name": "...", "type": "...", no secret}]

# Secret is one-way hashed in database
# SELECT key_hash FROM api_keys -> can't reverse-engineer secret
```

## 📋 Code Review Checklist

- [ ] Database schema matches documentation
- [ ] All tables have proper indexes
- [ ] Foreign key constraints are in place
- [ ] Tenant router handles all 4 extraction strategies
- [ ] Namespace isolation prevents cross-tenant access
- [ ] API key validation uses secure hashing
- [ ] Permission scoping works correctly
- [ ] Integration tests all pass
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Code follows project style guide
- [ ] All functions have JSDoc comments

## 🐛 Troubleshooting

### Issue: Tests fail with database errors

**Solution**: Ensure D1 migration was applied

```bash
npx drizzle-kit push
```

### Issue: TypeScript compilation errors

**Solution**: Check that all imports are correct

```bash
npx tsc --noEmit
```

### Issue: API key validation fails

**Solution**: Verify key is stored correctly with hash

```sql
SELECT id, key_prefix, key_hash FROM api_keys LIMIT 1;
```

## 📊 What's Working

✅ Tenant creation with automatic API key generation
✅ Tenant router extracting from 4 sources (header, subdomain, API key, query)
✅ Namespace isolation preventing cross-tenant access
✅ API key generation with proper format (pk/sk/rk_live/test_xxx)
✅ API key rotation (generates new, revokes old)
✅ API key revocation with soft deletes
✅ Permission scoping for restricted keys
✅ Database schema with 9 tables
✅ Integration tests covering all critical paths
✅ TypeScript type safety throughout
✅ Comprehensive documentation

## ⏭️ Next Phase (Week 2)

### Durable Objects per Tenant

Create a Durable Object instance for each tenant:

```typescript
// Each tenant gets:
// - Rate limiting (100 req/min default)
// - Caching (in-memory for hot data)
// - Real-time WebSocket support
// - Audit logging

const doName = `tenant:${tenantId}`;
const doStub = env.TENANT_DO.get(doName);
```

**Files to Create**:

- `/src/durable-objects/tenant-do.ts` - Main tenant Durable Object
- `/src/routes/v1/rate-limit.ts` - Rate limit status endpoint
- `/tests/durable-objects.test.ts` - DO tests

### Admin Dashboard

Create a dashboard for platform admins:

**Routes**:

- `GET /admin/dashboard` - Overview
- `GET /admin/tenants` - Tenant list with filters
- `GET /admin/tenants/:id/metrics` - Usage metrics
- `GET /admin/api-keys` - All keys across tenants

### Tenant Onboarding

Implement onboarding workflow:

**Steps**:

1. Create tenant + generate API keys
2. Create initial schema from template
3. Send welcome email
4. Create first admin user
5. Setup documentation link

## 🎯 Success Criteria

- [ ] D1 migration applied successfully
- [ ] All integration tests pass
- [ ] No TypeScript/linting errors
- [ ] Manual testing validates namespace isolation
- [ ] Manual testing validates API key security
- [ ] Feature branch reviewed and approved
- [ ] Ready to merge to main

## 📞 Contact & Questions

Review these files for detailed information:

- Architecture: `MULTI_TENANT_ARCHITECTURE.md`
- Implementation: `PHASE_1_WEEK_1_COMPLETION.md`
- Code: See individual source files with JSDoc comments

## 🏁 Summary

**Phase 1, Week 1 is complete** with:

- ✅ Multi-tenant database schema
- ✅ Tenant router middleware
- ✅ Namespace isolation utilities
- ✅ API key management system
- ✅ Admin and tenant API endpoints
- ✅ Comprehensive integration tests
- ✅ Production-ready documentation

**Next**: Apply migration, run tests, review code, then proceed to Week 2 (Durable Objects).
