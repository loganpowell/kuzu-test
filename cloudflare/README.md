# Kuzu Authorization - Cloudflare Workers

Secure authorization system using edge-based validation with Cloudflare Workers and Durable Objects.

## 🎯 Status

✅ **20/20 security tests passing**  
✅ **Edge-based validation implemented**  
✅ **Chain connectivity security verified**  
✅ **Ready for integration**

## 📚 Documentation

- **[Security Architecture](../docs/security/SECURITY_ARCHITECTURE_CONCISE.md)** - Edge-based validation design
- **[TDD Quick Start](../docs/security/QUICKSTART_TDD.md)** - Running security tests
- **[TDD Implementation](../docs/multi-tenant-migration/TDD_SUCCESS.md)** - Complete test coverage
- **[Deployment Guide](../docs/deployment/DEPLOY.md)** - How to deploy
- **[Build Status](../docs/development/BUILD_STATUS.md)** - Current build status

## Quick Start

### Run Tests

```bash
cd worker
npm install
npm test
```

All 20 security tests should pass (17ms execution).

### Deploy

```bash
cd worker
npm run deploy
```

See [Deployment Guide](../docs/deployment/DEPLOY.md) for details.

## Architecture

```
┌─────────────┐
│   Client    │
│ (Kuzu WASM) │ 1. Query graph for shortest path
└──────┬──────┘    Returns: ['edge-uuid-1', 'edge-uuid-2', ...]
       │
       │ 2. Submit edge IDs to server
       ↓
┌────────────────────────┐
│  Durable Object (DO)   │
│  ┌──────────────────┐  │
│  │  Edge Store      │  │ 3. Validate:
│  │  Map<id, Edge>   │  │    • Edges exist? (O(n))
│  └──────────────────┘  │    • Not revoked? (O(n))
│                        │    • Chain starts at user? (O(1))
│  ┌──────────────────┐  │    • Chain connected? (O(n))
│  │  Validator       │  │    • Chain ends at resource? (O(1))
│  └──────────────────┘  │
│                        │
│  ┌──────────────────┐  │ 4. Log event:
│  │  Audit Logger    │  │    • ALLOWED or DENIED
│  └──────────────────┘  │    • Exact edge IDs
└────────────────────────┘    • Attack type if detected
```

## Project Structure

```
cloudflare/
├── worker/                        # Worker implementation
│   ├── src/
│   │   ├── durable-objects/      # GraphStateDO (edge storage)
│   │   ├── services/             # Validation & audit logging
│   │   ├── types/                # TypeScript types
│   │   └── tests/                # Security tests (20 passing)
│   ├── package.json
│   ├── vitest.config.ts
│   └── README.md
├── pulumi/                        # Infrastructure as code
└── README.md (this file)
```

## Security Features

### Edge-Based Validation

- **Server-Generated UUIDs**: Client can't forge edge IDs
- **Chain Connectivity**: Validates `edge[i].target === edge[i+1].source`
- **Soft Deletes**: Revoked edges preserved with `revokedAt` timestamp
- **Complete Audit Trail**: Every check logged with exact edge IDs
- **Attack Detection**: Disconnected chains trigger security alerts

### Test Coverage

```
✓ Edge ID Security (3)
✓ Chain Connectivity Security (4)
✓ Permission Validation (3)
✓ Audit Logging (3)
✓ Performance & Efficiency (2)
✓ Mutation Security (3)
✓ Edge Immutability (2)

Test Files  1 passed (1)
     Tests  20 passed (20)
  Duration  17ms
```

## Performance

- **Edge lookup**: <1ms (O(1) Map access)
- **Chain validation**: 2-5ms (O(n) for 3-5 edges)
- **Complete validation**: 3-8ms including logging

## Next Steps

1. ✅ **Phase 0: TDD Foundation** (Complete)

   - All security tests passing
   - Edge storage implemented
   - Chain validation working
   - Audit logging operational

2. 🔄 **Phase 1: Integration** (Week 1)

   - Integrate with existing worker
   - Add RPC endpoints for edge CRUD
   - Connect to WebSocket infrastructure

3. 📋 **Phase 2: Client Integration** (Week 2)

   - Client-side Kuzu edge ID queries
   - Submit edge IDs to server
   - Handle validation responses

4. 💾 **Phase 3: CSV Sync** (Week 3)

   - Export edges to CSV
   - Store in KV (current + 10 versions)
   - Archive to R2 (>10 versions)
   - WebSocket delta sync

5. 🚢 **Phase 4: Production** (Week 4)
   - Rate limiting
   - Edge count limits
   - Audit export to R2
   - Monitoring & alerting

## License

Private - Kuzu Auth Project
