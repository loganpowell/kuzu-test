/**
 * Durable Object for Graph State with Real CSV Data
 *
 * Uses Map-based indexes (same as test-graph-data.ts) to validate
 * the full authorization logic with transitive permissions.
 * Loads data from R2 CSV files.
 */

interface Env {
  GRAPH_STATE: R2Bucket;
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
   * Grant permission (simplified - just adds to index)
   */
  private async handleGrant(request: Request): Promise<Response> {
    try {
      const body = await request.json<any>();
      const { user, permission, resource } = body;

      if (!user || !permission || !resource) {
        return this.jsonResponse({ error: "Missing parameters" }, 400);
      }

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

      return this.jsonResponse({ success: true, user, permission, resource });
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
   * Helper to create JSON response
   */
  private jsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
