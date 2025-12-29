/**
 * Durable Object for managing authorization graph state
 *
 * Maintains an in-memory KuzuDB WASM instance with the permission graph.
 * Handles all read and write operations with strong consistency.
 * Periodically backs up to R2 for durability.
 *
 * Note: KuzuDB WASM integration will be added in next phase.
 * For now, using in-memory graph structure for testing.
 */

interface Env {
  GRAPH_STATE: R2Bucket;
  MAX_GRAPH_SIZE: string;
  BACKUP_INTERVAL: string;
}

interface PermissionTuple {
  user: string;
  permission: string;
  resource: string;
}

export class GraphState {
  private state: DurableObjectState;
  private env: Env;
  // TODO: Add KuzuDB WASM integration
  // For now, using simple in-memory set for testing
  private permissions: Set<string> = new Set();
  private initialized: boolean = false;
  private lastBackup: number = 0;
  private recordCount: number = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Block concurrent executions during initialization
    this.state.blockConcurrencyWhile(async () => {
      await this.initialize();
    });
  }

  /**
   * Initialize graph state
   */
  private async initialize() {
    if (this.initialized) return;

    console.log("[GraphState] Initializing...");

    try {
      // Try to restore from R2 if backup exists
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
  private async createSchema() {
    // Placeholder for KuzuDB schema creation
    console.log("[GraphState] Schema created (in-memory)");
  }

  /**
   * Handle incoming requests
   */
  async fetch(request: Request): Promise<Response> {
    if (!this.initialized) {
      return this.jsonResponse({ error: "Not initialized" }, 503);
    }

    try {
      const body = await request.json<any>();
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
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }

  /**
   * Check if user has permission on resource
   * Simple in-memory check for now
   */
  private async handleCheck(body: {
    user: string;
    permission: string;
    resource: string;
  }): Promise<Response> {
    const { user, permission, resource } = body;

    try {
      const key = `${user}:${permission}:${resource}`;
      const allowed = this.permissions.has(key);

      return this.jsonResponse({ allowed });
    } catch (error) {
      console.error("[GraphState] Check error:", error);
      return this.jsonResponse({
        allowed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Grant permission
   */
  private async handleGrant(body: {
    user: string;
    permission: string;
    resource: string;
  }): Promise<Response> {
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
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }

  /**
   * Revoke permission
   */
  private async handleRevoke(body: {
    user: string;
    permission: string;
    resource: string;
  }): Promise<Response> {
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
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  }

  /**
   * List permissions for user or resource
   */
  private async handleList(body: {
    user?: string;
    resource?: string;
  }): Promise<Response> {
    const { user, resource } = body;

    try {
      const permissions: any[] = [];

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
  private async handleBulk(body: {
    operations: Array<any>;
  }): Promise<Response> {
    const { operations } = body;
    const results: any[] = [];

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
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return this.jsonResponse({ results });
  }

  /**
   * Get stats about the graph
   */
  private async handleStats(): Promise<Response> {
    try {
      const users = new Set<string>();
      const resources = new Set<string>();

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
        lastBackup: this.lastBackup,
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
  private async maybeBackup() {
    const interval = parseInt(this.env.BACKUP_INTERVAL || "3600", 10) * 1000;
    const now = Date.now();

    if (now - this.lastBackup > interval) {
      await this.backupToR2();
      this.lastBackup = now;
    }
  }

  /**
   * Backup graph state to R2
   */
  private async backupToR2() {
    try {
      const permissionsArray = Array.from(this.permissions.keys());

      const backup = {
        timestamp: new Date().toISOString(),
        permissions: permissionsArray,
        recordCount: this.recordCount,
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
  private async restoreFromBackup() {
    try {
      const backup = await this.env.GRAPH_STATE.get("latest-backup.json");
      if (!backup) {
        console.log("[GraphState] No backup found");
        return;
      }

      const data = await backup.json<any>();
      console.log("[GraphState] Restoring from backup:", data.timestamp);

      // Restore permissions
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
  private async exportTable(tableName: string): Promise<any[]> {
    return [];
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
