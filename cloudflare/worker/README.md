# Kuzu Auth Worker

Edge-based permission validation system built with Test-Driven Development.

## 🎯 Status

✅ **20/20 security tests passing**  
✅ **O(n) validation, O(1) lookups**  
✅ **Chain connectivity verified**  
✅ **Attack detection operational**

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run security tests
npm test

# Run in watch mode
npm test -- --watch

# Deploy to Cloudflare
npm run deploy
```

## 📚 Documentation

- **[QUICKSTART_TDD.md](../QUICKSTART_TDD.md)** - How to run tests and understand the TDD approach
- **[TDD_IMPLEMENTATION_SUMMARY.md](../TDD_IMPLEMENTATION_SUMMARY.md)** - Complete test coverage and implementation details
- **[SECURITY_ARCHITECTURE_CONCISE.md](../SECURITY_ARCHITECTURE_CONCISE.md)** - Architecture overview and design decisions

## 🔒 Security Model

### Edge-Based Validation

**Client**: Queries local Kuzu graph, returns edge IDs  
**Server**: Validates edges exist + form connected chain

```typescript
// Client finds shortest path
const edgeIds = await kuzu.query(`
  MATCH path = (u:User {id: $userId})-[*]->(r:Resource {id: $resourceId})
  RETURN [rel in relationships(path) | id(rel)] as edgeIds
  ORDER BY length(path) ASC LIMIT 1
`);

// Server validates with chain connectivity
const result = await validatePermissionPath({
  edgeIds,
  userId,
  resourceId,
  graphDO,
  auditLogger,
});
// Checks:
// 1. All edges exist (O(n))
// 2. None revoked (O(n))
// 3. Starts with user (O(1))
// 4. Chain connected: edge[i].target === edge[i+1].source (O(n))
// 5. Ends at resource (O(1))
```

### Security Guarantees

| Attack Vector       | Protection              | Test |
| ------------------- | ----------------------- | ---- |
| Forged UUIDs        | Server-generated only   | ✓    |
| Disconnected chains | Connectivity validation | ✓    |
| Revoked permissions | Timestamp check         | ✓    |
| Wrong user/resource | Endpoint validation     | ✓    |
| Invalid mutations   | Proof required          | ✓    |

## 📁 Project Structure

```
src/
├── types/
│   └── edge.ts                    # Edge, ValidationResult, AuditEvent
├── durable-objects/
│   └── graph-state-do.ts          # Edge storage with O(1) lookups
├── services/
│   ├── permission-validator.ts    # Validation + audit logging
│   └── audit-logger.ts            # Security event tracking
└── tests/
    └── security.test.ts           # 20 comprehensive security tests
```

## 🧪 Test Coverage

```
Test Files  1 passed (1)
     Tests  20 passed (20)
  Duration  19ms

✓ Edge ID Security (3)
✓ Chain Connectivity Security (4)
✓ Permission Validation (3)
✓ Audit Logging (3)
✓ Performance & Efficiency (2)
✓ Mutation Security (3)
✓ Edge Immutability (2)
```

See [TDD_IMPLEMENTATION_SUMMARY.md](../TDD_IMPLEMENTATION_SUMMARY.md) for detailed breakdown.

## 🏗️ Implementation Phases

### ✅ Phase 0: TDD Foundation (Complete)

- [x] Write comprehensive security tests
- [x] Implement edge storage (GraphStateDO)
- [x] Implement chain validation
- [x] Implement audit logging
- [x] All tests passing

### 🔄 Phase 1: Integration (Week 1)

- [ ] Integrate with existing worker
- [ ] Add RPC endpoints for edge CRUD
- [ ] Connect to WebSocket infrastructure

### 📋 Phase 2: Client Integration (Week 2)

- [ ] Client-side Kuzu edge ID queries
- [ ] Submit edge IDs to server
- [ ] Handle validation responses

### 💾 Phase 3: CSV Sync (Week 3)

- [ ] Export edges to CSV
- [ ] Store in KV (current + 10 versions)
- [ ] Archive to R2 (>10 versions)
- [ ] WebSocket delta sync

### 🚢 Phase 4: Production (Week 4)

- [ ] Rate limiting
- [ ] Edge count limits
- [ ] Audit export to R2
- [ ] Monitoring

## 🔍 Example Attack Prevention

### Attack: Disconnected Edge Chain

```typescript
// ❌ Malicious client submits valid but disconnected edges
const attack = {
  edgeIds: [
    "e-abc", // user-123 → team-engineering
    "e-xyz", // team-sales → org-acme (DISCONNECTED!)
    "e-def", // org-root → doc-789 (DISCONNECTED!)
  ],
};

// ✓ Server detects broken chain
const result = await validatePermissionPath(attack);
// {
//   valid: false,
//   reason: "Broken chain between edge 0 and 1",
//   brokenChainAt: 0
// }

// ✓ Attack logged for investigation
auditLogger.getLastEvent();
// {
//   eventType: 'ATTACK_DETECTED',
//   attackType: 'DISCONNECTED_EDGE_CHAIN',
//   userId: 'user-123',
//   edgeIds: ['e-abc', 'e-xyz', 'e-def']
// }
```

## ⚡ Performance

From test validation:

- **Edge lookup**: <1ms (O(1) Map access)
- **Chain validation**: 2-5ms (O(n) for 3-5 edges)
- **Complete check**: 3-8ms (lookup + validation + logging)

## 🤝 Contributing

1. Write tests first (TDD approach)
2. Implement to pass tests
3. Ensure all 20 security tests still pass
4. Document security implications

## 📝 License

Private - Kuzu Auth Project
