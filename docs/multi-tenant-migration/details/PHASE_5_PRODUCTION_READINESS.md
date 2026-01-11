# Phase 5: Production Readiness

**Status:** 0% Complete  
**Estimated Duration:** 7-10 weeks  
**Target:** Production-grade operations, monitoring, CI/CD

> **Parent Plan:** [MASTER_PLAN.md](../MASTER_PLAN.md)  
> **Related:** [PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md)

---

## 📊 Phase Overview

### Goal

Transform the system from working prototype to production-ready platform with automated CI/CD, comprehensive monitoring, load testing, and robust error handling.

### Current Progress

| Component                   | Progress | Status             |
| --------------------------- | -------- | ------------------ |
| CI/CD Pipeline              | 0%       | ⏳ Not Started     |
| Monitoring & Observability  | 0%       | ⏳ Not Started     |
| Load Testing                | 0%       | ⏳ Not Started     |
| Error Handling & Resilience | 0%       | ⏳ Not Started     |
| **Overall**                 | **0%**   | **⏳ Not Started** |

### Dependencies

- ⏳ Phase 1: Client SDK (Must be 100%)
- ⏳ Phase 2: Schema Infrastructure (Must be 80%+)

---

## 📋 Implementation Tasks

### 5.1 CI/CD Pipeline (Week 1-2)

**Goal:** Automate testing, deployment, and infrastructure management with Pulumi

#### Tasks

- [ ] **GitHub Actions Workflows**

  - [ ] **test.yml** - Run on every PR
    - TypeScript type checking
    - ESLint linting
    - Unit tests (Jest)
    - Integration tests
    - E2E tests (Playwright)
    - Security scan (npm audit)
  - [ ] **pulumi-preview.yml** - Preview infrastructure changes
    - Run `pulumi preview` on infrastructure changes
    - Comment preview results on PR
    - Validate Pulumi code
  - [ ] **deploy-staging.yml** - Deploy on merge to main
    - Deploy infrastructure: `pulumi up --stack staging`
    - Deploy Worker: `wrangler deploy --env staging`
    - Run smoke tests
    - Notify on Slack
  - [ ] **deploy-prod.yml** - Deploy on tag/release
    - Deploy infrastructure: `pulumi up --stack production`
    - Deploy Worker: `wrangler deploy --env production`
    - Run smoke tests
    - Create GitHub release notes
  - [ ] **schema-check.yml** - Validate schema changes
    - Validate schema.yaml syntax
    - Run schema compiler
    - Check for breaking changes
    - Generate migration scripts

- [ ] **Environment Management**

  - [ ] **Pulumi Stacks**
    - `dev` stack (local development)
    - `staging` stack (pre-production)
    - `production` stack (production)
  - [ ] **Secret Management**
    - Use Pulumi encrypted config
    - Rotate secrets regularly
    - Audit secret access
  - [ ] **Environment Variables**
    - Separate configs per stack
    - Validation on deployment
    - Documentation

- [ ] **Performance Regression Tests**
  - [ ] Benchmark authorization checks
    - Fail if p95 >10% slower than baseline
  - [ ] Benchmark CSV loading
  - [ ] Benchmark WebSocket connections
  - [ ] Store results in time-series DB

#### File Structure

```
.github/workflows/
  test.yml              # Run tests on PR
  pulumi-preview.yml    # Preview infrastructure changes
  deploy-staging.yml    # Deploy to staging
  deploy-prod.yml       # Deploy to production
  schema-check.yml      # Validate schema changes

pulumi/
  index.ts              # Infrastructure definition
  Pulumi.dev.yaml       # Dev stack config
  Pulumi.staging.yaml   # Staging stack config
  Pulumi.production.yaml # Production stack config
```

#### Acceptance Criteria

- ✅ All tests run automatically on PR
- ✅ Pulumi preview shows infrastructure changes
- ✅ Staging deploys on merge to main
- ✅ Production deploys on tag/release
- ✅ Schema validation prevents breaking changes
- ✅ Performance regression tests catch slowdowns

---

### 5.2 Monitoring & Observability (Week 3-4)

**Goal:** Comprehensive monitoring with alerts and dashboards

#### Tasks

- [ ] **Cloudflare Analytics**

  - [ ] Enable Cloudflare Analytics
  - [ ] Worker Analytics (CPU, memory, requests)
  - [ ] Durable Object Analytics (wake count, CPU, memory)
  - [ ] Custom analytics events

- [ ] **Custom Metrics**

  - [ ] Authorization check latency (p50, p95, p99)
  - [ ] Error rates by endpoint
  - [ ] WebSocket connection count
  - [ ] Durable Object wake count
  - [ ] CSV load times
  - [ ] Mutation broadcast time
  - [ ] Cache hit rates

- [ ] **Health Checks**

  - [ ] Worker health endpoint (`/health`)
    - Check Worker is responding
    - Check Durable Object connectivity
    - Check R2/KV/D1 connectivity
  - [ ] Status page (e.g., status.relish.dev)
    - Current system status
    - Uptime percentage
    - Recent incidents

- [ ] **Alerting**

  - [ ] **Error rate >1%** → Slack, PagerDuty
  - [ ] **Latency p95 >50ms** → Slack
  - [ ] **WebSocket disconnects >10%** → Slack
  - [ ] **Durable Object errors** → PagerDuty
  - [ ] **CSV load failures** → Slack

- [ ] **Dashboards**
  - [ ] **Grafana/DataDog Dashboard**
    - Real-time metrics
    - Authorization check heatmap
    - Error distribution
    - WebSocket connection graph
    - Durable Object wake counts
  - [ ] **Cloudflare Dashboard**
    - Request volume
    - Error rates
    - Latency percentiles

#### Integration Options

- Cloudflare Analytics (built-in)
- Grafana + Prometheus
- DataDog
- New Relic
- Honeycomb

#### File Structure

```
cloudflare/worker/src/
  monitoring/
    metrics.ts          # Custom metrics
    health-check.ts     # Health check endpoint
    alerts.ts           # Alert configuration

grafana/
  dashboards/
    authorization.json  # Authorization metrics
    worker.json         # Worker metrics
    websocket.json      # WebSocket metrics
```

#### Acceptance Criteria

- ✅ All key metrics tracked
- ✅ Alerts configured and tested
- ✅ Dashboards showing real-time data
- ✅ Health checks working
- ✅ Status page live

---

### 5.3 Load Testing (Week 5-6)

**Goal:** Validate system performance under realistic and extreme load

#### Tasks

- [ ] **k6 Load Test Scripts**

  - [ ] **auth-check.js** - Authorization check load test
    - 1K, 10K, 100K concurrent clients
    - Measure latency (p50, p95, p99)
    - Identify bottlenecks
  - [ ] **mutations.js** - Mutation load test
    - 100, 1K, 10K mutations/second
    - Measure broadcast time
    - Check for data loss
  - [ ] **websocket.js** - WebSocket connection test
    - 1K, 10K, 100K concurrent connections
    - Measure connection establishment time
    - Check for connection drops
  - [ ] **cold-start.js** - Cold start measurement
    - Measure Durable Object cold start time
    - Test with different DO sizes
    - Optimize cold start path

- [ ] **Test Scenarios**

  - [ ] **Normal Load** - 1K concurrent clients
  - [ ] **Peak Load** - 10K concurrent clients
  - [ ] **Extreme Load** - 100K concurrent clients
  - [ ] **Burst Traffic** - 0 → 10K in 10 seconds
  - [ ] **Sustained Load** - 10K clients for 1 hour

- [ ] **Performance Measurement**

  - [ ] Authorization check latency
  - [ ] CSV load time (1MB, 10MB, 100MB)
  - [ ] WebSocket broadcast time
  - [ ] Durable Object cold start frequency
  - [ ] Memory usage over time

- [ ] **Bottleneck Identification**

  - [ ] Worker CPU usage
  - [ ] Durable Object memory
  - [ ] R2 read latency
  - [ ] KV read latency
  - [ ] Network latency

- [ ] **Optimization**
  - [ ] Cache optimization
  - [ ] Index tuning
  - [ ] Batch operations
  - [ ] Connection pooling

#### File Structure

```
loadtests/
  scenarios/
    auth-check.js       # Authorization check load test
    mutations.js        # Mutation load test
    websocket.js        # WebSocket connection test
    cold-start.js       # Cold start measurement
  results/
    baseline.json       # Baseline results
    reports/            # Test reports
  package.json
```

#### k6 Script Example

```javascript
// loadtests/scenarios/auth-check.js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "1m", target: 1000 }, // Ramp up to 1K
    { duration: "3m", target: 1000 }, // Stay at 1K
    { duration: "1m", target: 10000 }, // Ramp up to 10K
    { duration: "3m", target: 10000 }, // Stay at 10K
    { duration: "1m", target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<50"], // 95% of requests <50ms
    http_req_failed: ["rate<0.01"], // <1% error rate
  },
};

export default function () {
  const userId = `user:${__VU}`;
  const resourceId = `resource:${Math.floor(Math.random() * 10000)}`;

  const res = http.get(
    `https://api.relish.dev/v1/authz/check?userId=${userId}&resourceId=${resourceId}`
  );

  check(res, {
    "status is 200": (r) => r.status === 200,
    "response time <50ms": (r) => r.timings.duration < 50,
  });

  sleep(0.1); // 100ms think time
}
```

#### Acceptance Criteria

- ✅ System handles 100K concurrent clients
- ✅ Authorization checks <50ms (p95) under load
- ✅ Error rate <1% under load
- ✅ No memory leaks detected
- ✅ Bottlenecks identified and documented
- ✅ Optimization plan created

---

### 5.4 Error Handling & Resilience (Week 7-8)

**Goal:** Graceful degradation and automatic recovery

#### Tasks

- [ ] **Client-Side Retry Logic**

  - [ ] Exponential backoff (1s, 2s, 4s, 8s, 16s, 30s)
  - [ ] Max retry attempts (5)
  - [ ] Retry only on transient errors (5xx, network errors)
  - [ ] Don't retry on 4xx errors

- [ ] **WebSocket Reconnection**

  - [ ] Automatic reconnect on disconnect
  - [ ] Exponential backoff
  - [ ] Version sync after reconnect
  - [ ] Queue mutations during disconnect

- [ ] **Graceful Degradation**

  - [ ] Offline mode (use stale data)
  - [ ] Fallback to server validation if WASM fails
  - [ ] Queue mutations for later if server unreachable
  - [ ] Show warning to user when degraded

- [ ] **Better Error Messages**

  - [ ] User-friendly messages
  - [ ] Actionable guidance ("Try again" button)
  - [ ] Error codes for debugging
  - [ ] Context about what failed

- [ ] **Data Validation**

  - [ ] CSV corruption detection
  - [ ] Schema compatibility checker
  - [ ] Migration safety checks
  - [ ] Rollback mechanism

- [ ] **Circuit Breaker Pattern**
  - [ ] Stop calling failing services after N failures
  - [ ] Automatic recovery after timeout
  - [ ] Fallback behavior

#### File Structure

```
client/sdk/src/
  resilience/
    retry-strategy.ts   # Retry logic
    circuit-breaker.ts  # Circuit breaker
    offline-manager.ts  # Offline mode
    error-messages.ts   # User-friendly errors

cloudflare/worker/src/
  resilience/
    rate-limiter.ts     # Rate limiting
    health-check.ts     # Health checks
    fallback.ts         # Fallback behavior
```

#### Code Example

```typescript
// client/sdk/src/resilience/retry-strategy.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;

      // Don't retry on 4xx errors
      if (error.status >= 400 && error.status < 500) {
        throw error;
      }

      // Give up after max attempts
      if (attempt >= maxAttempts) {
        throw error;
      }

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await sleep(delay);
    }
  }
}

// Usage
const result = await retryWithBackoff(() =>
  authClient.canUserRead(userId, resourceId)
);
```

#### Acceptance Criteria

- ✅ Retry logic working
- ✅ WebSocket reconnection working
- ✅ Offline mode working
- ✅ Error messages are actionable
- ✅ Circuit breaker prevents cascading failures
- ✅ Data validation prevents corruption

---

## 🧪 Test-Driven Development (TDD) Approach

### TDD Workflow for Phase 5

**Production readiness requires infrastructure testing:**

1. **Write infrastructure tests** for Pulumi deployments
2. **Write load tests** before optimization
3. **Write chaos tests** for resilience
4. **Write monitoring tests** for alert accuracy
5. Mark complete **only when SLOs are met under load**

### Test Framework Setup

```bash
cd cloudflare/infrastructure
npm install --save-dev @pulumi/pulumi-policy

cd ../../loadtesting
npm install -g k6

cd ../cloudflare/worker
npm install --save-dev vitest
```

### Task 5.1: CI/CD Pipeline - Test Suite

**Infrastructure Tests:**

```typescript
// infrastructure/tests/policy.test.ts
import { PolicyPack, validateResourceOfType } from "@pulumi/pulumi-policy";

new PolicyPack("production-readiness", {
  policies: [
    {
      name: "worker-must-have-monitoring",
      description: "All Workers must have logging enabled",
      enforcementLevel: "mandatory",
      validateResource: validateResourceOfType(
        cloudflare.WorkerScript,
        (worker, args, reportViolation) => {
          if (!worker.logpush) {
            reportViolation("Worker must have Logpush enabled");
          }
        }
      ),
    },
  ],
});
```

**✅ Task 5.1 is DONE when:** Deployments work + policy tests pass

### Task 5.2: Load Testing - Test Suite

**k6 Load Tests (write BEFORE optimization):**

```javascript
// loadtesting/scenarios/authorization-check.js
import http from "k6/http";
import { check } from "k6";

export const options = {
  stages: [
    { duration: "2m", target: 100 },
    { duration: "5m", target: 1000 },
    { duration: "2m", target: 10000 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<100", "p(99)<200"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const response = http.post("https://api.relish.dev/v1/check", {
    userId: `user:${__VU}`,
    resourceId: `doc:${Math.floor(Math.random() * 1000)}`,
  });

  check(response, {
    "status is 200": (r) => r.status === 200,
    "response time < 100ms": (r) => r.timings.duration < 100,
  });
}
```

**✅ Task 5.2 is DONE when:** Load tests pass at 100K concurrent

### Task 5.3-5.4: Monitoring & Resilience - Test Suite

**Chaos Engineering Tests:**

```typescript
// tests/chaos/resilience.test.ts
describe("Chaos Engineering", () => {
  it("should handle database failures", async () => {
    await simulateDBFailure();
    const response = await fetch("https://api.relish.dev/v1/check");
    expect([200, 503]).toContain(response.status);
  });

  it("should implement circuit breaker", async () => {
    // Cause 10 failures
    for (let i = 0; i < 10; i++) {
      await fetch("https://api.relish.dev/v1/failing-service");
    }

    const response = await fetch("https://api.relish.dev/v1/failing-service");
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.message).toContain("Circuit breaker open");
  });
});
```

**✅ Phase 5 is DONE when:** All tests pass + SLOs met (99.9% uptime, p95 <100ms)

---

## ✅ Phase 5 Success Criteria

### Operational Requirements

- ✅ CI/CD pipeline operational
- ✅ Automated deployments to staging/production
- ✅ Pulumi manages all infrastructure
- ✅ Secrets managed securely

### Monitoring Requirements

- ✅ All key metrics tracked
- ✅ Dashboards showing real-time data
- ✅ Alerts configured and tested
- ✅ Health checks working
- ✅ Status page live

### Performance Requirements

- ✅ System handles 100K concurrent clients
- ✅ Error rate <1%
- ✅ Authorization checks <50ms (p95)
- ✅ No performance regressions

### Resilience Requirements

- ✅ Automatic retry working
- ✅ Graceful degradation
- ✅ Circuit breakers preventing cascades
- ✅ Data validation preventing corruption

---

## 🚀 Getting Started

### For This Phase

1. **Setup:**

   ```bash
   # Install k6
   brew install k6

   # Setup monitoring
   cd grafana
   docker-compose up -d
   ```

2. **Implement CI/CD:**

   - Create GitHub Actions workflows
   - Configure Pulumi stacks
   - Test deployments to staging

3. **Add Monitoring:**

   - Configure Cloudflare Analytics
   - Create Grafana dashboards
   - Setup alerts

4. **Run Load Tests:**
   - Run baseline tests
   - Identify bottlenecks
   - Optimize and retest

### Testing

```bash
# Run load tests
cd loadtests
k6 run scenarios/auth-check.js

# Check metrics
open http://localhost:3000 # Grafana

# Test health check
curl https://api.relish.dev/health
```

---

## 📚 Related Documentation

- **[MASTER_PLAN.md](../MASTER_PLAN.md)** - Overall project plan
- **[PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md)** - Architecture overview
- **[Phase 1: Client SDK](PHASE_1_CLIENT_SDK.md)** - Client SDK (dependency)
- **[Phase 2: Schema Infrastructure](PHASE_2_SCHEMA_INFRASTRUCTURE.md)** - Schema Infrastructure (dependency)

---

**Last Updated:** January 11, 2026  
**Phase Owner:** TBD  
**Status:** Not Started (0%)
