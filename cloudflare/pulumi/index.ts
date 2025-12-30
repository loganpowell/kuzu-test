import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

// Configuration
const config = new pulumi.Config("kuzu-auth");
const environment = config.get("environment") || "dev";
const customDomain = config.get("domain");
const cfConfig = new pulumi.Config("cloudflare");
const accountId = cfConfig.require("accountId");

// Naming convention
const resourceName = (name: string) => `kuzu-auth-${environment}-${name}`;

// ============================================================================
// R2 Bucket for Graph Persistence
// ============================================================================

const graphBucket = new cloudflare.R2Bucket(resourceName("graph-state"), {
  accountId: accountId,
  name: resourceName("graph-state"),
  location: "auto", // Cloudflare picks optimal location
});

// ============================================================================
// Durable Object Namespace
// ============================================================================

// Note: Durable Objects are defined in the Worker script itself.
// This is a placeholder for future expansion if we need multiple DO namespaces.

// ============================================================================
// Worker Script
// ============================================================================

const workerScript = new cloudflare.WorkerScript(resourceName("worker"), {
  accountId: accountId,
  name: resourceName("worker"),
  content: pulumi.interpolate`
    // This will be replaced by the actual built worker script during deployment
    // For now, this is a placeholder that will be updated by wrangler
    export default {
      async fetch(request, env, ctx) {
        return new Response("Worker not deployed yet. Run 'npm run deploy' in the worker directory.", { status: 503 });
      }
    }
  `,
  module: true,
  compatibilityDate: "2024-01-01",
  compatibilityFlags: ["nodejs_compat"],

  // Bind R2 bucket
  r2BucketBindings: [
    {
      name: "GRAPH_STATE",
      bucketName: graphBucket.name,
    },
  ],

  // Environment variables
  plainTextBindings: [
    {
      name: "ENVIRONMENT",
      text: environment,
    },
  ],

  // Durable Object bindings (defined in worker script)
  durableObjectBindings: [
    {
      name: "GRAPH_STATE_DO",
      className: "GraphStateCSV",
      scriptName: resourceName("worker"),
    },
  ],
});

// ============================================================================
// Worker Route (if custom domain provided)
// ============================================================================

let workerRoute: cloudflare.WorkerRoute | undefined;

if (customDomain) {
  // Get zone ID for the domain
  const zone = cloudflare.getZone({
    name: customDomain,
  });

  workerRoute = new cloudflare.WorkerRoute(resourceName("route"), {
    zoneId: zone.then((z) => z.id),
    pattern: `auth.${customDomain}/*`,
    scriptName: workerScript.name,
  });
}

// ============================================================================
// Workers Subdomain (always available)
// ============================================================================

const workerDomain = new cloudflare.WorkerDomain(resourceName("domain"), {
  accountId: accountId,
  hostname: `${resourceName("worker")}.workers.dev`,
  service: workerScript.name,
  zoneId: "workers.dev",
});

// ============================================================================
// Outputs
// ============================================================================

export const workerUrl = customDomain
  ? pulumi.interpolate`https://auth.${customDomain}`
  : pulumi.interpolate`https://${workerDomain.hostname}`;

export const bucketName = graphBucket.name;
export const workerName = workerScript.name;
export const deploymentEnvironment = environment;

// Export instructions
export const nextSteps = pulumi.interpolate`
Cloudflare infrastructure deployed successfully!

Worker URL: ${workerUrl}
R2 Bucket: ${bucketName}
Environment: ${environment}

Next steps:
1. Deploy the Worker code:
   cd ../worker
   npm install
   npm run build
   npm run deploy

2. Test the deployment:
   curl ${workerUrl}/health

3. Use the SDK:
   npm install @kuzu-auth/sdk
   
   import { AuthClient } from '@kuzu-auth/sdk';
   const client = new AuthClient({ workerUrl: '${workerUrl}' });
`;
