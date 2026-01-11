# Phase 3: Authentication Integration

**Status:** 0% Complete  
**Estimated Duration:** 2-3 weeks  
**Target:** Integrate Auth.js for user authentication

> **Parent Plan:** [MASTER_PLAN.md](../MASTER_PLAN.md)  
> **Related:** [PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md)

---

## 📊 Phase Overview

### Goal

Integrate Auth.js authentication framework with Relish authorization system, syncing authenticated users to the authorization graph and providing combined auth + authz middleware.

### Current Progress

| Component           | Progress | Status             |
| ------------------- | -------- | ------------------ |
| Auth.js Setup       | 0%       | ⏳ Not Started     |
| User Sync to Graph  | 0%       | ⏳ Not Started     |
| Combined Middleware | 0%       | ⏳ Not Started     |
| **Overall**         | **0%**   | **⏳ Not Started** |

### Dependencies

- ✅ Phase 0: Server foundation (Complete)
- ⏳ Phase 1: Client SDK (Must be 100%)
- 🟡 Phase 2: Customer Admin UI (Recommended, not required)

---

## 📋 Implementation Tasks

### 3.1 Auth.js Setup (Week 1)

**Goal:** Configure Auth.js with OAuth providers and D1 adapter

#### Tasks

- [ ] **Install Dependencies**

  - [ ] `npm install next-auth @auth/d1-adapter`
  - [ ] Update Worker dependencies

- [ ] **Configure OAuth Providers**

  - [ ] Google OAuth
    - Register app in Google Console
    - Get client ID and secret
  - [ ] GitHub OAuth
    - Register OAuth app in GitHub
    - Get client ID and secret
  - [ ] Microsoft OAuth (optional)
    - Register app in Azure AD

- [ ] **D1 Database Setup**

  - [ ] Create `relish-auth` D1 database (via Pulumi)
  - [ ] Add binding to `wrangler.toml`
  - [ ] Run Auth.js migrations
  - [ ] Verify tables created

- [ ] **Auth Endpoints in Worker**

  - [ ] `/auth/signin` - Initiate OAuth flow
  - [ ] `/auth/signout` - Clear session
  - [ ] `/auth/callback/:provider` - OAuth callback
  - [ ] `/auth/session` - Get current session

- [ ] **Session Management**
  - [ ] JWT session tokens
  - [ ] Secure cookie configuration
  - [ ] Session expiry (7 days default)
  - [ ] Refresh token rotation

#### File Structure

```
cloudflare/worker/src/
  auth/
    auth.ts             # Auth.js configuration
    middleware.ts       # Auth middleware
    providers/
      google.ts         # Google OAuth config
      github.ts         # GitHub OAuth config
  routes/
    auth-routes.ts      # Auth endpoints
```

#### Environment Variables

```bash
# Add to .env and Pulumi secrets
AUTH_SECRET="..." # Generate: openssl rand -base64 32
AUTH_URL="https://your-app.com"

# Google OAuth
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."

# GitHub OAuth
AUTH_GITHUB_ID="..."
AUTH_GITHUB_SECRET="..."
```

#### Code Example

```typescript
// auth/auth.ts
import { Auth } from "@auth/core";
import { D1Adapter } from "@auth/d1-adapter";
import Google from "@auth/core/providers/google";
import GitHub from "@auth/core/providers/github";

export const auth = Auth({
  adapter: D1Adapter(env.RELISH_AUTH),
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    }),
    GitHub({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      return session;
    },
  },
});
```

#### Acceptance Criteria

- ✅ OAuth login works (Google + GitHub)
- ✅ Sessions persist across requests
- ✅ Logout clears session
- ✅ Tokens refresh automatically
- ✅ Environment variables configured securely

---

### 3.2 User Sync to Authorization Graph (Week 1-2)

**Goal:** Sync authenticated users to Relish authorization graph

#### Tasks

- [ ] **User Sync Service**

  - [ ] Create `user-sync.ts` service
  - [ ] Sync on first login
    - Create User node in graph
    - Set default properties
  - [ ] Sync on profile updates
    - Update User node properties
  - [ ] Handle user deletion
    - Mark as deleted (soft delete)
    - Remove from groups
    - Revoke all permissions

- [ ] **Add User to Authorization Graph**

  - [ ] Create User node in Durable Object
  - [ ] Assign to default group (e.g., `group:all-users`)
  - [ ] Grant initial permissions (if any)
  - [ ] Log sync event

- [ ] **Sync Triggers**
  - [ ] On OAuth sign-in callback
  - [ ] On session creation
  - [ ] On profile update
  - [ ] Webhook for user deletion (if needed)

#### File Structure

```
cloudflare/worker/src/
  auth/
    user-sync.ts        # Sync users to graph
    sync-events.ts      # Event handlers
```

#### Code Example

```typescript
// auth/user-sync.ts
export async function syncUserToGraph(
  session: Session,
  graphClient: AuthClient
) {
  const userId = `user:${session.user.id}`;

  // Check if user already exists
  const exists = await graphClient.userExists(userId);

  if (!exists) {
    // Create user node
    await graphClient.addUser({
      id: userId,
      name: session.user.name,
      email: session.user.email,
      createdAt: new Date().toISOString(),
    });

    // Add to default group
    await graphClient.addUserToGroup(userId, "group:all-users");

    // Grant default permissions (if any)
    await graphClient.grantPermission({
      user: userId,
      resource: "resource:profile",
      permission: "read",
    });

    console.log(`Synced new user: ${userId}`);
  } else {
    // Update user properties
    await graphClient.updateUser(userId, {
      name: session.user.name,
      email: session.user.email,
      lastLoginAt: new Date().toISOString(),
    });

    console.log(`Updated existing user: ${userId}`);
  }
}

// Usage in auth callback
app.get("/auth/callback/google", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.headers });

  if (session) {
    // Sync user to authorization graph
    await syncUserToGraph(session, c.env.authClient);
  }

  return c.redirect("/dashboard");
});
```

#### Acceptance Criteria

- ✅ Users synced on first login
- ✅ User properties updated on login
- ✅ Default groups assigned
- ✅ Default permissions granted
- ✅ User deletion handled
- ✅ Sync events logged

---

### 3.3 Combined Auth + Authz Middleware (Week 2)

**Goal:** Provide middleware that checks both authentication and authorization

#### Tasks

- [ ] **Auth Middleware**

  - [ ] `requireAuth()` - Check Auth.js session
  - [ ] Return 401 if not authenticated
  - [ ] Attach user to request context

- [ ] **Authz Middleware**

  - [ ] `requirePermission(permission)` - Check Relish authorization
  - [ ] Return 403 if not authorized
  - [ ] Support multiple permissions (OR logic)
  - [ ] Support role-based checks

- [ ] **Combined Middleware**

  - [ ] `requireAuthAndPermission(permission)`
  - [ ] Short-circuit if not authenticated
  - [ ] Check authorization only if authenticated

- [ ] **Error Handling**
  - [ ] 401 Unauthorized - Not logged in
  - [ ] 403 Forbidden - No permission
  - [ ] Clear error messages
  - [ ] Redirect to login page (401)
  - [ ] Show error page (403)

#### File Structure

```
cloudflare/worker/src/
  middleware/
    require-auth.ts         # Auth middleware
    require-permission.ts   # Authz middleware
    combined.ts             # Combined helper
    errors.ts               # Error responses
```

#### Code Example

```typescript
// middleware/require-auth.ts
export function requireAuth() {
  return async (c: Context, next: Next) => {
    const session = await auth.api.getSession({
      headers: c.req.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized", message: "Please log in" }, 401);
    }

    // Attach user to context
    c.set("user", session.user);
    await next();
  };
}

// middleware/require-permission.ts
export function requirePermission(permission: string) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    const resourceId = c.req.param("id");

    const hasPermission = await c.env.authClient.canUserRead(
      `user:${user.id}`,
      resourceId
    );

    if (!hasPermission) {
      return c.json(
        { error: "Forbidden", message: "You do not have permission" },
        403
      );
    }

    await next();
  };
}

// middleware/combined.ts
export function requireAuthAndPermission(permission: string) {
  return [requireAuth(), requirePermission(permission)];
}

// Usage in routes
app.get(
  "/api/documents/:id",
  ...requireAuthAndPermission("read"),
  async (c) => {
    const doc = await getDocument(c.req.param("id"));
    return c.json(doc);
  }
);

app.patch(
  "/api/documents/:id",
  ...requireAuthAndPermission("write"),
  async (c) => {
    const updates = await c.req.json();
    const doc = await updateDocument(c.req.param("id"), updates);
    return c.json(doc);
  }
);
```

#### Acceptance Criteria

- ✅ `requireAuth()` returns 401 if not logged in
- ✅ `requirePermission()` returns 403 if not authorized
- ✅ Combined middleware works correctly
- ✅ Error messages are clear
- ✅ User context attached to request
- ✅ All protected endpoints use middleware

---

## 🧪 Test-Driven Development (TDD) Approach

### TDD Workflow for Phase 3

**Authentication & Authorization integration requires security-first testing:**

1. **Write security tests first** (authentication, authorization, CSRF)
2. **Test OAuth flows** with mocked providers
3. **Test middleware chains** thoroughly
4. **Test session management** (creation, validation, expiry)
5. Mark complete **only when all security tests pass**

### Test Framework Setup

```bash
cd cloudflare/worker
npm install --save-dev vitest @vitest/ui
npm install --save-dev @cloudflare/vitest-pool-workers
```

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
```

### Task 3.1: Auth.js Setup - Test Suite

**Write these tests BEFORE implementing:**

```typescript
// tests/auth/auth-config.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createAuthConfig } from "../src/auth/config";

describe("Auth.js Configuration", () => {
  it("should create valid auth config", () => {
    const config = createAuthConfig({
      googleClientId: "test-google-id",
      googleClientSecret: "test-google-secret",
      githubClientId: "test-github-id",
      githubClientSecret: "test-github-secret",
      secret: "test-secret-key",
    });

    expect(config.providers).toHaveLength(2);
    expect(config.providers[0].id).toBe("google");
    expect(config.providers[1].id).toBe("github");
  });

  it("should throw error if required secrets missing", () => {
    expect(() => createAuthConfig({})).toThrow("Google client ID is required");
  });

  it("should configure D1 adapter correctly", () => {
    const config = createAuthConfig(validSecrets);
    expect(config.adapter).toBeDefined();
    expect(config.adapter.name).toBe("d1");
  });
});

// tests/auth/oauth-flow.test.ts
describe("OAuth Flow", () => {
  it("should redirect to Google OAuth", async () => {
    const request = new Request("http://test.com/auth/signin/google");
    const response = await handleAuthRequest(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("accounts.google.com");
  });

  it("should handle OAuth callback", async () => {
    const request = new Request(
      "http://test.com/auth/callback/google?code=test-code"
    );
    const response = await handleAuthRequest(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("Set-Cookie")).toContain(
      "next-auth.session-token"
    );
  });

  it("should handle OAuth error", async () => {
    const request = new Request(
      "http://test.com/auth/callback/google?error=access_denied"
    );
    const response = await handleAuthRequest(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/error");
  });
});
```

**✅ Task 3.1 is DONE when:** OAuth tests pass + users can log in

---

### Task 3.2: User Sync - Test Suite

**Write these tests BEFORE implementing:**

```typescript
// tests/auth/user-sync.test.ts
import { syncUserToRelish } from "../src/auth/user-sync";

describe("User Sync to Relish", () => {
  it("should create User node on first login", async () => {
    const session = {
      user: { id: "oauth-123", email: "alice@example.com", name: "Alice" },
    };

    await syncUserToRelish(session);

    // Verify user exists in graph
    const kuzu = await getKuzuClient();
    const result = await kuzu.query("MATCH (u:User {id: $id}) RETURN u", {
      id: "user:oauth-123",
    });
    expect(result).toHaveLength(1);
    expect(result[0].u.email).toBe("alice@example.com");
  });

  it("should update User node on subsequent logins", async () => {
    const session1 = {
      user: { id: "oauth-123", email: "alice@old.com", name: "Alice" },
    };
    await syncUserToRelish(session1);

    const session2 = {
      user: { id: "oauth-123", email: "alice@new.com", name: "Alice" },
    };
    await syncUserToRelish(session2);

    const kuzu = await getKuzuClient();
    const result = await kuzu.query("MATCH (u:User {id: $id}) RETURN u", {
      id: "user:oauth-123",
    });
    expect(result[0].u.email).toBe("alice@new.com");
  });

  it("should not create duplicate users", async () => {
    const session = { user: { id: "oauth-123", email: "alice@example.com" } };

    await syncUserToRelish(session);
    await syncUserToRelish(session);

    const kuzu = await getKuzuClient();
    const result = await kuzu.query("MATCH (u:User {id: $id}) RETURN u", {
      id: "user:oauth-123",
    });
    expect(result).toHaveLength(1); // Only one user
  });

  it("should propagate to connected clients via WebSocket", async () => {
    const mockWs = createMockWebSocket();
    const session = { user: { id: "oauth-123", email: "alice@example.com" } };

    await syncUserToRelish(session);

    // Verify WebSocket message sent
    const messages = mockWs.getSentMessages();
    expect(messages).toContainEqual({
      type: "mutation",
      data: expect.objectContaining({
        type: "upsert",
        entity: "User",
        id: "user:oauth-123",
      }),
    });
  });
});
```

**✅ Task 3.2 is DONE when:** User sync tests pass + no duplicates

---

### Task 3.3: Combined Middleware - Test Suite

**Write these tests BEFORE implementing:**

```typescript
// tests/middleware/auth-middleware.test.ts
import {
  requireAuth,
  requirePermission,
  requireAuthAndPermission,
} from "../src/middleware/auth";

describe("Authentication Middleware", () => {
  describe("requireAuth", () => {
    it("should pass through authenticated requests", async () => {
      const request = createAuthenticatedRequest({ userId: "user:alice" });
      const response = await testMiddleware(requireAuth(), request);
      expect(response.status).not.toBe(401);
    });

    it("should return 401 for unauthenticated requests", async () => {
      const request = new Request("http://test.com/api/protected");
      const response = await testMiddleware(requireAuth(), request);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("should attach user to request context", async () => {
      const request = createAuthenticatedRequest({ userId: "user:alice" });
      const context = await testMiddlewareContext(requireAuth(), request);
      expect(context.user).toBeDefined();
      expect(context.user.id).toBe("user:alice");
    });
  });

  describe("requirePermission", () => {
    it("should pass through authorized requests", async () => {
      const request = createAuthenticatedRequest({ userId: "user:alice" });
      const response = await testMiddleware(
        requirePermission("read", (c) => "doc:readme"),
        request
      );
      expect(response.status).not.toBe(403);
    });

    it("should return 403 for unauthorized requests", async () => {
      const request = createAuthenticatedRequest({ userId: "user:bob" });
      const response = await testMiddleware(
        requirePermission("write", (c) => "doc:secret"),
        request
      );
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("Forbidden");
    });

    it("should check permission in <1ms", async () => {
      const request = createAuthenticatedRequest({ userId: "user:alice" });
      const start = performance.now();
      await testMiddleware(
        requirePermission("read", (c) => "doc:readme"),
        request
      );
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(1);
    });
  });

  describe("requireAuthAndPermission", () => {
    it("should return 401 if not authenticated", async () => {
      const request = new Request("http://test.com/api/documents/123");
      const response = await testMiddleware(
        requireAuthAndPermission("read"),
        request
      );
      expect(response.status).toBe(401);
    });

    it("should return 403 if authenticated but not authorized", async () => {
      const request = createAuthenticatedRequest({ userId: "user:bob" });
      const response = await testMiddleware(
        requireAuthAndPermission("write"),
        request
      );
      expect(response.status).toBe(403);
    });

    it("should pass through if authenticated and authorized", async () => {
      const request = createAuthenticatedRequest({ userId: "user:alice" });
      const response = await testMiddleware(
        requireAuthAndPermission("read"),
        request
      );
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });
});

// tests/middleware/security.test.ts
describe("Security Middleware", () => {
  it("should reject requests without CSRF token", async () => {
    const request = new Request("http://test.com/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const response = await testMiddleware(csrfProtection(), request);
    expect(response.status).toBe(403);
  });

  it("should accept requests with valid CSRF token", async () => {
    const token = generateCSRFToken();
    const request = new Request("http://test.com/api/documents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
    });
    const response = await testMiddleware(csrfProtection(), request);
    expect(response.status).not.toBe(403);
  });

  it("should set secure cookie flags in production", () => {
    const response = createSessionResponse(
      { userId: "user:alice" },
      "production"
    );
    const cookie = response.headers.get("Set-Cookie");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });
});
```

**✅ Task 3.3 is DONE when:** All middleware tests pass + secure by default

---

### Overall Phase 3 TDD Completion Criteria

**Phase 3 is considered COMPLETE when:**

- ✅ All OAuth flow tests pass
- ✅ All user sync tests pass (no duplicates)
- ✅ All middleware tests pass (auth + authz)
- ✅ All security tests pass (CSRF, secure cookies)
- ✅ Test coverage ≥80% for auth module
- ✅ Manual testing: Can log in with Google/GitHub
- ✅ Manual testing: Protected endpoints require auth+authz

**Run full test suite:**

```bash
cd cloudflare/worker
npm run test -- --coverage
```

**Expected output:**

```
Test Suites: 8 passed, 8 total
Tests:       52 passed, 52 total
Coverage:    87.3% statements, 84.2% branches, 89.1% functions, 86.7% lines
Time:        8.234s
```

---

## ✅ Phase 3 Success Criteria

### Functional Requirements

- ✅ OAuth login working (Google, GitHub)
- ✅ User sessions managed securely
- ✅ Authenticated users synced to Relish graph
- ✅ Combined auth + authz middleware working
- ✅ Protected endpoints demonstrable

### Security Requirements

- ✅ Sessions use secure cookies
- ✅ CSRF protection enabled
- ✅ Secrets stored securely (Pulumi)
- ✅ Token rotation working
- ✅ User deletion handled

### Quality Requirements

- ✅ Test coverage >80%
- ✅ Error handling complete
- ✅ Documentation complete
- ✅ Migration guide available

### Example Endpoints

```typescript
// Public endpoint
GET /api/public/docs - No auth required

// Auth-only endpoint
GET /api/user/profile - Must be logged in

// Auth + Authz endpoint
GET /api/documents/:id - Must be logged in + have read permission
```

---

## 🚀 Getting Started

### For This Phase

1. **Setup:**

   ```bash
   cd cloudflare/worker
   npm install next-auth @auth/d1-adapter
   pulumi up # Create D1 database
   ```

2. **Configure OAuth:**

   - Register apps in Google Console and GitHub
   - Add secrets to Pulumi config
   - Test OAuth flow

3. **Implement User Sync:**

   - Create user-sync service
   - Test sync on login
   - Verify users in graph

4. **Add Middleware:**
   - Implement auth middleware
   - Implement authz middleware
   - Protect all sensitive endpoints

### Testing

```bash
# Test OAuth login
curl http://localhost:8787/auth/signin/google

# Test protected endpoint (should return 401)
curl http://localhost:8787/api/documents/123

# Test with session (should work)
curl -H "Cookie: session=..." http://localhost:8787/api/documents/123
```

---

## 📚 Related Documentation

- **[MASTER_PLAN.md](../MASTER_PLAN.md)** - Overall project plan
- **[AUTH_JS_CF_AUTH_MIGRATION.md](../archive/AUTH_JS_CF_AUTH_MIGRATION.md)** - Auth.js integration guide
- **[Phase 1: Client SDK](PHASE_1_CLIENT_SDK.md)** - Client SDK (dependency)

---

**Last Updated:** January 11, 2026  
**Phase Owner:** TBD  
**Status:** Not Started (0%)
