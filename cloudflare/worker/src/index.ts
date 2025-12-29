/**
 * Cloudflare Worker for Zanzibar-inspired Authorization
 *
 * Handles permission checks using KuzuDB WASM running in-memory.
 * Routes write operations to Durable Objects for consistency.
 */

export interface Env {
  GRAPH_STATE_DO: DurableObjectNamespace;
  GRAPH_STATE: R2Bucket;
  ENVIRONMENT: string;
  MAX_GRAPH_SIZE: string;
  BACKUP_INTERVAL: string;
}

export { GraphState } from "./durable-objects/graph-state";

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

    // CORS headers for SDK compatibility
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

      // Ping endpoint for RTT measurement (Phase 2)
      if (path === "/ping") {
        return jsonResponse({ pong: Date.now() }, { headers: corsHeaders });
      }

      // Echo endpoint for payload testing (Phase 2)
      if (path === "/echo" && request.method === "POST") {
        const body = await request.json();
        return jsonResponse(
          { echo: body, timestamp: Date.now() },
          { headers: corsHeaders }
        );
      }

      // Serve CSV data for an organization (Phase 2)
      // Pattern: /org/{orgId}/csv
      const csvMatch = path.match(/^\/org\/([^/]+)\/csv$/);
      if (csvMatch && request.method === "GET") {
        const orgId = csvMatch[1];
        return handleGetCSV(env, orgId, corsHeaders);
      }

      // Get Durable Object instance (singleton for the entire graph)
      const id = env.GRAPH_STATE_DO.idFromName("primary");
      const stub = env.GRAPH_STATE_DO.get(id);

      // Route based on path
      if (path === "/check") {
        return await handleCheck(request, stub, corsHeaders);
      } else if (path === "/grant") {
        return await handleGrant(request, stub, corsHeaders);
      } else if (path === "/revoke") {
        return await handleRevoke(request, stub, corsHeaders);
      } else if (path === "/list") {
        return await handleList(request, stub, corsHeaders);
      } else if (path === "/bulk") {
        return await handleBulk(request, stub, corsHeaders);
      } else if (path === "/stats") {
        return await handleStats(request, stub, corsHeaders);
      }

      return jsonResponse(
        { error: "Not found" },
        { status: 404, headers: corsHeaders }
      );
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
 * Handle permission check
 * GET/POST /check?user=user:alice&permission=read&resource=resource:doc123
 */
async function handleCheck(
  request: Request,
  stub: DurableObjectStub,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const user = url.searchParams.get("user");
  const permission = url.searchParams.get("permission");
  const resource = url.searchParams.get("resource");

  if (!user || !permission || !resource) {
    return jsonResponse(
      { error: "Missing required parameters: user, permission, resource" },
      { status: 400, headers: corsHeaders }
    );
  }

  const startTime = Date.now();
  const response = await stub.fetch(request.url, {
    method: "POST",
    body: JSON.stringify({ action: "check", user, permission, resource }),
  });

  const result = await response.json<{ allowed: boolean }>();
  const duration = Date.now() - startTime;

  return jsonResponse(
    {
      allowed: result.allowed,
      user,
      permission,
      resource,
      latency_ms: duration,
    },
    { headers: corsHeaders }
  );
}

/**
 * Handle grant permission
 * POST /grant { user, permission, resource }
 */
async function handleGrant(
  request: Request,
  stub: DurableObjectStub,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  const body = await request.json<{
    user: string;
    permission: string;
    resource: string;
  }>();

  if (!body.user || !body.permission || !body.resource) {
    return jsonResponse(
      { error: "Missing required fields: user, permission, resource" },
      { status: 400, headers: corsHeaders }
    );
  }

  const response = await stub.fetch(request.url, {
    method: "POST",
    body: JSON.stringify({ action: "grant", ...body }),
  });

  const result = await response.json();
  return jsonResponse(result, { headers: corsHeaders });
}

/**
 * Handle revoke permission
 * POST /revoke { user, permission, resource }
 */
async function handleRevoke(
  request: Request,
  stub: DurableObjectStub,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  const body = await request.json<{
    user: string;
    permission: string;
    resource: string;
  }>();

  if (!body.user || !body.permission || !body.resource) {
    return jsonResponse(
      { error: "Missing required fields: user, permission, resource" },
      { status: 400, headers: corsHeaders }
    );
  }

  const response = await stub.fetch(request.url, {
    method: "POST",
    body: JSON.stringify({ action: "revoke", ...body }),
  });

  const result = await response.json();
  return jsonResponse(result, { headers: corsHeaders });
}

/**
 * Handle list permissions
 * GET /list?user=user:alice or GET /list?resource=resource:doc123
 */
async function handleList(
  request: Request,
  stub: DurableObjectStub,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const user = url.searchParams.get("user");
  const resource = url.searchParams.get("resource");

  if (!user && !resource) {
    return jsonResponse(
      { error: "Must provide either user or resource parameter" },
      { status: 400, headers: corsHeaders }
    );
  }

  const response = await stub.fetch(request.url, {
    method: "POST",
    body: JSON.stringify({ action: "list", user, resource }),
  });

  const result = await response.json();
  return jsonResponse(result, { headers: corsHeaders });
}

/**
 * Handle bulk operations
 * POST /bulk { operations: [{ action, user, permission, resource }] }
 */
async function handleBulk(
  request: Request,
  stub: DurableObjectStub,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  const body = await request.json<{ operations: Array<any> }>();

  if (!body.operations || !Array.isArray(body.operations)) {
    return jsonResponse(
      { error: "Missing or invalid operations array" },
      { status: 400, headers: corsHeaders }
    );
  }

  const response = await stub.fetch(request.url, {
    method: "POST",
    body: JSON.stringify({ action: "bulk", operations: body.operations }),
  });

  const result = await response.json();
  return jsonResponse(result, { headers: corsHeaders });
}

/**
 * Handle CSV data serving (Phase 2)
 * GET /org/{orgId}/csv
 */
async function handleGetCSV(
  env: Env,
  orgId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const tables = [
    "users",
    "groups",
    "resources",
    "member_of",
    "inherits_from",
    "user_permissions",
    "group_permissions",
  ];

  const csvData: Record<string, string> = {};

  for (const table of tables) {
    const key = `${orgId}/${table}.csv`;
    const obj = await env.GRAPH_STATE.get(key);

    if (obj) {
      csvData[table] = await obj.text();
    }
  }

  return jsonResponse(csvData, {
    headers: {
      ...corsHeaders,
      "Cache-Control": "public, max-age=60",
    },
  });
}

/**
 * Handle stats request
 * GET /stats
 */
async function handleStats(
  request: Request,
  stub: DurableObjectStub,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const response = await stub.fetch(request.url, {
    method: "POST",
    body: JSON.stringify({ action: "stats" }),
  });

  const result = await response.json();
  return jsonResponse(result, { headers: corsHeaders });
}

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
