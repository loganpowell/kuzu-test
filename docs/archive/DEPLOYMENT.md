# Deployment Guide

Complete guide to deploying the Zanzibar-inspired authorization system on Cloudflare.

## Prerequisites

1. **Cloudflare Account**

   - Sign up at https://cloudflare.com
   - Note your Account ID (in Workers & Pages settings)
   - Create an API token with Workers and R2 permissions

2. **Tools**

   ```bash
   # Node.js 18+
   node --version

   # npm or pnpm
   npm --version

   # Pulumi CLI
   curl -fsSL https://get.pulumi.com | sh
   pulumi version

   # Wrangler CLI (Cloudflare)
   npm install -g wrangler
   wrangler --version
   ```

## Step 1: Configure Cloudflare Credentials

```bash
# Login to Cloudflare
wrangler login

# Or set API token manually
export CLOUDFLARE_API_TOKEN=your_api_token_here
export CLOUDFLARE_ACCOUNT_ID=your_account_id_here
```

## Step 2: Deploy Infrastructure with Pulumi

```bash
cd cloudflare/pulumi

# Install dependencies
npm install

# Configure Pulumi
pulumi login  # Or use pulumi login --local for local state
pulumi stack init dev

# Set Cloudflare credentials
pulumi config set cloudflare:apiToken $CLOUDFLARE_API_TOKEN --secret
pulumi config set cloudflare:accountId $CLOUDFLARE_ACCOUNT_ID

# Optional: Set custom domain
pulumi config set kuzu-auth:domain example.com

# Preview infrastructure
pulumi preview

# Deploy
pulumi up

# Note the Worker URL from outputs
```

## Step 3: Build and Deploy Worker

```bash
cd ../worker

# Install dependencies
npm install

# Build the worker
npm run build

# Deploy to Cloudflare
npm run deploy

# Test deployment
curl https://kuzu-auth-dev-worker.your-subdomain.workers.dev/health
```

## Step 4: Test the Deployment

```bash
cd ../tests

# Install dependencies
npm install

# Set Worker URL
export WORKER_URL=https://kuzu-auth-dev-worker.your-subdomain.workers.dev

# Run health check
curl $WORKER_URL/health

# Run stress tests
npm run stress-test
```

## Step 5: Integrate SDK

```bash
# In your application
npm install @kuzu-auth/sdk

# Or build from source
cd cloudflare/sdk
npm run build
```

```typescript
import { AuthClient } from "@kuzu-auth/sdk";

const client = new AuthClient({
  workerUrl: "https://kuzu-auth-dev-worker.your-subdomain.workers.dev",
});

// Check permission
const allowed = await client.check({
  user: "user:alice",
  permission: "read",
  resource: "resource:doc123",
});
```

## Production Deployment

### 1. Create Production Stack

```bash
cd cloudflare/pulumi
pulumi stack init prod

# Configure for production
pulumi config set cloudflare:apiToken $CLOUDFLARE_API_TOKEN --secret
pulumi config set cloudflare:accountId $CLOUDFLARE_ACCOUNT_ID
pulumi config set kuzu-auth:environment prod
pulumi config set kuzu-auth:domain your-domain.com

# Deploy
pulumi up
```

### 2. Update Worker Configuration

Edit `cloudflare/worker/wrangler.toml`:

```toml
name = "kuzu-auth-prod-worker"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "prod"
MAX_GRAPH_SIZE = "1000000"
BACKUP_INTERVAL = "3600"
```

### 3. Deploy Production Worker

```bash
cd cloudflare/worker
npm run deploy -- --env prod
```

### 4. Configure Custom Domain

In Cloudflare Dashboard:

1. Go to Workers & Pages
2. Select your worker
3. Add custom domain: `auth.your-domain.com`

Or use Pulumi (already configured if you set the domain in Step 1).

## Monitoring and Observability

### Cloudflare Analytics

View metrics in the Cloudflare dashboard:

- Workers & Pages > Your Worker > Metrics
- Real-time logs with `wrangler tail`

### Custom Logging

```bash
# Stream logs in real-time
wrangler tail kuzu-auth-prod-worker

# Filter logs
wrangler tail kuzu-auth-prod-worker --status error
```

### Health Checks

```bash
# Basic health check
curl https://auth.your-domain.com/health

# Stats endpoint
curl https://auth.your-domain.com/stats
```

## Scaling Considerations

### Memory Limits

Cloudflare Workers have a **128MB memory limit**. Strategies:

1. **Limit graph size**: Set `MAX_GRAPH_SIZE` environment variable
2. **Partition large graphs**: Use multiple Durable Object instances
3. **Lazy loading**: Load subgraphs on demand from R2
4. **Cache hot permissions**: Use KV for frequently checked permissions

### CPU Time

- Free plan: 10ms CPU time per request
- Paid plan: 50ms CPU time per request (can be increased)

### Durable Objects

- Each DO has 1GB storage limit
- Strong consistency within a single DO
- Use multiple DOs for horizontal scaling

### Rate Limits

- Free: 100,000 requests/day
- Paid: 10 million requests/month (can be increased)

## Backup and Recovery

### Automatic Backups

The system automatically backs up to R2 every hour (configurable via `BACKUP_INTERVAL`).

### Manual Backup

```bash
# Download backup from R2
wrangler r2 object get kuzu-auth-prod-graph-state/latest-backup.json --file backup.json
```

### Restore from Backup

```bash
# Upload backup to R2
wrangler r2 object put kuzu-auth-prod-graph-state/latest-backup.json --file backup.json

# Durable Object will automatically restore on next initialization
```

## Troubleshooting

### Worker fails to deploy

```bash
# Check wrangler.toml configuration
cat wrangler.toml

# Verify account ID and API token
wrangler whoami

# Check for build errors
npm run build
```

### Memory limit exceeded

- Reduce MAX_GRAPH_SIZE
- Implement graph partitioning
- Use R2 for cold storage with on-demand loading

### High latency

- Check Durable Object location (should be close to users)
- Review query complexity
- Consider caching frequent checks in KV

### Durable Object errors

```bash
# View DO logs
wrangler tail --format pretty

# Check DO storage usage
# (Currently no direct command, check logs for backup size)
```

## Cost Estimation

### Free Tier

- 100,000 requests/day
- Sufficient for development and small projects

### Paid Plan ($5/month + usage)

| Resource        | Free     | Included    | Additional                    |
| --------------- | -------- | ----------- | ----------------------------- |
| Requests        | 100k/day | 10M/month   | $0.50/M                       |
| Duration        | 10ms CPU | 50ms CPU    | $0.02/M CPU-ms                |
| Durable Objects | 0        | 1M requests | $0.15/M                       |
| R2 Storage      | 10 GB    | 10 GB       | $0.015/GB                     |
| R2 Operations   | 1M       | 1M          | $0.36/M writes, $0.04/M reads |

**Example costs for 1M requests/month:**

- Workers: Included (first 10M free)
- Durable Objects: $0.15
- R2 Storage (100MB): < $0.01
- R2 Operations: ~$0.05
- **Total: ~$5.20/month**

## Security Recommendations

1. **Enable API Authentication**

   ```typescript
   const client = new AuthClient({
     workerUrl: "https://auth.your-domain.com",
     apiKey: "your-secret-api-key",
   });
   ```

2. **Use Custom Domain with TLS**

   - Configure in Cloudflare Dashboard
   - Enforces HTTPS

3. **Rate Limiting**

   - Implement in Worker code
   - Use Cloudflare's built-in rate limiting

4. **Audit Logging**
   - Log all grant/revoke operations
   - Use Workers Analytics for monitoring

## Next Steps

1. **Run load tests** to validate performance
2. **Set up monitoring** and alerts
3. **Implement audit logging** for compliance
4. **Add API authentication** for production use
5. **Configure backup schedule** for data durability

## Support

For issues or questions:

- Check the main README.md
- Review Cloudflare Workers documentation
- Open an issue on GitHub
