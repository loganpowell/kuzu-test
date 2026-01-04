# Documentation

This directory contains all project documentation, organized by topic.

## 🎯 Quick Navigation

### For New Team Members

1. **Start here:** [Architecture Overview](./ARCHITECTURE.md) ⭐
2. Read: [Security Architecture](./security/SECURITY_ARCHITECTURE_CONCISE.md)
3. Try: [Full Stack Examples](./security/FULL_STACK_EXAMPLE_COMPLETE.md)
4. Develop: [TDD Quick Start](./security/QUICKSTART_TDD.md)

### For Deployment

- [Cloudflare Deployment Guide](./deployment/DEPLOY.md)

### For Development

- [TDD Implementation](./security/TDD_IMPLEMENTATION_SUMMARY.md)
- [Security Tests](./security/QUICKSTART_TDD.md)

---

## 📂 Documentation Index

### Core Architecture

#### [`ARCHITECTURE.md`](./ARCHITECTURE.md) ⭐ **START HERE**

**Complete system architecture and design decisions**

Comprehensive architectural overview covering:

- **Design Principles**: Client-side queries, server validation, CSV storage
- **Architecture Diagrams**: Persistence loop, WebSocket synchronization
- **Data Format Decisions**: Why CSV over JSON (30-40% faster, benchmarked)
- **Security Model**: Edge-based validation, attack prevention
- **Performance**: Sub-millisecond authorization checks
- **Synchronization**: WebSocket protocol, version tracking, catch-up sync
- **Storage Layer**: R2 (CSV files), KV (mutation log), Durable Objects
- **Testing Strategy**: 35 automated tests + examples
- **Deployment**: Cloudflare infrastructure

**Length:** ~1000 lines  
**Updated:** January 4, 2026

---

### Security & Testing

#### [`security/`](./security/)

##### [`SECURITY_ARCHITECTURE_CONCISE.md`](./security/SECURITY_ARCHITECTURE_CONCISE.md)

**Edge-based validation security model**

- Edge-based validation principles
- Chain connectivity verification
- Attack prevention strategies
- Audit trail implementation

##### [`FULL_STACK_EXAMPLE_COMPLETE.md`](./security/FULL_STACK_EXAMPLE_COMPLETE.md)

**Complete E2E authorization examples**

- 15 E2E test scenarios
- Document management system example
- Client-server flow demonstration
- 6 interactive test cases
- Attack prevention examples

##### [`TDD_IMPLEMENTATION_SUMMARY.md`](./security/TDD_IMPLEMENTATION_SUMMARY.md)

**Test-driven development approach**

- 20 security unit tests
- TDD workflow
- Test coverage report

##### [`QUICKSTART_TDD.md`](./security/QUICKSTART_TDD.md)

**Developer quick start guide**

- Running tests
- Test structure
- Development workflow

---

### Deployment

#### [`deployment/`](./deployment/)

##### [`DEPLOY.md`](./deployment/DEPLOY.md)

**Cloudflare deployment instructions**

- Infrastructure setup
- R2 bucket configuration
- Durable Object deployment
- Environment variables
- Production checklist

---

### Development

#### [`development/`](./development/)

Development guides and workflows (to be expanded).

---

### Archive

#### [`archive/`](./archive/)

Historical and outdated documentation preserved for reference:

- `ARCHITECTURE.md` - Original architecture (superseded by `/docs/ARCHITECTURE.md`)
- `BENCHMARK-RESULTS.md` - Original benchmark results
- `PHASE1_SUMMARY.md` - Phase 1 implementation notes
- `PHASE2_SUMMARY.md` - Phase 2 implementation notes
- `PROJECT_PLAN.md` - Original project plan
- `SECURITY_ARCHITECTURE.md` - Detailed security doc (superseded by concise version)

**Note:** Archive docs may contain outdated information. Refer to current docs for accurate information.

---

## 📖 Reading Guide

### By Role

**👨‍💼 Product Manager / Architect**

1. [ARCHITECTURE.md](./ARCHITECTURE.md) - System overview
2. [FULL_STACK_EXAMPLE_COMPLETE.md](./security/FULL_STACK_EXAMPLE_COMPLETE.md) - See it working
3. [DEPLOY.md](./deployment/DEPLOY.md) - Infrastructure requirements

**👩‍💻 Backend Developer**

1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Understanding the system
2. [SECURITY_ARCHITECTURE_CONCISE.md](./security/SECURITY_ARCHITECTURE_CONCISE.md) - Security model
3. [TDD_IMPLEMENTATION_SUMMARY.md](./security/TDD_IMPLEMENTATION_SUMMARY.md) - Test approach
4. [QUICKSTART_TDD.md](./security/QUICKSTART_TDD.md) - Start developing

**🔐 Security Engineer**

1. [SECURITY_ARCHITECTURE_CONCISE.md](./security/SECURITY_ARCHITECTURE_CONCISE.md) - Security model
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - Attack prevention details
3. [FULL_STACK_EXAMPLE_COMPLETE.md](./security/FULL_STACK_EXAMPLE_COMPLETE.md) - Attack scenarios

**☁️ DevOps / SRE**

1. [DEPLOY.md](./deployment/DEPLOY.md) - Deployment guide
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - Infrastructure overview

**🧪 QA / Test Engineer**

1. [QUICKSTART_TDD.md](./security/QUICKSTART_TDD.md) - Running tests
2. [TDD_IMPLEMENTATION_SUMMARY.md](./security/TDD_IMPLEMENTATION_SUMMARY.md) - Test coverage
3. [FULL_STACK_EXAMPLE_COMPLETE.md](./security/FULL_STACK_EXAMPLE_COMPLETE.md) - Test scenarios

### By Task

**Understanding the System**
→ [ARCHITECTURE.md](./ARCHITECTURE.md)

**Implementing a Feature**
→ [QUICKSTART_TDD.md](./security/QUICKSTART_TDD.md) → Write tests → Implement

**Debugging Security Issue**
→ [SECURITY_ARCHITECTURE_CONCISE.md](./security/SECURITY_ARCHITECTURE_CONCISE.md) → Check audit logs

**Deploying to Production**
→ [DEPLOY.md](./deployment/DEPLOY.md)

**Adding New Tests**
→ [TDD_IMPLEMENTATION_SUMMARY.md](./security/TDD_IMPLEMENTATION_SUMMARY.md)

---

## 🔄 Documentation Status

| Document             | Status     | Last Updated |
| -------------------- | ---------- | ------------ |
| ARCHITECTURE.md      | ✅ Current | Jan 4, 2026  |
| security/\*          | ✅ Current | Jan 4, 2026  |
| deployment/DEPLOY.md | ✅ Current | Dec 2025     |
| archive/\*           | 🗄️ Archive | Various      |

---

## 📝 Contributing to Docs

When updating documentation:

1. **Update current docs**, don't create duplicates
2. **Move outdated docs to `archive/`**
3. **Update this README** with new document links
4. **Add "Last Updated" date** to documents
5. **Keep diagrams in sync** with code changes

---

## 🏗️ Architecture at a Glance

```
Client (Browser)
├─ KuzuDB WASM: In-memory graph database
├─ Authorization: <1ms local queries
└─ WebSocket: Real-time sync

      ↕ Edge Proofs (UUIDs)

Server (Cloudflare Workers)
├─ Durable Objects: State management
├─ Validation: O(n) chain connectivity
└─ WebSocket: Mutation broadcasts

      ↕ CSV Files

Storage (Cloudflare R2 + KV)
├─ R2: Canonical CSV files (users, groups, permissions)
└─ KV: Mutation log (30-day retention)
```

**Key Metrics:**

- Authorization: <1ms (client-side)
- Validation: 2-10ms (server-side)
- Sync: 10-50ms (WebSocket)
- Tests: 35 passing (20 unit + 15 E2E)

---

For questions or clarifications, refer to the relevant document above or check the archive for historical context.
