# Cloudflare Infrastructure with Pulumi

This directory contains Pulumi Infrastructure as Code (IaC) for deploying the Kuzu Auth Cloudflare Worker and related resources.

## Prerequisites

1. **Install Pulumi**: https://www.pulumi.com/docs/get-started/install/

   ```bash
   curl -fsSL https://get.pulumi.com | sh
   ```

2. **Install Wrangler**:

   ```bash
   npm install -g wrangler
   ```

3. **Get Cloudflare Credentials**:
   - Account ID: https://dash.cloudflare.com/ (right sidebar)
   - API Token: https://dash.cloudflare.com/profile/api-tokens
     - Create token with permissions:
       - Workers Scripts: Edit
       - Account Settings: Read
       - R2: Edit
       - Durable Objects: Edit

## Quick Start

### First Time Setup

1. **Login to Pulumi**:

   ```bash
   pulumi login
   ```

   You can use local state or Pulumi Cloud (free for individuals).

2. **Configure Cloudflare**:

   ```bash
   cd cloudflare/pulumi
   pulumi stack select dev  # or create new stack

   # Set your Cloudflare Account ID
   pulumi config set cloudflare:accountId YOUR_ACCOUNT_ID

   # Set your Cloudflare API Token (stored encrypted)
   pulumi config set cloudflare:apiToken YOUR_API_TOKEN --secret
   ```

3. **Deploy Everything**:

   ```bash
   ./deploy.sh
   ```

   This will:

   - Create R2 bucket for graph storage
   - Deploy Worker with Durable Objects
   - Set up KV namespaces
   - Configure bindings
   - Deploy your worker code

### Subsequent Deployments

Just run:

```bash
./deploy.sh
```

### Clean Rebuild

To completely tear down and redeploy (useful for fixing Durable Object caching issues):

```bash
# Destroy everything
./destroy.sh

# Wait 30 seconds for propagation
sleep 30

# Redeploy fresh
./deploy.sh
```

## Common Tasks

### Deploy Worker Code Only

If you've only changed worker code (not infrastructure):

```bash
cd ../worker
npm run build
npx wrangler deploy
```

### View Deployment Status

```bash
pulumi stack
```

### See Live Logs

```bash
cd ../worker
npx wrangler tail kuzu-auth-dev-worker
```

### Update Configuration

```bash
# Change environment
pulumi config set kuzu-auth:environment staging

# Add custom domain
pulumi config set kuzu-auth:domain example.com

# Then redeploy
pulumi up
```

## Stacks

Pulumi stacks allow multiple isolated environments:

- `dev` - Development environment (default)
- `staging` - Staging environment
- `prod` - Production environment

Create a new stack:

```bash
pulumi stack init staging
pulumi config set kuzu-auth:environment staging
pulumi config set cloudflare:accountId YOUR_ACCOUNT_ID
pulumi config set cloudflare:apiToken YOUR_API_TOKEN --secret
./deploy.sh staging
```

## Troubleshooting

### Durable Object Caching Issues

If WebSocket connections fail with old code after deployment:

```bash
# Complete teardown and rebuild
./destroy.sh
sleep 30
./deploy.sh
```

This creates fresh Durable Object instances.

### Configuration Issues

View current configuration:

```bash
pulumi config
```

Reset configuration:

```bash
pulumi config rm cloudflare:accountId
pulumi config rm cloudflare:apiToken
```

### State Issues

If Pulumi state gets corrupted:

```bash
pulumi refresh
```

## Architecture

The Pulumi configuration creates:

1. **R2 Bucket** (`kuzu-auth-dev-graph-state`)

   - Stores graph CSV files
   - Auto-location selection

2. **Worker Script** (`kuzu-auth-dev-worker`)

   - Module-type worker
   - Durable Objects enabled
   - R2 and KV bindings

3. **Durable Objects**

   - `GraphStateCSV` - Main graph state management
   - Per-organization isolation
   - SQLite storage for mutation log

4. **Worker Domain** (`kuzu-auth-dev-worker.workers.dev`)

   - Always available
   - No custom domain required

5. **KV Namespace** (created by wrangler)
   - Backup storage for mutations
   - Created during first worker deploy

## File Structure

```
pulumi/
├── Pulumi.yaml           # Project configuration
├── Pulumi.dev.yaml       # Dev stack configuration
├── index.ts              # Infrastructure definition
├── package.json          # Node dependencies
├── deploy.sh             # Deploy script
├── destroy.sh            # Cleanup script
└── README.md             # This file
```

## Outputs

After deployment, Pulumi provides:

- `workerUrl` - Your worker's public URL
- `workerName` - Worker name for wrangler commands
- `bucketName` - R2 bucket name
- `deploymentEnvironment` - Current environment

Access outputs:

```bash
pulumi stack output workerUrl
```

## Cost

All resources are on Cloudflare's free tier:

- Workers: 100,000 requests/day
- R2: 10 GB storage free
- Durable Objects: 1 million requests/month free
- KV: 100,000 reads/day free

## Next Steps

After deployment:

1. **Test the worker**:

   ```bash
   WORKER_URL=$(pulumi stack output workerUrl)
   curl $WORKER_URL/health
   ```

2. **Run benchmarks**:

   ```bash
   cd ../../client
   npm run benchmark
   ```

3. **Monitor logs**:
   ```bash
   cd ../cloudflare/worker
   npx wrangler tail $(pulumi stack output workerName --cwd ../pulumi)
   ```

## Resources

- [Pulumi Cloudflare Provider](https://www.pulumi.com/registry/packages/cloudflare/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Durable Objects Guide](https://developers.cloudflare.com/durable-objects/)
- [R2 Storage Docs](https://developers.cloudflare.com/r2/)
