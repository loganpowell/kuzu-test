/**
 * Durable Object for Graph State with Real CSV Data
 *
 * Uses Map-based indexes (same as test-graph-data.ts) to validate
 * the full authorization logic with transitive permissions.
 * Loads data from R2 CSV files.
 */

interface Env {
  GRAPH_STATE: R2Bucket;
  PERMISSIONS_KV: KVNamespace;
}

interface Permission {
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  granted_at: string;
  granted_by: string;
}

export class GraphStateCSV {
  private state: DurableObjectState;
  private env: Env;
  private orgId: string;
  private initialized: boolean = false;

  // Indexes (same as test-graph-data.ts)
  private memberOfIndex = new Map<string, Set<string>>();
  private inheritsFromIndex = new Map<string, string>();
  private userPermIndex = new Map<string, Map<string, Permission>>();
  private groupPermIndex = new Map<string, Map<string, Permission>>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.orgId = state.id.name || "org_default";
    console.log(`[GraphStateCSV] Constructed for ${this.orgId}`);
  }

  /**
   * Handle incoming requests
   */
  async fetch(request: Request): Promise<Response> {
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
      } else if (path === "/revoke" || path.endsWith("/revoke")) {
        return await this.handleRevoke(request);
      } else if (path === "/data" || path.endsWith("/data")) {
        return await this.handleDataEndpoint();
      } else if (path === "/csv" || path.endsWith("/csv")) {
        return await this.handleCSVEndpoint();
      }

      return this.jsonResponse({ error: "Unknown path" }, 400);
    } catch (error) {
      console.error(`[GraphStateCSV ${this.orgId}] Request error:`, error);
      return this.jsonResponse(
        {
          error: "Request failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }

  /**
   * Lazy initialization
   */
  private async ensureInitialized() {
    if (this.initialized) return;

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
  private async loadDataFromR2() {
    // Load member_of relationships
    const memberOfObj = await this.env.GRAPH_STATE.get(
      `${this.orgId}/member_of.csv`
    );
    if (memberOfObj) {
      const csv = await memberOfObj.text();
      const lines = csv.trim().split("\n").slice(1); // Skip header

      for (const line of lines) {
        const [userId, groupId] = this.parseCSVLine(line);
        if (!this.memberOfIndex.has(userId)) {
          this.memberOfIndex.set(userId, new Set());
        }
        this.memberOfIndex.get(userId)!.add(groupId);
      }
      console.log(
        `[GraphStateCSV ${this.orgId}] Loaded ${lines.length} member_of relationships`
      );
    }

    // Load inherits_from relationships
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

    // Load user permissions
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
          grantedBy,
        ] = this.parseCSVLine(line);

        if (!this.userPermIndex.has(userId)) {
          this.userPermIndex.set(userId, new Map());
        }

        this.userPermIndex.get(userId)!.set(resourceId, {
          can_create: canCreate === "True" || canCreate === "true",
          can_read: canRead === "True" || canRead === "true",
          can_update: canUpdate === "True" || canUpdate === "true",
          can_delete: canDelete === "True" || canDelete === "true",
          granted_at: grantedAt || "",
          granted_by: grantedBy || "",
        });
      }
      console.log(
        `[GraphStateCSV ${this.orgId}] Loaded ${lines.length} user permissions`
      );
    }

    // Load group permissions
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
          grantedBy,
        ] = this.parseCSVLine(line);

        if (!this.groupPermIndex.has(groupId)) {
          this.groupPermIndex.set(groupId, new Map());
        }

        this.groupPermIndex.get(groupId)!.set(resourceId, {
          can_create: canCreate === "True" || canCreate === "true",
          can_read: canRead === "True" || canRead === "true",
          can_update: canUpdate === "True" || canUpdate === "true",
          can_delete: canDelete === "True" || canDelete === "true",
          granted_at: grantedAt || "",
          granted_by: grantedBy || "",
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
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
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
  private async handleCheck(request: Request): Promise<Response> {
    try {
      const body = await request.json<any>();
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
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Check permission logic (same as test-graph-data.ts)
   */
  private checkPermission(
    userId: string,
    resource: string,
    action: "create" | "read" | "update" | "delete"
  ): boolean {
    const permKey = `can_${action}` as keyof Permission;

    // 1. Check direct user permission
    const userPerms = this.userPermIndex.get(userId)?.get(resource);
    if (userPerms && userPerms[permKey]) {
      return true;
    }

    // 2. Check group permissions (including inherited)
    const userGroups = this.memberOfIndex.get(userId);
    if (!userGroups) {
      return false;
    }

    // Get all groups including inherited ones
    const allGroups = new Set<string>();
    const queue = Array.from(userGroups);

    while (queue.length > 0) {
      const groupId = queue.shift()!;
      if (allGroups.has(groupId)) continue;

      allGroups.add(groupId);

      // Check if this group inherits from another
      const parentGroup = this.inheritsFromIndex.get(groupId);
      if (parentGroup) {
        queue.push(parentGroup);
      }
    }

    // Check permissions for all groups
    for (const groupId of allGroups) {
      const groupPerms = this.groupPermIndex.get(groupId)?.get(resource);
      if (groupPerms && groupPerms[permKey]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Grant permission (stores in memory + DO SQLite + KV)
   */
  private async handleGrant(request: Request): Promise<Response> {
    try {
      const startTime = Date.now();
      const body = await request.json<any>();
      const { user, permission, resource } = body;

      if (!user || !permission || !resource) {
        return this.jsonResponse({ error: "Missing parameters" }, 400);
      }

      // 1. Update in-memory index (fast)
      const memoryStartTime = Date.now();
      if (!this.userPermIndex.has(user)) {
        this.userPermIndex.set(user, new Map());
      }

      const perm: Permission = {
        can_create: permission === "create",
        can_read: permission === "read",
        can_update: permission === "update",
        can_delete: permission === "delete",
        granted_at: new Date().toISOString(),
        granted_by: "system",
      };

      this.userPermIndex.get(user)!.set(resource, perm);
      const memoryTime = Date.now() - memoryStartTime;

      // 2. Write to DO SQLite (durable, fast - survives while DO is active)
      const sqliteStartTime = Date.now();
      const sqliteKey = `perm:${user}:${resource}`;
      await this.state.storage.put(sqliteKey, perm);
      const sqliteTime = Date.now() - sqliteStartTime;

      // 3. Write to KV namespace (async, non-blocking - durable backup)
      const kvKey = `${this.orgId}:perm:${user}:${resource}`;
      this.state.waitUntil(
        this.env.PERMISSIONS_KV.put(kvKey, JSON.stringify(perm))
      );

      const totalTime = Date.now() - startTime;

      return this.jsonResponse({
        success: true,
        user,
        permission,
        resource,
        timing: {
          memoryMs: memoryTime,
          sqliteMs: sqliteTime,
          kvMs: 0, // Async - not blocking response
          totalMs: totalTime,
        },
      });
    } catch (error) {
      console.error(`[GraphStateCSV ${this.orgId}] Grant error:`, error);
      return this.jsonResponse(
        {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }

  /**
   * Revoke permission (removes from memory + DO SQLite + KV)
   */
  private async handleRevoke(request: Request): Promise<Response> {
    try {
      const startTime = Date.now();
      const body = await request.json<any>();
      const { user, permission, resource } = body;

      if (!user || !resource) {
        return this.jsonResponse({ error: "Missing parameters" }, 400);
      }

      // 1. Remove from in-memory index
      const memoryStartTime = Date.now();
      const userPerms = this.userPermIndex.get(user);
      if (userPerms) {
        userPerms.delete(resource);
      }
      const memoryTime = Date.now() - memoryStartTime;

      // 2. Delete from DO SQLite
      const sqliteStartTime = Date.now();
      const sqliteKey = `perm:${user}:${resource}`;
      await this.state.storage.delete(sqliteKey);
      const sqliteTime = Date.now() - sqliteStartTime;

      // 3. Delete from KV namespace (async, non-blocking)
      const kvKey = `${this.orgId}:perm:${user}:${resource}`;
      this.state.waitUntil(this.env.PERMISSIONS_KV.delete(kvKey));

      const totalTime = Date.now() - startTime;

      return this.jsonResponse({
        success: true,
        user,
        resource,
        timing: {
          memoryMs: memoryTime,
          sqliteMs: sqliteTime,
          kvMs: 0, // Async - not blocking response
          totalMs: totalTime,
        },
      });
    } catch (error) {
      console.error(`[GraphStateCSV ${this.orgId}] Revoke error:`, error);
      return this.jsonResponse(
        {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }

  /**
   * Write permission to R2 (append to CSV)
   */
  private async writePermissionToR2(
    user: string,
    resource: string,
    perm: Permission
  ): Promise<void> {
    const key = `${this.orgId}/user_permissions.csv`;
    const existing = await this.env.GRAPH_STATE.get(key);

    // CSV format: user,resource,can_create,can_read,can_update,can_delete,granted_at,granted_by
    const csvRow = `${user},${resource},${perm.can_create},${perm.can_read},${perm.can_update},${perm.can_delete},${perm.granted_at},${perm.granted_by}\n`;

    if (existing) {
      const existingText = await existing.text();
      await this.env.GRAPH_STATE.put(key, existingText + csvRow);
    } else {
      // Create with header
      const header =
        "user,resource,can_create,can_read,can_update,can_delete,granted_at,granted_by\n";
      await this.env.GRAPH_STATE.put(key, header + csvRow);
    }
  }

  /**
   * Remove permission from R2 (filter and rewrite)
   */
  private async removePermissionFromR2(
    user: string,
    resource: string
  ): Promise<void> {
    const key = `${this.orgId}/user_permissions.csv`;
    const existing = await this.env.GRAPH_STATE.get(key);

    if (!existing) return;

    const text = await existing.text();
    const lines = text.split("\n");
    const header = lines[0];

    // Filter out the permission being revoked
    const filtered = lines
      .slice(1)
      .filter((line) => {
        if (!line.trim()) return false;
        const [lineUser, lineResource] = line.split(",");
        return !(lineUser === user && lineResource === resource);
      })
      .join("\n");

    await this.env.GRAPH_STATE.put(key, header + "\n" + filtered + "\n");
  }

  /**
   * Get stats
   */
  private async handleStats(): Promise<Response> {
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
        ),
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
   * Serve graph data in JSON format for client SDK
   */
  private async handleDataEndpoint(): Promise<Response> {
    try {
      // Convert Map-based indexes to arrays for client
      const users: Array<{ id: string }> = [];
      const groups: Array<{ id: string }> = [];
      const resources: Array<{ id: string }> = [];
      const member_of: Array<{ user_id: string; group_id: string }> = [];
      const inherits_from: Array<{
        group_id: string;
        parent_group_id: string;
      }> = [];
      const user_permissions: Array<{
        user_id: string;
        resource_id: string;
        capability: string;
      }> = [];
      const group_permissions: Array<{
        group_id: string;
        resource_id: string;
        capability: string;
      }> = [];

      // Extract unique users
      const userIds = new Set<string>();
      for (const userId of this.userPermIndex.keys()) {
        userIds.add(userId);
      }
      for (const userId of this.memberOfIndex.keys()) {
        userIds.add(userId);
      }
      for (const userId of userIds) {
        users.push({ id: userId });
      }

      // Extract unique groups
      const groupIds = new Set<string>();
      for (const groupId of this.groupPermIndex.keys()) {
        groupIds.add(groupId);
      }
      for (const groupId of this.inheritsFromIndex.keys()) {
        groupIds.add(groupId);
      }
      for (const groups of this.memberOfIndex.values()) {
        for (const groupId of groups) {
          groupIds.add(groupId);
        }
      }
      for (const parentId of this.inheritsFromIndex.values()) {
        groupIds.add(parentId);
      }
      for (const groupId of groupIds) {
        groups.push({ id: groupId });
      }

      // Extract unique resources
      const resourceIds = new Set<string>();
      for (const permissions of this.userPermIndex.values()) {
        for (const resourceId of permissions.keys()) {
          resourceIds.add(resourceId);
        }
      }
      for (const permissions of this.groupPermIndex.values()) {
        for (const resourceId of permissions.keys()) {
          resourceIds.add(resourceId);
        }
      }
      for (const resourceId of resourceIds) {
        resources.push({ id: resourceId, name: resourceId });
      }

      // Extract member_of relationships
      for (const [userId, groupSet] of this.memberOfIndex) {
        for (const groupId of groupSet) {
          member_of.push({ user_id: userId, group_id: groupId });
        }
      }

      // Extract inherits_from relationships
      for (const [groupId, parentId] of this.inheritsFromIndex) {
        inherits_from.push({ group_id: groupId, parent_group_id: parentId });
      }

      // Extract user permissions
      for (const [userId, permissions] of this.userPermIndex) {
        for (const [resourceId, perm] of permissions) {
          if (perm.can_create) {
            user_permissions.push({
              user_id: userId,
              resource_id: resourceId,
              capability: "create",
            });
          }
          if (perm.can_read) {
            user_permissions.push({
              user_id: userId,
              resource_id: resourceId,
              capability: "read",
            });
          }
          if (perm.can_update) {
            user_permissions.push({
              user_id: userId,
              resource_id: resourceId,
              capability: "update",
            });
          }
          if (perm.can_delete) {
            user_permissions.push({
              user_id: userId,
              resource_id: resourceId,
              capability: "delete",
            });
          }
        }
      }

      // Extract group permissions
      for (const [groupId, permissions] of this.groupPermIndex) {
        for (const [resourceId, perm] of permissions) {
          if (perm.can_create) {
            group_permissions.push({
              group_id: groupId,
              resource_id: resourceId,
              capability: "create",
            });
          }
          if (perm.can_read) {
            group_permissions.push({
              group_id: groupId,
              resource_id: resourceId,
              capability: "read",
            });
          }
          if (perm.can_update) {
            group_permissions.push({
              group_id: groupId,
              resource_id: resourceId,
              capability: "update",
            });
          }
          if (perm.can_delete) {
            group_permissions.push({
              group_id: groupId,
              resource_id: resourceId,
              capability: "delete",
            });
          }
        }
      }

      return this.jsonResponse({
        users,
        groups,
        resources,
        member_of,
        inherits_from,
        user_permissions,
        group_permissions,
      });
    } catch (error) {
      console.error(
        `[GraphStateCSV ${this.orgId}] Data endpoint error:`,
        error
      );
      return this.jsonResponse(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  }

  /**
   * Serve raw CSV data for client SDK
   */
  private async handleCSVEndpoint(): Promise<Response> {
    try {
      const csvData: Record<string, string> = {};

      // Read CSV files from R2
      const files = [
        "users",
        "groups",
        "resources",
        "member_of",
        "inherits_from",
        "user_permissions",
        "group_permissions",
      ];

      for (const file of files) {
        const key = `${this.orgId}/${file}.csv`;
        const object = await this.env.GRAPH_STATE.get(key);
        if (object) {
          csvData[file] = await object.text();
        } else {
          console.warn(
            `[GraphStateCSV ${this.orgId}] CSV file not found: ${key}`
          );
          csvData[file] = "";
        }
      }

      return this.jsonResponse(csvData);
    } catch (error) {
      console.error(`[GraphStateCSV ${this.orgId}] CSV endpoint error:`, error);
      return this.jsonResponse(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  }

  /**
   * Helper to create JSON response
   */
  private jsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
}
