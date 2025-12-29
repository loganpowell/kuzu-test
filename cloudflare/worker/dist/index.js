var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/durable-objects/graph-state.ts
var GraphState = class {
  state;
  env;
  // TODO: Add KuzuDB WASM integration
  // For now, using simple in-memory map for testing
  permissions = /* @__PURE__ */ new Map();
  initialized = false;
  lastBackup = 0;
  recordCount = 0;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      await this.initialize();
    });
  }
  /**
   * Initialize graph state
   */
  async initialize() {
    if (this.initialized)
      return;
    console.log("[GraphState] Initializing...");
    try {
      await this.restoreFromBackup();
      this.initialized = true;
      console.log("[GraphState] Initialization complete");
    } catch (error) {
      console.error("[GraphState] Initialization failed:", error);
      throw error;
    }
  }
  /**
   * Create the authorization graph schema
   * TODO: Replace with KuzuDB schema when WASM is integrated
   */
  async createSchema() {
    console.log("[GraphState] Schema created (in-memory)");
  }
  /**
   * Handle incoming requests
   */
  async fetch(request) {
    if (!this.initialized) {
      return this.jsonResponse({ error: "Not initialized" }, 503);
    }
    try {
      const body = await request.json();
      const { action } = body;
      switch (action) {
        case "check":
          return await this.handleCheck(body);
        case "grant":
          return await this.handleGrant(body);
        case "revoke":
          return await this.handleRevoke(body);
        case "list":
          return await this.handleList(body);
        case "bulk":
          return await this.handleBulk(body);
        case "stats":
          return await this.handleStats();
        default:
          return this.jsonResponse({ error: "Unknown action" }, 400);
      }
    } catch (error) {
      console.error("[GraphState] Request error:", error);
      return this.jsonResponse(
        { error: "Request failed", message: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  }
  /**
   * Check if user has permission on resource
   * Simple in-memory check for now
   */
  async handleCheck(body) {
    const { user, permission, resource } = body;
    try {
      const key = `${user}:${permission}:${resource}`;
      const allowed = this.permissions.has(key);
      return this.jsonResponse({ allowed });
    } catch (error) {
      console.error("[GraphState] Check error:", error);
      return this.jsonResponse({ allowed: false, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  /**
   * Grant permission
   */
  async handleGrant(body) {
    const { user, permission, resource } = body;
    try {
      const key = `${user}:${permission}:${resource}`;
      this.permissions.add(key);
      this.recordCount++;
      await this.maybeBackup();
      return this.jsonResponse({ success: true, user, permission, resource });
    } catch (error) {
      console.error("[GraphState] Grant error:", error);
      return this.jsonResponse({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  }
  /**
   * Revoke permission
   */
  async handleRevoke(body) {
    const { user, permission, resource } = body;
    try {
      const key = `${user}:${permission}:${resource}`;
      if (this.permissions.delete(key)) {
        this.recordCount--;
      }
      await this.maybeBackup();
      return this.jsonResponse({ success: true, user, permission, resource });
    } catch (error) {
      console.error("[GraphState] Revoke error:", error);
      return this.jsonResponse({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  }
  /**
   * List permissions for user or resource
   */
  async handleList(body) {
    const { user, resource } = body;
    try {
      const permissions = [];
      for (const key of this.permissions.keys()) {
        const [u, perm, res] = key.split(":");
        if (user && u === user) {
          permissions.push({ resource: res, permission: perm });
        } else if (resource && res === resource) {
          permissions.push({ user: u, permission: perm });
        }
      }
      return this.jsonResponse({ permissions });
    } catch (error) {
      console.error("[GraphState] List error:", error);
      return this.jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  }
  /**
   * Handle bulk operations
   */
  async handleBulk(body) {
    const { operations } = body;
    const results = [];
    for (const op of operations) {
      try {
        let result;
        switch (op.action) {
          case "grant":
            result = await this.handleGrant(op);
            break;
          case "revoke":
            result = await this.handleRevoke(op);
            break;
          case "check":
            result = await this.handleCheck(op);
            break;
          default:
            result = this.jsonResponse({ error: "Unknown action" }, 400);
        }
        results.push(await result.json());
      } catch (error) {
        results.push({ error: error instanceof Error ? error.message : "Unknown error" });
      }
    }
    return this.jsonResponse({ results });
  }
  /**
   * Get stats about the graph
   */
  async handleStats() {
    try {
      const users = /* @__PURE__ */ new Set();
      const resources = /* @__PURE__ */ new Set();
      for (const key of this.permissions.keys()) {
        const [user, , resource] = key.split(":");
        users.add(user);
        resources.add(resource);
      }
      return this.jsonResponse({
        users: users.size,
        resources: resources.size,
        permissions: this.permissions.size,
        recordCount: this.recordCount,
        lastBackup: this.lastBackup
      });
    } catch (error) {
      console.error("[GraphState] Stats error:", error);
      return this.jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
    }
  }
  /**
   * Backup to R2 if needed
   */
  async maybeBackup() {
    const interval = parseInt(this.env.BACKUP_INTERVAL || "3600", 10) * 1e3;
    const now = Date.now();
    if (now - this.lastBackup > interval) {
      await this.backupToR2();
      this.lastBackup = now;
    }
  }
  /**
   * Backup graph state to R2
   */
  async backupToR2() {
    try {
      const permissionsArray = Array.from(this.permissions.keys());
      const backup = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        permissions: permissionsArray,
        recordCount: this.recordCount
      };
      await this.env.GRAPH_STATE.put("latest-backup.json", JSON.stringify(backup));
      console.log("[GraphState] Backed up to R2");
    } catch (error) {
      console.error("[GraphState] Backup failed:", error);
    }
  }
  /**
   * Restore from R2 backup
   */
  async restoreFromBackup() {
    try {
      const backup = await this.env.GRAPH_STATE.get("latest-backup.json");
      if (!backup) {
        console.log("[GraphState] No backup found");
        return;
      }
      const data = await backup.json();
      console.log("[GraphState] Restoring from backup:", data.timestamp);
      if (data.permissions && Array.isArray(data.permissions)) {
        this.permissions = new Set(data.permissions);
      }
      this.recordCount = data.recordCount || 0;
      this.lastBackup = Date.now();
    } catch (error) {
      console.error("[GraphState] Restore failed:", error);
    }
  }
  /**
   * Export table data
   * Placeholder for future KuzuDB integration
   */
  async exportTable(tableName) {
    return [];
  }
  /**
   * Helper to create JSON response
   */
  jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }
};
__name(GraphState, "GraphState");

// src/index.ts
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      if (path === "/health") {
        return jsonResponse({ status: "healthy", environment: env.ENVIRONMENT }, { headers: corsHeaders });
      }
      const id = env.GRAPH_STATE_DO.idFromName("primary");
      const stub = env.GRAPH_STATE_DO.get(id);
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
      return jsonResponse({ error: "Not found" }, { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error("Worker error:", error);
      return jsonResponse(
        { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
async function handleCheck(request, stub, corsHeaders) {
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
    body: JSON.stringify({ action: "check", user, permission, resource })
  });
  const result = await response.json();
  const duration = Date.now() - startTime;
  return jsonResponse(
    {
      allowed: result.allowed,
      user,
      permission,
      resource,
      latency_ms: duration
    },
    { headers: corsHeaders }
  );
}
__name(handleCheck, "handleCheck");
async function handleGrant(request, stub, corsHeaders) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }
  const body = await request.json();
  if (!body.user || !body.permission || !body.resource) {
    return jsonResponse(
      { error: "Missing required fields: user, permission, resource" },
      { status: 400, headers: corsHeaders }
    );
  }
  const response = await stub.fetch(request.url, {
    method: "POST",
    body: JSON.stringify({ action: "grant", ...body })
  });
  const result = await response.json();
  return jsonResponse(result, { headers: corsHeaders });
}
__name(handleGrant, "handleGrant");
async function handleRevoke(request, stub, corsHeaders) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }
  const body = await request.json();
  if (!body.user || !body.permission || !body.resource) {
    return jsonResponse(
      { error: "Missing required fields: user, permission, resource" },
      { status: 400, headers: corsHeaders }
    );
  }
  const response = await stub.fetch(request.url, {
    method: "POST",
    body: JSON.stringify({ action: "revoke", ...body })
  });
  const result = await response.json();
  return jsonResponse(result, { headers: corsHeaders });
}
__name(handleRevoke, "handleRevoke");
async function handleList(request, stub, corsHeaders) {
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
    body: JSON.stringify({ action: "list", user, resource })
  });
  const result = await response.json();
  return jsonResponse(result, { headers: corsHeaders });
}
__name(handleList, "handleList");
async function handleBulk(request, stub, corsHeaders) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }
  const body = await request.json();
  if (!body.operations || !Array.isArray(body.operations)) {
    return jsonResponse(
      { error: "Missing or invalid operations array" },
      { status: 400, headers: corsHeaders }
    );
  }
  const response = await stub.fetch(request.url, {
    method: "POST",
    body: JSON.stringify({ action: "bulk", operations: body.operations })
  });
  const result = await response.json();
  return jsonResponse(result, { headers: corsHeaders });
}
__name(handleBulk, "handleBulk");
async function handleStats(request, stub, corsHeaders) {
  const response = await stub.fetch(request.url, {
    method: "POST",
    body: JSON.stringify({ action: "stats" })
  });
  const result = await response.json();
  return jsonResponse(result, { headers: corsHeaders });
}
__name(handleStats, "handleStats");
function jsonResponse(data, init) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}
__name(jsonResponse, "jsonResponse");
export {
  GraphState,
  src_default as default
};
//# sourceMappingURL=index.js.map
