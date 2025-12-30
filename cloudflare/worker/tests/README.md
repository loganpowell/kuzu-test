# Stress Testing & Benchmarking Suite

Node.js-based testing for WebSocket synchronization without browser dependencies.

## Installation

```bash
cd cloudflare/worker
npm install
```

## Benchmarking (Performance Validation)

Validates system against authorization requirements:

- Mutation latency: <50ms p50, <75ms p95
- Throughput: >100 mutations/sec (20+ clients)
- Success rate: >99%

```bash
# Quick benchmark (20 clients, 50 mutations)
npm run benchmark

# Light load (5 clients, 10 mutations)
npm run benchmark:light

# Medium load (20 clients, 50 mutations)
npm run benchmark:medium

# Heavy load (50 clients, 100 mutations)
npm run benchmark:heavy

# All scenarios
npm run benchmark:all
```

### Benchmark Output

```
🔥 Authorization System Benchmark Suite

Performance Requirements:
  • Mutation latency: <50ms p50, <75ms p95
  • Connection setup: <500ms p95
  • Throughput: >100 mutations/sec (20+ clients)
  • Success rate: >99%

📊 Scenario: Light Load
   Baseline performance with minimal load
   Clients: 5, Mutations per client: 10

📡 Phase 1: Connection Setup...
   ✅ Connected 5 clients in 1382ms
   📊 Per-client: p50=1334.0ms, p95=1376.0ms, p99=1376.0ms

⚡ Phase 2: Concurrent Mutations...
   ✅ Sent 50 mutations in 1003ms
   📊 Throughput: 49.85 mutations/sec

📊 Phase 3: Analyzing Performance...
   Debug: 50 mutations acknowledged out of 50

📈 Results:
───────────────────────────────────────────────────────────────

⏱️  Connection Setup:
   Mean: 1343.4ms
   p50:  1334.0ms
   p95:  1376.0ms ❌ (includes DO cold start)
   p99:  1376.0ms

⚡ Mutation Latency:
   Mean: 68.9ms
   p50:  69.0ms ⚠️  (slightly over 50ms)
   p95:  70.0ms ✅ (meets <75ms)
   p99:  70.0ms

📊 Throughput & Success:
   Throughput:   49.85 mutations/sec
   Success rate: 100.00% ✅
   Error rate:   0.00%
```

## Stress Testing (Load Testing)

Tests multi-client scenarios and system stability:

```bash
# Small test (5 clients, 10 mutations each)
npm run stress-test:small

# Medium test (20 clients, 50 mutations each)
npm run stress-test:medium

# Large test (50 clients, 100 mutations each)
npm run stress-test:large

# Reconnection test (10 clients with disconnect/reconnect)
npm run stress-test:reconnect
```

## Custom Configuration

```bash
npm run stress-test -- --clients=30 --mutations=100 --verbose
```

### Options

- `--clients=N` - Number of concurrent WebSocket clients (default: 10)
- `--mutations=N` - Mutations per client (default: 10)
- `--delay=N` - Delay in ms between mutations (default: 0)
- `--org=NAME` - Organization ID to test (default: org_stress_test)
- `--url=URL` - Worker URL (default: production)
- `--reconnect` - Enable reconnection testing
- `--verbose` or `-v` - Detailed logging

## Test Scenarios

### 1. Concurrent Connection Setup

- Connects N clients simultaneously
- Measures connection time and success rate
- Validates all clients receive initial state

### 2. Concurrent Mutations

- Each client sends M mutations
- Tests: grant/revoke operations
- Measures: throughput, latency, acknowledgments

### 3. Broadcast Synchronization

- Validates all clients receive all mutations
- Checks for version gaps (missed broadcasts)
- Measures broadcast fanout performance

### 4. Reconnection & Catch-up (optional)

- Disconnects half the clients
- Sends mutations while disconnected
- Reconnects and validates catch-up sync

## Example Output

```
🔥 WebSocket Stress Test Starting...
   Workers: https://kuzu-auth-dev-worker-v2.logan-607.workers.dev
   Org: org_stress_test
   Clients: 20
   Mutations: 50 per client

📡 Test 1: Concurrent Connection Setup (20 clients)
   ✅ 20/20 clients connected
   ⏱️  Total time: 1543ms
   📊 Average: 77.15ms per client

⚡ Test 2: Concurrent Mutations (50 mutations from 20 clients)
   ✅ Mutations sent: 1000
   ✅ Mutations acknowledged: 1000
   ⏱️  Total time: 45231ms
   📊 Throughput: 22.11 mutations/sec
   📊 Average latency: 45.23ms per mutation

📢 Test 3: Broadcast Synchronization
   ✅ Total messages received: 21000
   📊 Versions per client: min=1000, max=1000, avg=1000.0
   📊 Version gaps detected: 0 (should be 0)

📊 Final Results:
────────────────────────────────────────────────────────────
Total test time: 48.32s
Connected clients: 20/20
Messages received: 21000
Mutations sent: 1000
Mutations acknowledged: 1000 (100.0%)
Errors: 0

✅ All tests passed!
```

## Performance Targets

Based on Phase 3 benchmarks:

- **Connection setup**: <100ms per client
- **Mutation latency**: <50ms mean, <75ms p95
- **Broadcast fanout**: All clients receive within 100ms
- **Acknowledgment rate**: 100%
- **Version synchronization**: 0 gaps

## Troubleshooting

### High Error Rate

- Check worker deployment: `npx wrangler tail`
- Verify worker URL is accessible
- Check for rate limiting

### Version Gaps

- Indicates missed broadcasts
- Check DO broadcast logic
- Verify WebSocket connection stability

### Slow Throughput

- Check mutation delay setting
- Verify DO isn't throttling
- Check network latency

### Connection Failures

- Increase connection timeout
- Check WebSocket endpoint
- Verify org creation in DO

## Integration with CI/CD

Add to GitHub Actions:

```yaml
- name: Run stress tests
  run: |
    cd cloudflare/worker
    npm install
    npm run stress-test:medium
```

## Advanced Usage

### Test Against Local Dev Server

```bash
npm run stress-test -- --url=http://localhost:8787
```

### High-Volume Load Test

```bash
npm run stress-test -- --clients=100 --mutations=200
```

### Simulate Slow Network

```bash
npm run stress-test -- --clients=10 --mutations=50 --delay=100
```

## Metrics Collected

Per client:

- Connection time
- Messages received
- Mutations sent/acknowledged
- Last version seen
- Error count
- Version gaps

Aggregate:

- Total throughput (mutations/sec)
- Average latency
- Broadcast consistency
- Reconnection success rate
