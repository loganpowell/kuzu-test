// src/durable-objects/graph-state.ts
var GraphState = class {
  state;
  env;
  // TODO: Add KuzuDB WASM integration
  // For now, using simple in-memory set for testing
  permissions = /* @__PURE__ */ new Set();
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
        {
          error: "Request failed",
          message: error instanceof Error ? error.message : "Unknown error"
        },
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
      return this.jsonResponse({
        allowed: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
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
      return this.jsonResponse(
        {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        },
        500
      );
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
      return this.jsonResponse(
        {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        },
        500
      );
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
      return this.jsonResponse(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
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
        results.push({
          error: error instanceof Error ? error.message : "Unknown error"
        });
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
      return this.jsonResponse(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
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
      await this.env.GRAPH_STATE.put(
        "latest-backup.json",
        JSON.stringify(backup)
      );
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

// src/durable-objects/graph-state-csv.ts
var GraphStateCSV = class {
  state;
  env;
  orgId;
  initialized = false;
  // Indexes (same as test-graph-data.ts)
  memberOfIndex = /* @__PURE__ */ new Map();
  inheritsFromIndex = /* @__PURE__ */ new Map();
  userPermIndex = /* @__PURE__ */ new Map();
  groupPermIndex = /* @__PURE__ */ new Map();
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.orgId = state.id.name || "org_default";
    console.log(`[GraphStateCSV] Constructed for ${this.orgId}`);
  }
  /**
   * Handle incoming requests
   */
  async fetch(request) {
    try {
      await this.ensureInitialized();
      const url = new URL(request.url);
      const path = url.pathname;
      if (path === "/check" || path.endsWith("/check")) {
        return await this.handleCheck(request);
      } else if (path === "/stats" || path.endsWith("/stats")) {
        return await this.handleStats();
      } else if (path === "/grant" || path.endsWith("/grant")) {
        return await this.handleGrant(request);
      }
      return this.jsonResponse({ error: "Unknown path" }, 400);
    } catch (error) {
      console.error(`[GraphStateCSV ${this.orgId}] Request error:`, error);
      return this.jsonResponse(
        {
          error: "Request failed",
          message: error instanceof Error ? error.message : "Unknown error"
        },
        500
      );
    }
  }
  /**
   * Lazy initialization
   */
  async ensureInitialized() {
    if (this.initialized)
      return;
    console.log(`[GraphStateCSV ${this.orgId}] Initializing...`);
    const startTime = Date.now();
    try {
      await this.loadDataFromR2();
      this.initialized = true;
      const duration = Date.now() - startTime;
      console.log(
        `[GraphStateCSV ${this.orgId}] Initialization complete in ${duration}ms`
      );
    } catch (error) {
      console.error(
        `[GraphStateCSV ${this.orgId}] Initialization failed:`,
        error
      );
      throw error;
    }
  }
  /**
   * Load CSV data from R2 and build indexes
   */
  async loadDataFromR2() {
    const memberOfObj = await this.env.GRAPH_STATE.get(
      `${this.orgId}/member_of.csv`
    );
    if (memberOfObj) {
      const csv = await memberOfObj.text();
      const lines = csv.trim().split("\n").slice(1);
      for (const line of lines) {
        const [userId, groupId] = this.parseCSVLine(line);
        if (!this.memberOfIndex.has(userId)) {
          this.memberOfIndex.set(userId, /* @__PURE__ */ new Set());
        }
        this.memberOfIndex.get(userId).add(groupId);
      }
      console.log(
        `[GraphStateCSV ${this.orgId}] Loaded ${lines.length} member_of relationships`
      );
    }
    const inheritsObj = await this.env.GRAPH_STATE.get(
      `${this.orgId}/inherits_from.csv`
    );
    if (inheritsObj) {
      const csv = await inheritsObj.text();
      const lines = csv.trim().split("\n").slice(1);
      for (const line of lines) {
        const [fromGroup, toGroup] = this.parseCSVLine(line);
        this.inheritsFromIndex.set(fromGroup, toGroup);
      }
      console.log(
        `[GraphStateCSV ${this.orgId}] Loaded ${lines.length} inherits_from relationships`
      );
    }
    const userPermObj = await this.env.GRAPH_STATE.get(
      `${this.orgId}/user_permissions.csv`
    );
    if (userPermObj) {
      const csv = await userPermObj.text();
      const lines = csv.trim().split("\n").slice(1);
      for (const line of lines) {
        const [
          userId,
          resourceId,
          canCreate,
          canRead,
          canUpdate,
          canDelete,
          grantedAt,
          grantedBy
        ] = this.parseCSVLine(line);
        if (!this.userPermIndex.has(userId)) {
          this.userPermIndex.set(userId, /* @__PURE__ */ new Map());
        }
        this.userPermIndex.get(userId).set(resourceId, {
          can_create: canCreate === "True" || canCreate === "true",
          can_read: canRead === "True" || canRead === "true",
          can_update: canUpdate === "True" || canUpdate === "true",
          can_delete: canDelete === "True" || canDelete === "true",
          granted_at: grantedAt || "",
          granted_by: grantedBy || ""
        });
      }
      console.log(
        `[GraphStateCSV ${this.orgId}] Loaded ${lines.length} user permissions`
      );
    }
    const groupPermObj = await this.env.GRAPH_STATE.get(
      `${this.orgId}/group_permissions.csv`
    );
    if (groupPermObj) {
      const csv = await groupPermObj.text();
      const lines = csv.trim().split("\n").slice(1);
      for (const line of lines) {
        const [
          groupId,
          resourceId,
          canCreate,
          canRead,
          canUpdate,
          canDelete,
          grantedAt,
          grantedBy
        ] = this.parseCSVLine(line);
        if (!this.groupPermIndex.has(groupId)) {
          this.groupPermIndex.set(groupId, /* @__PURE__ */ new Map());
        }
        this.groupPermIndex.get(groupId).set(resourceId, {
          can_create: canCreate === "True" || canCreate === "true",
          can_read: canRead === "True" || canRead === "true",
          can_update: canUpdate === "True" || canUpdate === "true",
          can_delete: canDelete === "True" || canDelete === "true",
          granted_at: grantedAt || "",
          granted_by: grantedBy || ""
        });
      }
      console.log(
        `[GraphStateCSV ${this.orgId}] Loaded ${lines.length} group permissions`
      );
    }
  }
  /**
   * Parse CSV line handling quoted fields
   */
  parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }
  /**
   * Check permission with transitive group resolution
   * (Same logic as test-graph-data.ts)
   */
  async handleCheck(request) {
    try {
      const body = await request.json();
      const { user, resource, action } = body;
      if (!user || !resource || !action) {
        return this.jsonResponse({ error: "Missing parameters" }, 400);
      }
      const allowed = this.checkPermission(user, resource, action);
      return this.jsonResponse({ allowed });
    } catch (error) {
      console.error(`[GraphStateCSV ${this.orgId}] Check error:`, error);
      return this.jsonResponse({
        allowed: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
  /**
   * Check permission logic (same as test-graph-data.ts)
   */
  checkPermission(userId, resource, action) {
    const permKey = `can_${action}`;
    const userPerms = this.userPermIndex.get(userId)?.get(resource);
    if (userPerms && userPerms[permKey]) {
      return true;
    }
    const userGroups = this.memberOfIndex.get(userId);
    if (!userGroups) {
      return false;
    }
    const allGroups = /* @__PURE__ */ new Set();
    const queue = Array.from(userGroups);
    while (queue.length > 0) {
      const groupId = queue.shift();
      if (allGroups.has(groupId))
        continue;
      allGroups.add(groupId);
      const parentGroup = this.inheritsFromIndex.get(groupId);
      if (parentGroup) {
        queue.push(parentGroup);
      }
    }
    for (const groupId of allGroups) {
      const groupPerms = this.groupPermIndex.get(groupId)?.get(resource);
      if (groupPerms && groupPerms[permKey]) {
        return true;
      }
    }
    return false;
  }
  /**
   * Grant permission (simplified - just adds to index)
   */
  async handleGrant(request) {
    try {
      const body = await request.json();
      const { user, permission, resource } = body;
      if (!user || !permission || !resource) {
        return this.jsonResponse({ error: "Missing parameters" }, 400);
      }
      if (!this.userPermIndex.has(user)) {
        this.userPermIndex.set(user, /* @__PURE__ */ new Map());
      }
      const perm = {
        can_create: permission === "create",
        can_read: permission === "read",
        can_update: permission === "update",
        can_delete: permission === "delete",
        granted_at: (/* @__PURE__ */ new Date()).toISOString(),
        granted_by: "system"
      };
      this.userPermIndex.get(user).set(resource, perm);
      return this.jsonResponse({ success: true, user, permission, resource });
    } catch (error) {
      console.error(`[GraphStateCSV ${this.orgId}] Grant error:`, error);
      return this.jsonResponse(
        {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        },
        500
      );
    }
  }
  /**
   * Get stats
   */
  async handleStats() {
    try {
      return this.jsonResponse({
        orgId: this.orgId,
        users: this.userPermIndex.size,
        groups: this.groupPermIndex.size,
        memberOfRelationships: Array.from(this.memberOfIndex.values()).reduce(
          (sum, set) => sum + set.size,
          0
        ),
        inheritsFromRelationships: this.inheritsFromIndex.size,
        userPermissions: Array.from(this.userPermIndex.values()).reduce(
          (sum, map) => sum + map.size,
          0
        ),
        groupPermissions: Array.from(this.groupPermIndex.values()).reduce(
          (sum, map) => sum + map.size,
          0
        )
      });
    } catch (error) {
      console.error(`[GraphStateCSV ${this.orgId}] Stats error:`, error);
      return this.jsonResponse(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
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

// src/index-kuzu.ts
function extractOrgId(request) {
  const url = new URL(request.url);
  const pathMatch = url.pathname.match(/^\/org\/([^\/]+)/);
  if (pathMatch) {
    return `org_${pathMatch[1]}`;
  }
  const headerOrg = request.headers.get("X-Org-Id");
  if (headerOrg) {
    return `org_${headerOrg}`;
  }
  return "org_default";
}
var index_kuzu_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Org-Id"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      if (path === "/health") {
        return jsonResponse(
          { status: "healthy", environment: env.ENVIRONMENT },
          { headers: corsHeaders }
        );
      }
      const orgId = extractOrgId(request);
      const id = env.GRAPH_STATE_DO.idFromName(orgId);
      const stub = env.GRAPH_STATE_DO.get(id);
      let forwardPath = path.replace(/^\/org\/[^\/]+/, "");
      if (!forwardPath)
        forwardPath = "/";
      const forwardUrl = new URL(forwardPath, url.origin);
      forwardUrl.search = url.search;
      const doRequest = new Request(forwardUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      const response = await stub.fetch(doRequest);
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
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
          message: error instanceof Error ? error.message : "Unknown error"
        },
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
function jsonResponse(data, init) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}
export {
  GraphState,
  GraphStateCSV,
  index_kuzu_default as default
};
//# sourceMappingURL=index-kuzu.js.map
