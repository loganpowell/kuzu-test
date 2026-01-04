# Full Stack Authorization Examples

Comprehensive end-to-end examples demonstrating the edge-based authorization system in action.

## 🎯 Overview

These examples show how to build secure applications using our TDD-validated authorization model:

1. **E2E Test Suite** - 15 realistic authorization scenarios
2. **Document Management System** - Full client-server implementation example

## 📁 Files

```
src/
├── tests/
│   └── e2e-authorization.test.ts    # 15 E2E test scenarios
├── examples/
│   └── document-system.ts           # Full stack example app
└── scripts/
    └── run-document-example.ts      # Runner script
```

## 🧪 E2E Authorization Test Suite

**Location**: `src/tests/e2e-authorization.test.ts`

### Test Scenarios (15 tests)

#### Scenario 1: CEO Access (Deep Hierarchy)

- ✓ CEO accesses company financials via executives group
- ✓ CEO accesses engineering docs via multi-level inheritance

#### Scenario 2: Engineer Access (Mid-Level)

- ✓ Engineer accesses engineering docs via team inheritance
- ✓ Engineer denied access to company financials (insufficient permissions)

#### Scenario 3: Contractor Access (Temporary)

- ✓ Contractor accesses project code via project team
- ✓ Contractor denied access after revocation

#### Scenario 4: Cross-Department Denial

- ✓ Sales manager denied access to engineering docs
- ✓ Engineer denied access to sales reports

#### Scenario 5: Direct Permissions

- ✓ User accesses public wiki via direct permission

#### Scenario 6: Attack Prevention

- ✓ Prevents privilege escalation via disconnected chain
- ✓ Prevents impersonation attack
- ✓ Prevents wrong resource attack

#### Scenario 7: Audit Trail

- ✓ Logs complete audit trail for successful access
- ✓ Logs attack attempts with full context

#### Scenario 8: Performance at Scale

- ✓ Validates long permission chains efficiently (<10ms)

### Organization Structure

```
Users:
- alice (CEO)
- bob (Engineering Manager)
- charlie (Engineer)
- diana (Sales Manager)
- eve (Contractor)

Groups:
- executives
- engineering-dept
- sales-dept
- engineering-team
- project-alpha-team

Resources:
- company-financials
- engineering-docs
- project-alpha-code
- sales-reports
- public-wiki
```

### Run E2E Tests

```bash
npm run test:e2e
```

**Expected Output:**

```
✓ src/tests/e2e-authorization.test.ts (15 tests) 10ms

Test Files  1 passed (1)
     Tests  15 passed (15)
```

## 📝 Document Management System Example

**Location**: `src/examples/document-system-standalone.ts`

A complete full-stack example demonstrating client-server authorization flow. This standalone version runs without the Cloudflare Workers runtime for easy local testing.

### Features

- **Client-Side**: Simulates Kuzu WASM graph queries
- **Server-Side**: Edge validation with chain connectivity
- **Realistic Scenarios**: Corporate document access patterns
- **Attack Prevention**: Demonstrates security features
- **Audit Trail**: Complete event logging

### Organizational Setup

```
Users & Roles:
- Alice (CTO) → Engineering Leadership → Tech Docs (write)
- Bob (Senior Engineer) → Engineering Team → Team Docs (write)
- Charlie (Junior Engineer) → Engineering Team → Team Docs (read)
- Diana (Intern) → Interns → Project Alpha (read, temporary)
```

### Test Cases

1. **✓ CTO Edits Tech Documentation** - Alice successfully edits tech docs
2. **✓ Senior Engineer Edits Team Docs** - Bob successfully edits team docs
3. **✗ Junior Engineer Tries to Edit** - Charlie denied (read-only access)
4. **✓ Intern Accesses Project** - Diana successfully reads project docs
5. **✗ Revoke Intern Access** - Diana denied after internship ends
6. **✗ Privilege Escalation Attack** - Charlie's disconnected edge attack blocked

### Run Example

```bash
npm run example:docs
```

### Example Output

```
================================================================================
DOCUMENT MANAGEMENT SYSTEM - Authorization Example
================================================================================

📋 Setting up organization structure...
✓ Organization structure created

📝 Test Case 1: CTO Edits Tech Documentation
--------------------------------------------------------------------------------
[CLIENT] Checking permission for user:alice to write resource:tech-docs
[CLIENT] Found permission path with 2 edges: [...edge IDs...]
[SERVER] Validating permission proof from user:alice
[SERVER] ✓ Permission GRANTED for user:alice

🎉 Result: ALLOWED
   Alice can edit tech-docs as CTO

📝 Test Case 2: Senior Engineer Edits Team Docs
--------------------------------------------------------------------------------
[CLIENT] Checking permission for user:bob to write resource:team-docs
[CLIENT] Found permission path with 2 edges: [...edge IDs...]
[SERVER] Validating permission proof from user:bob
[SERVER] ✓ Permission GRANTED for user:bob

🎉 Result: ALLOWED
   Bob can edit team-docs as senior engineer

... (more test cases) ...

📝 Test Case 6: Attack Prevention - Privilege Escalation
--------------------------------------------------------------------------------
[ATTACKER] Charlie attempts to use disconnected edges to access tech-docs
[SERVER] Validating permission proof from user:charlie
[SERVER] ✗ Permission DENIED: Broken chain between edge 0 and 1

🛡️  Result: DENIED
   Reason: Broken chain between edge 0 and 1
   Attack detected and blocked!

================================================================================
AUDIT TRAIL REPORT
================================================================================

Total Events: 6

Event 1:
  Type: PERMISSION_CHECK
  User: user:alice
  Resource: resource:tech-docs
  Result: ALLOWED

Event 2:
  Type: PERMISSION_CHECK
  User: user:bob
  Resource: resource:team-docs
  Result: ALLOWED

... (more events) ...

Event 6:
  Type: ATTACK_DETECTED
  User: user:charlie
  Resource: resource:tech-docs
  Result: DENIED
  ⚠️  Attack Type: DISCONNECTED_EDGE_CHAIN

================================================================================
EXAMPLE COMPLETE
================================================================================
```

## 🏗️ Architecture Flow

### Client-Server Interaction

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT SIDE                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 1. User requests document access                          │ │
│  │    checkPermission(userId, resourceId, capability)        │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 2. Query local Kuzu WASM graph                            │ │
│  │    MATCH path = (u:User)-[*]->(r:Resource)                │ │
│  │    RETURN [rel in relationships(path) | id(rel)]          │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 3. Extract edge IDs from query result                     │ │
│  │    edgeIds: ['edge-uuid-1', 'edge-uuid-2', ...]           │ │
│  └────────────────────────┬───────────────────────────────────┘ │
└────────────────────────────┼───────────────────────────────────┘
                             │
                             ↓ HTTP Request
                             │ { userId, resourceId, edgeIds }
                             │
┌────────────────────────────┼───────────────────────────────────┐
│                        SERVER SIDE                              │
│  ┌────────────────────────┴───────────────────────────────────┐ │
│  │ 4. Validate edge-based proof                              │ │
│  │    validatePermissionPath(edgeIds, userId, resourceId)    │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 5. Check edges exist & not revoked (O(n))                 │ │
│  │ 6. Verify chain connectivity (O(n))                       │ │
│  │    • edge[0].source === userId                            │ │
│  │    • edge[i].target === edge[i+1].source                  │ │
│  │    • edge[n].target === resourceId                        │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 7. Log audit event                                        │ │
│  │    { userId, resourceId, edgeIds, result, timestamp }     │ │
│  └────────────────────────┬───────────────────────────────────┘ │
│                           ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 8. Return validation result                               │ │
│  │    { allowed: true/false, reason?: string }               │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 🔒 Security Features Demonstrated

### 1. Edge-Based Validation

- Client queries graph, server validates edges
- Server-generated UUIDs cannot be forged
- Fast O(n) validation with O(1) lookups

### 2. Chain Connectivity

- Validates `edge[i].target === edge[i+1].source`
- Prevents disconnected edge attacks
- Ensures user → ... → resource path is connected

### 3. Attack Prevention

All examples demonstrate protection against:

- **Forged Edge IDs**: Non-existent UUIDs rejected
- **Disconnected Chains**: Valid but unconnected edges detected
- **Impersonation**: Wrong user for edge chain rejected
- **Wrong Resource**: Edge chain for different resource rejected
- **Revoked Access**: Soft-deleted edges immediately blocked

### 4. Complete Audit Trail

Every authorization check logged with:

- User ID and resource ID
- Exact edge IDs used
- Result (ALLOWED/DENIED)
- Attack type (if detected)
- Timestamp

## 📊 Performance Characteristics

From E2E tests:

| Operation               | Time  | Complexity |
| ----------------------- | ----- | ---------- |
| Edge lookup             | <1ms  | O(1)       |
| Short chain (2-3 edges) | 2-5ms | O(n)       |
| Long chain (10 edges)   | <10ms | O(n)       |
| Attack detection        | 3-8ms | O(n)       |

## 🚀 Quick Start

```bash
# Run all tests (35 tests)
npm test -- --run

# Run just E2E scenarios (15 tests)
npm run test:e2e

# Run just security tests (20 tests)
npm run test:security

# Run document system example
npm run example:docs
```

## 📚 Related Documentation

- [TDD Implementation Summary](../../../../docs/security/TDD_IMPLEMENTATION_SUMMARY.md)
- [Security Architecture](../../../../docs/security/SECURITY_ARCHITECTURE_CONCISE.md)
- [Quick Start Guide](../../../../docs/security/QUICKSTART_TDD.md)

## 💡 Building Your Own Examples

Use these examples as templates for your own authorization scenarios:

1. **Define your entities**: users, groups, resources
2. **Create edges**: membership, inheritance, permissions
3. **Write test cases**: both allow and deny scenarios
4. **Test attacks**: verify security features work
5. **Check audit trail**: ensure proper logging

See the existing examples for patterns and best practices!
