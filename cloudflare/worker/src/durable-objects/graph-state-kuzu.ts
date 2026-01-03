/**
 * Durable Object for managing authorization graph state with KuzuDB WASM
 *
 * Multi-tenant architecture: One DO per organization
 * - Loads CSV data from R2 (partitioned by org)
 * - Runs KuzuDB WASM for graph queries
 * - Write-through to R2 on grant/revoke
 */

interface Env {
  GRAPH_STATE: R2Bucket;
  MAX_GRAPH_SIZE: string;
  BACKUP_INTERVAL: string;
}

export class GraphStateKuzu {
  private state: DurableObjectState;
  private env: Env;
  private db: any = null;
  private conn: any = null;
  private orgId: string;
  private initialized: boolean = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Extract org from DO name: GRAPH_STATE_DO.idFromName('org_acme')
    this.orgId = state.id.name || "org_default";

    console.log(`[GraphStateKuzu] Constructed for ${this.orgId}`);
  }

  /**
   * Handle incoming requests
   */
  async fetch(request: Request): Promise<Response> {
    try {
      // Ensure initialized before handling requests
      await this.ensureInitialized();

      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/check" || path.endsWith("/check")) {
        return await this.handleCheck(request);
      } else if (path === "/grant" || path.endsWith("/grant")) {
        return await this.handleGrant(request);
      } else if (path === "/revoke" || path.endsWith("/revoke")) {
        return await this.handleRevoke(request);
      } else if (path === "/stats" || path.endsWith("/stats")) {
        return await this.handleStats();
      }

      return this.jsonResponse({ error: "Unknown path" }, 400);
    } catch (error) {
      console.error(`[GraphStateKuzu ${this.orgId}] Request error:`, error);
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
   * Lazy initialization of KuzuDB
   */
  private async ensureInitialized() {
    if (this.initialized) return;

    console.log(`[GraphStateKuzu ${this.orgId}] Initializing...`);

    try {
      // 1. Initialize KuzuDB WASM
      // Note: Using the sync version since Cloudflare Workers doesn't support worker threads
      // The async version requires Web Workers which aren't available in Durable Objects
      // @ts-ignore - kuzu-wasm/sync is optional and may not have type definitions
      const kuzuModule = await import("kuzu-wasm/sync");
      const kuzu = kuzuModule.default;

      console.log(
        `[GraphStateKuzu ${this.orgId}] KuzuDB module loaded, keys:`,
        Object.keys(kuzu)
      );

      // Note: Skipping kuzu.init() as it tries to access browser/Node APIs
      // that don't exist in Cloudflare Workers (document.currentScript, etc.)
      // The sync version should work without explicit init in Workers
      console.log(
        `[GraphStateKuzu ${this.orgId}] Skipping init(), creating database directly`
      );

      // Initialize database in memory
      this.db = new kuzu.Database(":memory:");
      this.conn = new kuzu.Connection(this.db);

      console.log(
        `[GraphStateKuzu ${this.orgId}] Database and connection created`
      );

      // 2. Create schema
      await this.createSchema();

      // 3. Load CSV data from R2 for this org
      await this.loadDataFromR2();

      this.initialized = true;
      console.log(`[GraphStateKuzu ${this.orgId}] Initialization complete`);
    } catch (error) {
      console.error(
        `[GraphStateKuzu ${this.orgId}] Initialization failed:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create KuzuDB schema
   */
  private async createSchema() {
    // Node tables
    await this.conn.query(`
      CREATE NODE TABLE User(
        id STRING,
        name STRING,
        email STRING,
        created_at STRING,
        metadata STRING,
        PRIMARY KEY(id)
      )
    `);

    await this.conn.query(`
      CREATE NODE TABLE Group(
        id STRING,
        name STRING,
        description STRING,
        created_at STRING,
        metadata STRING,
        PRIMARY KEY(id)
      )
    `);

    await this.conn.query(`
      CREATE NODE TABLE Resource(
        id STRING,
        type STRING,
        name STRING,
        owner_id STRING,
        created_at STRING,
        metadata STRING,
        PRIMARY KEY(id)
      )
    `);

    // Relationship tables
    await this.conn.query(`
      CREATE REL TABLE MEMBER_OF(
        FROM User TO Group,
        joined_at STRING,
        role STRING
      )
    `);

    await this.conn.query(`
      CREATE REL TABLE INHERITS_FROM(
        FROM Group TO Group,
        created_at STRING
      )
    `);

    await this.conn.query(`
      CREATE REL TABLE HAS_USER_PERMISSION(
        FROM User TO Resource,
        can_create BOOLEAN,
        can_read BOOLEAN,
        can_update BOOLEAN,
        can_delete BOOLEAN,
        granted_at STRING,
        granted_by STRING
      )
    `);

    await this.conn.query(`
      CREATE REL TABLE HAS_GROUP_PERMISSION(
        FROM Group TO Resource,
        can_create BOOLEAN,
        can_read BOOLEAN,
        can_update BOOLEAN,
        can_delete BOOLEAN,
        granted_at STRING,
        granted_by STRING
      )
    `);

    console.log(`[GraphStateKuzu ${this.orgId}] Schema created`);
  }

  /**
   * Load CSV data from R2
   */
  private async loadDataFromR2() {
    const tables = [
      "users",
      "groups",
      "resources",
      "member_of",
      "inherits_from",
      "user_permissions",
      "group_permissions",
    ];

    for (const table of tables) {
      try {
        const obj = await this.env.GRAPH_STATE.get(
          `${this.orgId}/${table}.csv`
        );
        if (!obj) {
          console.log(
            `[GraphStateKuzu ${this.orgId}] No ${table}.csv found, skipping`
          );
          continue;
        }

        const csvText = await obj.text();
        const lines = csvText.trim().split("\n");

        if (lines.length <= 1) {
          console.log(
            `[GraphStateKuzu ${this.orgId}] Empty ${table}.csv, skipping`
          );
          continue;
        }

        // Map CSV table names to KuzuDB table/relationship names
        const tableMapping: Record<string, string> = {
          users: "User",
          groups: "Group",
          resources: "Resource",
          member_of: "MEMBER_OF",
          inherits_from: "INHERITS_FROM",
          user_permissions: "HAS_USER_PERMISSION",
          group_permissions: "HAS_GROUP_PERMISSION",
        };

        const kuzuTable = tableMapping[table];

        // For relationship tables, we need to handle them differently
        if (table === "member_of") {
          await this.loadMemberOf(lines);
        } else if (table === "inherits_from") {
          await this.loadInheritsFrom(lines);
        } else if (table === "user_permissions") {
          await this.loadUserPermissions(lines);
        } else if (table === "group_permissions") {
          await this.loadGroupPermissions(lines);
        } else {
          // Node tables can use COPY FROM
          await this.loadNodeTable(kuzuTable, csvText);
        }

        console.log(
          `[GraphStateKuzu ${this.orgId}] Loaded ${table}: ${
            lines.length - 1
          } rows`
        );
      } catch (error) {
        console.error(
          `[GraphStateKuzu ${this.orgId}] Failed to load ${table}:`,
          error
        );
      }
    }
  }

  /**
   * Load node table using COPY FROM
   */
  private async loadNodeTable(tableName: string, csvText: string) {
    // KuzuDB COPY FROM expects a file path, but we have CSV text
    // We'll parse and insert manually for now
    const lines = csvText.trim().split("\n");
    const header = lines[0].split(",");

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const params: Record<string, any> = {};

      header.forEach((col, idx) => {
        params[col] = values[idx] || "";
      });

      const cols = header.join(", ");
      const paramRefs = header.map((col) => `$${col}`).join(", ");

      await this.conn.query(
        `CREATE (n:${tableName} {${header
          .map((col) => `${col}: $${col}`)
          .join(", ")}})`,
        params
      );
    }
  }

  /**
   * Load MEMBER_OF relationships
   */
  private async loadMemberOf(lines: string[]) {
    const header = lines[0].split(","); // from,to,joined_at,role

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const [userId, groupId, joinedAt, role] = values;

      try {
        await this.conn.query(
          `
          MATCH (u:User {id: $userId}), (g:Group {id: $groupId})
          CREATE (u)-[:MEMBER_OF {joined_at: $joinedAt, role: $role}]->(g)
        `,
          { userId, groupId, joinedAt, role }
        );
      } catch (error) {
        // Ignore errors for missing nodes
      }
    }
  }

  /**
   * Load INHERITS_FROM relationships
   */
  private async loadInheritsFrom(lines: string[]) {
    const header = lines[0].split(","); // from,to,created_at

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const [fromGroup, toGroup, createdAt] = values;

      try {
        await this.conn.query(
          `
          MATCH (g1:Group {id: $fromGroup}), (g2:Group {id: $toGroup})
          CREATE (g1)-[:INHERITS_FROM {created_at: $createdAt}]->(g2)
        `,
          { fromGroup, toGroup, createdAt }
        );
      } catch (error) {
        // Ignore errors for missing nodes
      }
    }
  }

  /**
   * Load HAS_USER_PERMISSION relationships
   */
  private async loadUserPermissions(lines: string[]) {
    const header = lines[0].split(","); // from,to,can_create,can_read,can_update,can_delete,granted_at,granted_by

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const [
        userId,
        resourceId,
        canCreate,
        canRead,
        canUpdate,
        canDelete,
        grantedAt,
        grantedBy,
      ] = values;

      try {
        await this.conn.query(
          `
          MATCH (u:User {id: $userId}), (r:Resource {id: $resourceId})
          CREATE (u)-[:HAS_USER_PERMISSION {
            can_create: $canCreate,
            can_read: $canRead,
            can_update: $canUpdate,
            can_delete: $canDelete,
            granted_at: $grantedAt,
            granted_by: $grantedBy
          }]->(r)
        `,
          {
            userId,
            resourceId,
            canCreate: canCreate === "True" || canCreate === "true",
            canRead: canRead === "True" || canRead === "true",
            canUpdate: canUpdate === "True" || canUpdate === "true",
            canDelete: canDelete === "True" || canDelete === "true",
            grantedAt,
            grantedBy,
          }
        );
      } catch (error) {
        // Ignore errors for missing nodes
      }
    }
  }

  /**
   * Load HAS_GROUP_PERMISSION relationships
   */
  private async loadGroupPermissions(lines: string[]) {
    const header = lines[0].split(",");

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const [
        groupId,
        resourceId,
        canCreate,
        canRead,
        canUpdate,
        canDelete,
        grantedAt,
        grantedBy,
      ] = values;

      try {
        await this.conn.query(
          `
          MATCH (g:Group {id: $groupId}), (r:Resource {id: $resourceId})
          CREATE (g)-[:HAS_GROUP_PERMISSION {
            can_create: $canCreate,
            can_read: $canRead,
            can_update: $canUpdate,
            can_delete: $canDelete,
            granted_at: $grantedAt,
            granted_by: $grantedBy
          }]->(r)
        `,
          {
            groupId,
            resourceId,
            canCreate: canCreate === "True" || canCreate === "true",
            canRead: canRead === "True" || canRead === "true",
            canUpdate: canUpdate === "True" || canUpdate === "true",
            canDelete: canDelete === "True" || canDelete === "true",
            grantedAt,
            grantedBy,
          }
        );
      } catch (error) {
        // Ignore errors for missing nodes
      }
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
   */
  private async handleCheck(request: Request): Promise<Response> {
    try {
      const body = await request.json<any>();
      const { user, resource, action } = body;

      if (!user || !resource || !action) {
        return this.jsonResponse({ error: "Missing parameters" }, 400);
      }

      const actionCol = `can_${action}`;

      // Cypher-like query: Check direct permission or via groups (with inheritance)
      const query = `
        MATCH (u:User {id: $userId})-[:HAS_USER_PERMISSION]->(r:Resource {id: $resourceId})
        WHERE r.${actionCol} = true
        RETURN true AS allowed
        UNION
        MATCH (u:User {id: $userId})-[:MEMBER_OF]->(g:Group)-[:INHERITS_FROM*0..]->(pg:Group)
              -[:HAS_GROUP_PERMISSION]->(r:Resource {id: $resourceId})
        WHERE r.${actionCol} = true
        RETURN true AS allowed
      `;

      const result = await this.conn.query(query, {
        userId: user,
        resourceId: resource,
      });
      const allowed = await result.hasNext();

      return this.jsonResponse({ allowed });
    } catch (error) {
      console.error(`[GraphStateKuzu ${this.orgId}] Check error:`, error);
      return this.jsonResponse({
        allowed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Grant permission (write-through to R2)
   */
  private async handleGrant(request: Request): Promise<Response> {
    try {
      const body = await request.json<any>();
      const { user, permission, resource } = body;

      if (!user || !permission || !resource) {
        return this.jsonResponse({ error: "Missing parameters" }, 400);
      }

      // 1. Add to KuzuDB (in-memory)
      const permFlags: Record<string, boolean> = {
        can_create: permission === "create",
        can_read: permission === "read",
        can_update: permission === "update",
        can_delete: permission === "delete",
      };

      await this.conn.query(
        `
        MATCH (u:User {id: $user}), (r:Resource {id: $resource})
        CREATE (u)-[:HAS_USER_PERMISSION {
          can_create: $canCreate,
          can_read: $canRead,
          can_update: $canUpdate,
          can_delete: $canDelete,
          granted_at: $grantedAt,
          granted_by: $grantedBy
        }]->(r)
      `,
        {
          user,
          resource,
          ...permFlags,
          grantedAt: new Date().toISOString(),
          grantedBy: "system",
        }
      );

      // 2. Append to R2 CSV (write-through)
      const csvRow = `${user},${resource},${permFlags.can_create},${
        permFlags.can_read
      },${permFlags.can_update},${
        permFlags.can_delete
      },${new Date().toISOString()},system\n`;

      const existing = await this.env.GRAPH_STATE.get(
        `${this.orgId}/user_permissions.csv`
      );
      const updated =
        (existing
          ? await existing.text()
          : "from,to,can_create,can_read,can_update,can_delete,granted_at,granted_by\n") +
        csvRow;
      await this.env.GRAPH_STATE.put(
        `${this.orgId}/user_permissions.csv`,
        updated
      );

      return this.jsonResponse({ success: true, user, permission, resource });
    } catch (error) {
      console.error(`[GraphStateKuzu ${this.orgId}] Grant error:`, error);
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
   * Revoke permission (write-through to R2)
   */
  private async handleRevoke(request: Request): Promise<Response> {
    try {
      const body = await request.json<any>();
      const { user, resource } = body;

      if (!user || !resource) {
        return this.jsonResponse({ error: "Missing parameters" }, 400);
      }

      // 1. Remove from KuzuDB
      await this.conn.query(
        `
        MATCH (u:User {id: $user})-[p:HAS_USER_PERMISSION]->(r:Resource {id: $resource})
        DELETE p
      `,
        { user, resource }
      );

      // 2. Update R2 CSV (filter out revoked permission)
      const existing = await this.env.GRAPH_STATE.get(
        `${this.orgId}/user_permissions.csv`
      );
      if (existing) {
        const csv = await existing.text();
        const lines = csv
          .split("\n")
          .filter((line) => !line.includes(`${user},${resource}`));
        await this.env.GRAPH_STATE.put(
          `${this.orgId}/user_permissions.csv`,
          lines.join("\n")
        );
      }

      return this.jsonResponse({ success: true, user, resource });
    } catch (error) {
      console.error(`[GraphStateKuzu ${this.orgId}] Revoke error:`, error);
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
   * Get stats about the graph
   */
  private async handleStats(): Promise<Response> {
    try {
      const userCount = await this.conn.query(
        "MATCH (u:User) RETURN count(u) AS count"
      );
      const groupCount = await this.conn.query(
        "MATCH (g:Group) RETURN count(g) AS count"
      );
      const resourceCount = await this.conn.query(
        "MATCH (r:Resource) RETURN count(r) AS count"
      );
      const permCount = await this.conn.query(
        "MATCH ()-[p:HAS_USER_PERMISSION]->() RETURN count(p) AS count"
      );

      return this.jsonResponse({
        orgId: this.orgId,
        users: (await userCount.getNext())?.count || 0,
        groups: (await groupCount.getNext())?.count || 0,
        resources: (await resourceCount.getNext())?.count || 0,
        permissions: (await permCount.getNext())?.count || 0,
      });
    } catch (error) {
      console.error(`[GraphStateKuzu ${this.orgId}] Stats error:`, error);
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
