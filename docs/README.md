# Kuzu-Test Documentation

## Active Documentation

### Security & Architecture
- [Security Architecture (Concise)](../cloudflare/SECURITY_ARCHITECTURE_CONCISE.md) - Current edge-based validation design
- [TDD Implementation](../cloudflare/TDD_SUCCESS.md) - Test-driven security implementation
- [Quick Start: TDD](../cloudflare/QUICKSTART_TDD.md) - Running security tests

### Development
- [Worker README](../cloudflare/worker/README.md) - Worker implementation details
- [Build Status](../cloudflare/BUILD_STATUS.md) - Current build/deployment status

### Deployment
- [Deployment Guide](../cloudflare/DEPLOY.md) - How to deploy to Cloudflare

## Project Overview

This project implements a secure authorization system using:
- **Client-side**: KuzuDB WASM for graph queries
- **Server-side**: Cloudflare Workers + Durable Objects for validation
- **Security**: Edge-based validation with chain connectivity checks
- **Testing**: TDD approach with 20 security tests (all passing)

## Archive

Historical and outdated documentation has been moved to [archive/](./archive/).
