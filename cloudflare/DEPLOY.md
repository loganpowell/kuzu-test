# Cloudflare Worker Deployment Guide

## Phase 2: Network Baseline Measurement Setup

### Prerequisites

- Cloudflare account with Workers enabled
- Wrangler CLI installed (`npm install -g wrangler`)
- R2 bucket created: `kuzu-auth-dev-graph-state`

### Deployment Steps

#### 1. Install Dependencies

```bash
cd cloudflare/worker
npm install
```

#### 2. Authenticate with Cloudflare

```bash
wrangler login
```

#### 3. Create R2 Bucket (if not exists)

```bash
wrangler r2 bucket create kuzu-auth-dev-graph-state
```

#### 4. Deploy Worker

```bash
wrangler deploy
```

This will deploy the worker and output the worker URL (e.g., `https://kuzu-auth-dev-worker.YOUR_SUBDOMAIN.workers.dev`)

#### 5. Verify Endpoints

Test the Phase 2 endpoints:

**Health Check:**

```bash
curl https://YOUR_WORKER_URL/health
```

**Ping (RTT):**

```bash
curl https://YOUR_WORKER_URL/ping
```

**Echo (Payload Test):**

```bash
curl -X POST https://YOUR_WORKER_URL/echo \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**CSV Data (requires R2 data):**

```bash
curl https://YOUR_WORKER_URL/org/default/csv
```

#### 6. Upload Test CSV Data to R2

Create a simple test user file:

```bash
echo "user1,User One
user2,User Two" > users.csv

wrangler r2 object put kuzu-auth-dev-graph-state/org_default/users.csv --file users.csv
```

Repeat for other tables (groups, resources, etc.)

#### 7. Update Client Configuration

Edit `/client/benchmark.html` and update the default server URL:

```html
<input type="text" id="serverUrl" value="https://YOUR_WORKER_URL" />
```

### Phase 2 Endpoints

The worker now includes:

- `GET /health` - Health check
- `GET /ping` - RTT measurement (returns timestamp)
- `POST /echo` - Payload echo test
- `GET /org/{orgId}/csv` - Fetch all CSV tables from R2

### Testing Network Baseline

1. Open `/client/benchmark.html` in browser
2. Enter your worker URL
3. Click "Run Network Baseline Only"
4. Review metrics:
   - RTT (Round Trip Time)
   - Empty GET latency
   - Empty POST latency
   - POST with 1KB payload latency

### Expected Metrics

- **Local/Same Region**: 10-30ms RTT
- **Cross-Region**: 50-150ms RTT
- **International**: 100-300ms RTT

### Next Steps

After establishing baseline:

1. Implement mutation endpoints (grant/revoke)
2. Add WebSocket support for real-time sync
3. Test multi-client broadcast propagation

### Troubleshooting

**"Worker not found":**

- Verify deployment: `wrangler deployments list`
- Check wrangler.toml configuration

**CORS errors:**

- Endpoints include CORS headers by default
- Verify no firewall/proxy blocking

**R2 access errors:**

- Verify R2 bucket name in wrangler.toml
- Check R2 binding: `binding = "GRAPH_STATE"`

**"Module not found" errors:**

- Run `npm install` in worker directory
- Check TypeScript compilation: `npm run build`
