/**
 * Cloudflare Worker for Multi-Tenant Authorization with KuzuDB WASM
 *
 * Routes requests to per-organization Durable Objects
 * Each org gets its own KuzuDB instance with isolated data
 */

export interface Env {
  GRAPH_STATE_DO: DurableObjectNamespace;
  GRAPH_STATE: R2Bucket;
  ENVIRONMENT: string;
}

// Export all DO implementations
export { GraphState } from "./durable-objects/graph-state";
export { GraphStateKuzu } from "./durable-objects/graph-state-kuzu"; // Keep for backwards compatibility
export { GraphStateCSV } from "./durable-objects/graph-state-csv";

/**
 * Extract organization ID from request
 * Supports: /org/acme/check or header X-Org-Id
 */
function extractOrgId(request: Request): string {
  const url = new URL(request.url);

  // Try path: /org/{orgId}/...
  const pathMatch = url.pathname.match(/^\/org\/([^\/]+)/);
  if (pathMatch) {
    return `org_${pathMatch[1]}`;
  }

  // Try header
  const headerOrg = request.headers.get("X-Org-Id");
  if (headerOrg) {
    return `org_${headerOrg}`;
  }

  // Default org for testing
  return "org_default";
}

/**
 * Main Worker entry point
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Org-Id",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check
      if (path === "/health") {
        return jsonResponse(
          { status: "healthy", environment: env.ENVIRONMENT },
          { headers: corsHeaders }
        );
      }

      // Extract organization ID
      const orgId = extractOrgId(request);

      // Get org-specific Durable Object
      const id = env.GRAPH_STATE_DO.idFromName(orgId);
      const stub = env.GRAPH_STATE_DO.get(id);

      // Strip /org/{orgId} prefix from path for forwarding
      let forwardPath = path.replace(/^\/org\/[^\/]+/, "");
      if (!forwardPath) forwardPath = "/";

      // Create new URL with stripped path
      const forwardUrl = new URL(forwardPath, url.origin);
      forwardUrl.search = url.search;

      // Forward to Durable Object
      const doRequest = new Request(forwardUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      const response = await stub.fetch(doRequest);

      // Add CORS headers to response
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });

      Object.entries(corsHeaders).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
      });

      return newResponse;
    } catch (error) {
      console.error("Worker error:", error);
      return jsonResponse(
        {
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};

/**
 * Helper to create JSON response
 */
function jsonResponse(data: any, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}
