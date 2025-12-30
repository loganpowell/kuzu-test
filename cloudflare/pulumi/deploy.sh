#!/bin/bash
set -e

# Cloudflare Pulumi Deployment Script
# This script manages infrastructure and worker deployment cleanly

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PULUMI_DIR="$SCRIPT_DIR"
WORKER_DIR="$SCRIPT_DIR/../worker"

echo "🚀 Kuzu Auth Cloudflare Deployment"
echo "=================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Pulumi is installed
if ! command -v pulumi &> /dev/null; then
    echo -e "${RED}❌ Pulumi is not installed${NC}"
    echo "Install from: https://www.pulumi.com/docs/get-started/install/"
    exit 1
fi

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Wrangler is not installed${NC}"
    echo "Install: npm install -g wrangler"
    exit 1
fi

cd "$PULUMI_DIR"

# Select stack
STACK="${1:-dev}"
echo -e "${YELLOW}📦 Using stack: $STACK${NC}"

# Login to Pulumi (if needed)
pulumi login || {
    echo -e "${RED}❌ Failed to login to Pulumi${NC}"
    echo "Run: pulumi login"
    exit 1
}

# Select or create stack
pulumi stack select "$STACK" 2>/dev/null || {
    echo -e "${YELLOW}Creating new stack: $STACK${NC}"
    pulumi stack init "$STACK"
}

# Check configuration
if ! pulumi config get cloudflare:accountId &> /dev/null; then
    echo -e "${RED}❌ Cloudflare Account ID not configured${NC}"
    echo "Get your account ID from: https://dash.cloudflare.com/"
    echo "Or run: wrangler whoami"
    read -p "Enter Cloudflare Account ID: " ACCOUNT_ID
    pulumi config set cloudflare:accountId "$ACCOUNT_ID"
fi

if ! pulumi config get cloudflare:apiToken &> /dev/null; then
    echo -e "${RED}❌ Cloudflare API Token not configured${NC}"
    echo "Create a token at: https://dash.cloudflare.com/profile/api-tokens"
    echo "Required permissions: Workers Scripts:Edit, Account Settings:Read, R2:Edit"
    read -sp "Enter Cloudflare API Token: " API_TOKEN
    echo
    pulumi config set cloudflare:apiToken "$API_TOKEN" --secret
fi

# Deploy infrastructure
echo -e "${GREEN}📦 Deploying Cloudflare infrastructure...${NC}"
pulumi up --yes

# Get worker URL
WORKER_URL=$(pulumi stack output workerUrl)
WORKER_NAME=$(pulumi stack output workerName)

echo -e "${GREEN}✅ Infrastructure deployed!${NC}"
echo "Worker URL: $WORKER_URL"
echo "Worker Name: $WORKER_NAME"

# Build and deploy worker code
echo ""
echo -e "${GREEN}🔨 Building worker code...${NC}"
cd "$WORKER_DIR"

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Building worker..."
npm run build

echo -e "${GREEN}🚀 Deploying worker code...${NC}"
npx wrangler deploy

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "🔗 Worker URL: $WORKER_URL"
echo ""
echo "Test it:"
echo "  curl $WORKER_URL/health"
echo ""
echo "To destroy everything:"
echo "  cd $PULUMI_DIR"
echo "  pulumi destroy"
echo ""
echo "To see logs:"
echo "  cd $WORKER_DIR"
echo "  npx wrangler tail $WORKER_NAME"
