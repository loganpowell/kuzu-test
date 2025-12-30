#!/bin/bash
set -e

# Cloudflare Cleanup Script
# Destroys ALL infrastructure for clean redeployment

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PULUMI_DIR="$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧹 Kuzu Auth Infrastructure Cleanup"
echo "==================================="

cd "$PULUMI_DIR"

# Select stack
STACK="${1:-dev}"
echo -e "${YELLOW}📦 Using stack: $STACK${NC}"

# Check if stack exists
if ! pulumi stack select "$STACK" 2>/dev/null; then
    echo -e "${RED}❌ Stack '$STACK' not found${NC}"
    echo "Available stacks:"
    pulumi stack ls
    exit 1
fi

# Get resource info before destroying
WORKER_NAME=$(pulumi stack output workerName 2>/dev/null || echo "unknown")

echo ""
echo -e "${RED}⚠️  WARNING: This will destroy ALL infrastructure for stack '$STACK'${NC}"
echo ""
echo "This includes:"
echo "  - Worker: $WORKER_NAME"
echo "  - R2 Bucket (and all data)"
echo "  - Durable Objects (and all state)"
echo "  - KV Namespaces"
echo ""
read -p "Are you sure? Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${YELLOW}🗑️  Destroying infrastructure...${NC}"

# Destroy with Pulumi
pulumi destroy --yes

echo ""
echo -e "${GREEN}✅ Infrastructure destroyed!${NC}"
echo ""
echo "To redeploy:"
echo "  ./deploy.sh $STACK"
