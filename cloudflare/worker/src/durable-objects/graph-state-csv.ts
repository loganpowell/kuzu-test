/**
 * Durable Object for Graph State with Real CSV Data
 *
 * Uses Map-based indexes (same as test-graph-data.ts) to validate
 * the full authorization logic with transitive permissions.
 * Loads data from R2 CSV files.
 *
 * Server-side validation uses Map-based indexes (not KuzuDB).
 * KuzuDB WASM requires browser/Node.js APIs not available in Workers runtime.
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
  private static readonly SCHEMA_VERSION = 2; // Increment when schema changes

  private state: DurableObjectState;
  private env: Env;
  private orgId: string;
  private initialized: boolean = false;
  private schemaVersion: number = 0; // Cached schema version

  // Indexes (same as test-graph-data.ts)
  private memberOfIndex = new Map<string, Set<string>>();
  private inheritsFromIndex = new Map<string, string>();
  private userPermIndex = new Map<string, Map<string, Permission>>();
  private groupPermIndex = new Map<string, Map<string, Permission>>();

  // Server-side KuzuDB for authoritative validation
  private serverKuzu: any = null; // Database instance
  private serverConn: any = null; // Connection instance
  private serverValidationInitialized: boolean = false;

  // WebSocket connection tracking
  private connections = new Map<
    string,
    {
      ws: WebSocket;
      lastActivity: number;
      version: number;
    }
  >();
  private wsToClientId = new Map<WebSocket, string>(); // Reverse map for Hibernation API
  private idleTimeoutTimer?: number;

  // Mutation log with idle-triggered KV backup
  private currentVersion: number = 0;
  private idleBackupTimer?: number;
  private lastBackupVersion: number = 0;
  private mutationLogInitialized: boolean = false;

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
    // Handle WebSocket upgrade requests BEFORE try-catch
    // to avoid error handling interfering with WebSocket responses
    const upgrade = request.headers.get("Upgrade");
    console.log(`[GraphStateCSV ${this.orgId}] Upgrade header: ${upgrade}`);
    if (upgrade?.toLowerCase() === "websocket") {
      console.log(
        `[GraphStateCSV ${this.orgId}] Handling WebSocket upgrade...`
      );
      await this.ensureInitialized();
      return await this.handleWebSocketUpgrade(request);
    }

    try {
      await this.ensureInitialized();

      const url = new URL(request.url);
      const path = url.pathname;

      // Handle routes with or without /org/{orgId} prefix
      if (path === "/check" || path.endsWith("/check")) {
        return await this.handleCheck(request);
      } else if (path === "/validate" || path.endsWith("/validate")) {
        return await this.handleValidate(request);
      } else if (path === "/stats" || path.endsWith("/stats")) {
        return await this.handleStats();
      } else if (path === "/changes" || path.endsWith("/changes")) {
        return await this.handleChanges(request);
      } else if (path === "/grant" || path.endsWith("/grant")) {
        return await this.handleGrant(request);
      } else if (path === "/revoke" || path.endsWith("/revoke")) {
        return await this.handleRevoke(request);
      } else if (path === "/data" || path.endsWith("/data")) {
        return await this.handleDataEndpoint();
      } else if (path === "/csv" || path.endsWith("/csv")) {
        return await this.handleCSVEndpoint();
      } else if (path.endsWith("/ws")) {
        // WebSocket endpoint (shouldn't reach here if upgrade header is present)
        return this.jsonResponse({ error: "WebSocket upgrade required" }, 400);
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
   * Handle WebSocket upgrade requests
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Use Hibernation API - state.acceptWebSocket() is required for Worker->DO pattern
    this.state.acceptWebSocket(server);

    // Generate unique client ID
    const clientId = crypto.randomUUID();

    // Track connection with reverse map for Hibernation API
    this.connections.set(clientId, {
      ws: server,
      lastActivity: Date.now(),
      version: 0, // Will be updated when client sends initial version
    });
    this.wsToClientId.set(server, clientId);

    console.log(
      `[GraphStateCSV ${this.orgId}] WebSocket connected: ${clientId} (${this.connections.size} total)`
    );

    // NOTE: With Hibernation API, event handlers are not used.
    // Instead, implement webSocketMessage(), webSocketClose(), webSocketError() below.

    // Start idle timeout checker if not already running
    if (!this.idleTimeoutTimer) {
      this.startIdleTimeoutChecker();
    }

    // Return the client WebSocket with status 101
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Durable Object WebSocket lifecycle: Handle incoming messages
   * Called by Cloudflare runtime when using Hibernation API
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const clientId = this.wsToClientId.get(ws);
    if (!clientId) {
      console.error(`[GraphStateCSV ${this.orgId}] WebSocket not found in map`);
      return;
    }

    try {
      const data = JSON.parse(message as string);
      console.log(
        `[GraphStateCSV ${this.orgId}] WS message from ${clientId}:`,
        JSON.stringify(data)
      );
      await this.handleWebSocketMessage(clientId, data);
    } catch (error) {
      console.error(
        `[GraphStateCSV ${this.orgId}] WebSocket message error:`,
        error
      );
      ws.send(
        JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        })
      );
    }
  }

  /**
   * Durable Object WebSocket lifecycle: Handle disconnections
   * Called by Cloudflare runtime when using Hibernation API
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ) {
    const clientId = this.wsToClientId.get(ws);
    if (!clientId) return;

    console.log(
      `[GraphStateCSV ${this.orgId}] WebSocket disconnected: ${clientId}, code=${code}, reason=${reason}`
    );

    this.connections.delete(clientId);
    this.wsToClientId.delete(ws);
  }

  /**
   * Durable Object WebSocket lifecycle: Handle errors
   * Called by Cloudflare runtime when using Hibernation API
   */
  async webSocketError(ws: WebSocket, error: any) {
    const clientId = this.wsToClientId.get(ws);
    console.error(
      `[GraphStateCSV ${this.orgId}] WebSocket error for ${clientId}:`,
      error
    );
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleWebSocketMessage(
    clientId: string,
    data: any
  ): Promise<void> {
    const conn = this.connections.get(clientId);
    if (!conn) return;

    // Update last activity
    conn.lastActivity = Date.now();

    switch (data.type) {
      case "ping":
        // Respond with pong
        conn.ws.send(JSON.stringify({ type: "pong" }));
        break;

      case "version":
        // Client sending current version for tracking
        conn.version = data.version || 0;
        break;

      case "mutate":
        // Handle mutation request (grant/revoke)
        await this.handleWebSocketMutation(clientId, data);
        break;

      default:
        console.warn(
          `[GraphStateCSV ${this.orgId}] Unknown WebSocket message type: ${data.type}`
        );
    }
  }

  /**
   * Handle mutation request from WebSocket client
   */
  private async handleWebSocketMutation(
    clientId: string,
    data: any
  ): Promise<void> {
    const conn = this.connections.get(clientId);
    if (!conn) return;

    // ALWAYS check schema version first (even on already-initialized DOs)
    await this.ensureSchemaVersion();

    // Ensure mutation log is initialized before processing mutations
    await this.initializeMutationLog();

    try {
      console.log(
        `[GraphStateCSV ${this.orgId}] WebSocket mutation from ${clientId}:`,
        data.operation
      );

      let version: number;

      if (data.operation === "grant") {
        // Process grant
        version = await this.processMutationGrant(
          data.user,
          data.permission,
          data.resource
        );
      } else if (data.operation === "revoke") {
        // Process revoke
        version = await this.processMutationRevoke(
          data.user,
          data.permission,
          data.resource
        );
      } else {
        throw new Error(`Unknown operation: ${data.operation}`);
      }

      // Send ack to requesting client
      conn.ws.send(
        JSON.stringify({
          type: "ack",
          success: true,
          version,
        })
      );
    } catch (error) {
      console.error(
        `[GraphStateCSV ${this.orgId}] WebSocket mutation error:`,
        error
      );

      // Send error ack
      conn.ws.send(
        JSON.stringify({
          type: "ack",
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      );
    }
  }

  /**
   * Broadcast message to all connected WebSocket clients
   */
  private broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    const deadConnections: string[] = [];

    for (const [clientId, conn] of this.connections.entries()) {
      try {
        conn.ws.send(messageStr);
      } catch (error) {
        console.error(
          `[GraphStateCSV ${this.orgId}] Failed to send to ${clientId}:`,
          error
        );
        deadConnections.push(clientId);
      }
    }

    // Clean up dead connections
    for (const clientId of deadConnections) {
      console.log(
        `[GraphStateCSV ${this.orgId}] Removing dead connection: ${clientId}`
      );
      this.connections.delete(clientId);
    }
  }

  /**
   * Start idle timeout checker (runs every 60 seconds)
   */
  private startIdleTimeoutChecker(): void {
    const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

    this.idleTimeoutTimer = setInterval(() => {
      const now = Date.now();
      for (const [clientId, conn] of this.connections.entries()) {
        const idleTime = now - conn.lastActivity;
        if (idleTime > IDLE_TIMEOUT_MS) {
          console.log(
            `[GraphStateCSV ${
              this.orgId
            }] Closing idle connection: ${clientId} (idle ${Math.round(
              idleTime / 1000
            )}s)`
          );
          conn.ws.close(1000, "Idle timeout");
          this.connections.delete(clientId);
        }
      }

      // Stop checker if no connections
      if (this.connections.size === 0 && this.idleTimeoutTimer) {
        clearInterval(this.idleTimeoutTimer);
        this.idleTimeoutTimer = undefined;
      }
    }, CHECK_INTERVAL_MS) as unknown as number;
  }

  /**
   * Force recreation of mutation_log table (fixes old DOs with wrong schema)
   */
  private async recreateMutationLogTable(): Promise<void> {
    console.log(
      `[GraphStateCSV ${this.orgId}] Forcing mutation_log table recreation...`
    );

    await this.state.storage.sql.exec(`DROP TABLE IF EXISTS mutation_log`);
    console.log(`[GraphStateCSV ${this.orgId}] Dropped mutation_log table`);

    await this.state.storage.sql.exec(`
      CREATE TABLE mutation_log (
        version INTEGER PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL
      )
    `);
    console.log(
      `[GraphStateCSV ${this.orgId}] Created mutation_log table with correct schema`
    );
  }

  /**
   * Get current schema version from database
   */
  private async getSchemaVersion(): Promise<number> {
    try {
      const result = await this.state.storage.sql.exec(
        `SELECT version FROM schema_version LIMIT 1`
      );
      const version = result.one()?.version;
      return typeof version === "number" ? version : 0;
    } catch {
      // Table doesn't exist, version is 0
      return 0;
    }
  }

  /**
   * Set schema version in database
   */
  private async setSchemaVersion(version: number): Promise<void> {
    await this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      )
    `);
    await this.state.storage.sql.exec(
      `INSERT OR REPLACE INTO schema_version (version) VALUES (?)`,
      version // Single value, no spread needed
    );
  }

  /**
   * Ensure schema is up to date (called before initialization guard)
   */
  private async ensureSchemaVersion(): Promise<void> {
    // Check cached version first
    if (this.schemaVersion === GraphStateCSV.SCHEMA_VERSION) {
      return; // Already at correct version
    }

    // Get version from database
    const currentVersion = await this.getSchemaVersion();

    if (currentVersion < GraphStateCSV.SCHEMA_VERSION) {
      console.log(
        `[GraphStateCSV ${this.orgId}] Migrating schema from v${currentVersion} to v${GraphStateCSV.SCHEMA_VERSION}`
      );

      // Drop and recreate mutation_log table with correct schema
      await this.state.storage.sql.exec(`DROP TABLE IF EXISTS mutation_log`);
      console.log(`[GraphStateCSV ${this.orgId}] Dropped mutation_log table`);

      await this.state.storage.sql.exec(`
        CREATE TABLE mutation_log (
          version INTEGER PRIMARY KEY,
          timestamp TEXT NOT NULL,
          type TEXT NOT NULL,
          data TEXT NOT NULL
        )
      `);
      console.log(
        `[GraphStateCSV ${this.orgId}] Created mutation_log table with correct schema`
      );

      // Update schema version
      await this.setSchemaVersion(GraphStateCSV.SCHEMA_VERSION);
      console.log(`[GraphStateCSV ${this.orgId}] Schema migration complete`);
    }

    // Cache the version in memory
    this.schemaVersion = GraphStateCSV.SCHEMA_VERSION;
  }

  /**
   * Initialize server-side KuzuDB from CSV data
   * Uses kuzu-wasm-cf (custom Cloudflare Workers build)
   *
   * Build required: cd cloudflare/kuzu-cf-build/tools/wasm && ./build-cf.sh
   */
  private async initializeServerKuzu(): Promise<void> {
    try {
      console.log(
        `[GraphStateCSV ${this.orgId}] Initializing server KuzuDB with kuzu-wasm-cf...`
      );

      // Import the Cloudflare Workers-specific build
      // This is a custom single-threaded build without Web Workers
      let createKuzuModule: any;
      try {
        createKuzuModule = (await import("kuzu-wasm-cf")).default;
      } catch (importError) {
        console.error(
          `[GraphStateCSV ${this.orgId}] Failed to import kuzu-wasm-cf:`,
          importError
        );
        console.error(
          `[GraphStateCSV ${this.orgId}] Please build kuzu-wasm-cf: cd cloudflare/kuzu-cf-build/tools/wasm && ./build-cf.sh`
        );
        throw new Error(
          "kuzu-wasm-cf not built. Run: cd cloudflare/kuzu-cf-build/tools/wasm && ./build-cf.sh"
        );
      }

      console.log(
        `[GraphStateCSV ${this.orgId}] Loaded kuzu-wasm-cf module, initializing...`
      );

      // Initialize Kuzu module (async factory function)
      // This is a custom build with:
      // - Single-threaded (no Web Workers)
      // - ASYNCIFY for async operations
      // - No pthread/SharedArrayBuffer
      const kuzu = await createKuzuModule();
      console.log(
        `[GraphStateCSV ${this.orgId}] Kuzu module initialized, creating database...`
      );

      // Create in-memory database
      // CF Workers don't have persistent filesystem, so we use :memory:
      this.serverKuzu = kuzu.Database(":memory:");
      console.log(
        `[GraphStateCSV ${this.orgId}] Database created, creating connection...`
      );

      // Create connection
      this.serverConn = kuzu.Connection(this.serverKuzu);
      console.log(
        `[GraphStateCSV ${this.orgId}] Connection created successfully`
      );

      // Create schema
      await this.serverConn.execute(
        `CREATE NODE TABLE User(id STRING, PRIMARY KEY(id))`
      );
      await this.serverConn.execute(
        `CREATE NODE TABLE Group(id STRING, PRIMARY KEY(id))`
      );
      await this.serverConn.execute(
        `CREATE NODE TABLE Resource(id STRING, PRIMARY KEY(id))`
      );
      await this.serverConn.execute(
        `CREATE REL TABLE MEMBER_OF(FROM User TO Group)`
      );
      await this.serverConn.execute(
        `CREATE REL TABLE INHERITS_FROM(FROM Group TO Group)`
      );
      await this.serverConn.execute(
        `CREATE REL TABLE HAS_PERMISSION(FROM User TO Resource, capability STRING)`
      );
      await this.serverConn.execute(
        `CREATE REL TABLE GROUP_HAS_PERMISSION(FROM Group TO Resource, capability STRING)`
      );

      // Load data from CSV files in R2
      const files = [
        "users",
        "groups",
        "resources",
        "member_of",
        "inherits_from",
        "user_permissions",
        "group_permissions",
      ];
      const tableMap: Record<string, string> = {
        users: "User",
        groups: "Group",
        resources: "Resource",
        member_of: "MEMBER_OF",
        inherits_from: "INHERITS_FROM",
        user_permissions: "HAS_PERMISSION",
        group_permissions: "GROUP_HAS_PERMISSION",
      };

      for (const file of files) {
        const key = `${this.orgId}/${file}.csv`;
        const object = await this.env.GRAPH_STATE.get(key);

        if (object) {
          const csvContent = await object.text();
          this.serverKuzu.fs.writeFileSync(`/${file}.csv`, csvContent);
          await this.serverConn.execute(
            `COPY ${tableMap[file]} FROM "/${file}.csv"`
          );
          console.log(
            `[GraphStateCSV ${this.orgId}] Loaded ${file}.csv into server KuzuDB`
          );
        } else {
          console.warn(
            `[GraphStateCSV ${this.orgId}] CSV file not found: ${key}`
          );
        }
      }

      this.serverValidationInitialized = true;
      console.log(
        `[GraphStateCSV ${this.orgId}] Server KuzuDB initialized successfully`
      );
    } catch (error) {
      console.error(
        `[GraphStateCSV ${this.orgId}] Failed to initialize server KuzuDB:`,
        error
      );
      this.serverKuzu = null;
      this.serverConn = null;
      this.serverValidationInitialized = false;
      throw error;
    }
  }

  /**
   * Ensure server-side validation is initialized
   */
  // Server validation uses Map-based indexes loaded from CSV files
  // See loadDataFromR2() and checkPermission() methods

  /**
   * Reload validation data after mutations
   * Maps are already updated in processMutationGrant/Revoke methods
   */
  private async reloadServerValidation(): Promise<void> {
    // Map-based validation data is updated in real-time during mutations
    // No reload needed - see processMutationGrant() and processMutationRevoke()
    console.log(
      `[GraphStateCSV ${this.orgId}] Validation data updated in real-time`
    );
  }

  /**
   * Validate permission using Map-based indexes
   * This is the authoritative server-side security check
   *
   * Checks both direct permissions and transitive group permissions
   * Equivalent to KuzuDB graph query but using efficient Map lookups
   */
  async validatePermission(
    userId: string,
    capability: string,
    resourceId: string
  ): Promise<boolean> {
    try {
      // Use the existing checkPermission method which handles:
      // 1. Direct user permissions
      // 2. Transitive group membership (via getAllUserGroups)
      // 3. Group permissions with inheritance
      const hasPermission = this.checkPermission(
        userId,
        capability,
        resourceId
      );

      console.log(
        `[GraphStateCSV ${this.orgId}] Permission check: user=${userId}, resource=${resourceId}, capability=${capability} => ${hasPermission}`
      );

      return hasPermission;
    } catch (error) {
      console.error(
        `[GraphStateCSV ${this.orgId}] Permission validation error:`,
        error
      );
      return false; // Fail closed
    }
  }

  /**
   * Initialize mutation log from SQLite and KV backup
   */
  private async initializeMutationLog(): Promise<void> {
    // Check schema version first (before guard)
    await this.ensureSchemaVersion();

    if (this.mutationLogInitialized) return;

    console.log(`[GraphStateCSV ${this.orgId}] Initializing mutation log...`);

    // Schema is already correct (checked by ensureSchemaVersion)
    // Just create table if it doesn't exist (shouldn't happen after migration, but safe)
    await this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS mutation_log (
        version INTEGER PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL
      )
    `);

    // Get current version from SQLite
    const result = await this.state.storage.sql.exec(
      `SELECT COALESCE(MAX(version), 0) as max_version FROM mutation_log`
    );
    console.log(
      `[GraphStateCSV ${this.orgId}] SQL result type:`,
      typeof result,
      "keys:",
      Object.keys(result || {})
    );
    console.log(`[GraphStateCSV ${this.orgId}] SQL result.rows:`, result?.rows);
    console.log(
      `[GraphStateCSV ${this.orgId}] SQL result[0]:`,
      (result as any)?.[0]
    );

    // Handle different return formats
    const rows = (result as any)?.rows || (result as any);
    this.currentVersion = rows?.[0]?.max_version || 0;

    // Check KV for recent mutations (cold start recovery)
    const kvMutations = await this.loadMutationsFromKV();
    if (kvMutations.length > 0) {
      const maxKvVersion = Math.max(...kvMutations.map((m) => m.version));
      const versionGap = maxKvVersion - this.currentVersion;

      if (versionGap > 0 && versionGap <= 100) {
        // Restore mutations from KV to SQLite
        console.log(
          `[GraphStateCSV ${this.orgId}] Restoring ${kvMutations.length} mutations from KV`
        );
        for (const mutation of kvMutations) {
          if (mutation.version > this.currentVersion) {
            await this.state.storage.sql.exec(
              `INSERT OR IGNORE INTO mutation_log (version, timestamp, type, data) VALUES (?, ?, ?, ?)`,
              mutation.version,
              mutation.timestamp,
              mutation.type,
              mutation.data
            );
          }
        }
        this.currentVersion = maxKvVersion;
      }

      this.lastBackupVersion = maxKvVersion;
    }

    this.mutationLogInitialized = true;
    console.log(
      `[GraphStateCSV ${this.orgId}] Mutation log initialized (current version: ${this.currentVersion})`
    );
  }

  /**
   * Load recent mutations from KV
   */
  private async loadMutationsFromKV(): Promise<
    Array<{ version: number; timestamp: string; type: string; data: string }>
  > {
    const mutations: Array<{
      version: number;
      timestamp: string;
      type: string;
      data: string;
    }> = [];

    // List mutations from KV (last 1000)
    const listResult = await this.env.PERMISSIONS_KV.list({
      prefix: `${this.orgId}:mutation:`,
      limit: 1000,
    });

    // Load each mutation
    for (const key of listResult.keys) {
      const data = await this.env.PERMISSIONS_KV.get(key.name, "json");
      if (data) {
        mutations.push(data as any);
      }
    }

    return mutations.sort((a, b) => a.version - b.version);
  }

  /**
   * Log a mutation to SQLite and schedule idle backup
   */
  private async logMutation(type: string, data: any): Promise<number> {
    this.currentVersion++;
    const timestamp = new Date().toISOString();

    // Write to SQLite (fast, hot path)
    await this.state.storage.sql.exec(
      `INSERT INTO mutation_log (version, timestamp, type, data) VALUES (?, ?, ?, ?)`,
      this.currentVersion,
      timestamp,
      type,
      JSON.stringify(data)
    );

    // Clean up old mutations (keep last 1000)
    await this.state.storage.sql.exec(
      `DELETE FROM mutation_log WHERE version < ?`,
      this.currentVersion - 1000
    );

    // Schedule idle backup (debounced)
    this.scheduleIdleBackup();

    // Reload server-side KuzuDB to reflect the mutation
    // This ensures validatePermission() uses current state
    await this.reloadServerKuzu();

    return this.currentVersion;
  }

  /**
   * Schedule idle backup (debounced - cancels previous timer)
   */
  private scheduleIdleBackup(): void {
    // Cancel existing timer (debounce)
    if (this.idleBackupTimer) {
      clearTimeout(this.idleBackupTimer);
    }

    // Schedule backup after 5 seconds of idle
    this.idleBackupTimer = setTimeout(() => {
      this.state.waitUntil(this.backupUnbackedMutations());
    }, 5000) as unknown as number;
  }

  /**
   * Backup unbacked mutations to KV
   */
  private async backupUnbackedMutations(): Promise<void> {
    if (this.currentVersion === this.lastBackupVersion) {
      return; // Nothing to backup
    }

    console.log(
      `[GraphStateCSV ${this.orgId}] Backing up mutations ${
        this.lastBackupVersion + 1
      } to ${this.currentVersion}`
    );

    // Query mutations since last backup
    const result = await this.state.storage.sql.exec(
      `SELECT version, timestamp, type, data FROM mutation_log WHERE version > ?`,
      [this.lastBackupVersion]
    );

    // Write to KV in parallel
    await Promise.all(
      result.rows.map((mutation: any) =>
        this.env.PERMISSIONS_KV.put(
          `${this.orgId}:mutation:${mutation.version}`,
          JSON.stringify(mutation)
        )
      )
    );

    this.lastBackupVersion = this.currentVersion;
    console.log(
      `[GraphStateCSV ${this.orgId}] Backup complete (version: ${this.currentVersion})`
    );
  }

  /**
   * Handle /changes endpoint for catch-up sync
   */
  private async handleChanges(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const sinceParam = url.searchParams.get("since");
      const since = sinceParam ? parseInt(sinceParam, 10) : 0;

      console.log(
        `[GraphStateCSV ${this.orgId}] handleChanges: since=${since}, currentVersion=${this.currentVersion}, mutationLogInitialized=${this.mutationLogInitialized}`
      );

      if (isNaN(since)) {
        return this.jsonResponse({ error: "Invalid 'since' parameter" }, 400);
      }

      // Check version gap
      const versionGap = this.currentVersion - since;

      // Edge case 1: Client is ahead of server (should not happen)
      if (versionGap < 0) {
        return this.jsonResponse(
          {
            error: "Client version ahead of server",
            currentVersion: this.currentVersion,
            fullSyncRequired: true,
          },
          400
        );
      }

      // Edge case 2: Client is at current version
      if (versionGap === 0) {
        return this.jsonResponse({
          currentVersion: this.currentVersion,
          changes: [],
        });
      }

      // Edge case 3: Gap too large (> 1000 mutations kept)
      if (versionGap > 1000) {
        return this.jsonResponse({
          currentVersion: this.currentVersion,
          fullSyncRequired: true,
          message: "Version gap too large, full sync required",
        });
      }

      // Normal case: Fetch mutations since version
      const result = await this.state.storage.sql.exec(
        `SELECT version, timestamp, type, data FROM mutation_log WHERE version > ? ORDER BY version ASC`,
        [since]
      );

      const changes = result.rows.map((row: any) => ({
        version: row.version,
        timestamp: row.timestamp,
        type: row.type,
        data: JSON.parse(row.data),
      }));

      return this.jsonResponse({
        currentVersion: this.currentVersion,
        changes,
      });
    } catch (error) {
      console.error(`[GraphStateCSV ${this.orgId}] Changes error:`, error);
      return this.jsonResponse(
        {
          error: "Failed to fetch changes",
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
      await this.initializeServerKuzu(); // Initialize KuzuDB with CSV data
      await this.initializeMutationLog();
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

      // Use server-side KuzuDB for validation (authoritative)
      const allowed = await this.validatePermission(user, action, resource);
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
   * Validate CRUD operation with server-side authorization
   * This method should wrap all CRUD endpoints to enforce security
   */
  async validateCRUDOperation(
    userId: string,
    operation: "create" | "read" | "update" | "delete",
    resourceId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const allowed = await this.validatePermission(
        userId,
        operation,
        resourceId
      );

      if (!allowed) {
        return {
          allowed: false,
          reason: `User ${userId} does not have ${operation} permission on resource ${resourceId}`,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error(
        `[GraphStateCSV ${this.orgId}] CRUD validation error:`,
        error
      );
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : "Validation error",
      };
    }
  }

  /**
   * Example endpoint: Validate CRUD operation using server-side KuzuDB
   * This demonstrates how to wrap actual CRUD operations with authorization
   */
  private async handleValidate(request: Request): Promise<Response> {
    try {
      const body = await request.json<any>();
      const { userId, operation, resourceId } = body;

      if (!userId || !operation || !resourceId) {
        return this.jsonResponse(
          {
            error: "Missing parameters: userId, operation, resourceId required",
          },
          400
        );
      }

      if (!["create", "read", "update", "delete"].includes(operation)) {
        return this.jsonResponse(
          {
            error:
              "Invalid operation. Must be: create, read, update, or delete",
          },
          400
        );
      }

      const result = await this.validateCRUDOperation(
        userId,
        operation,
        resourceId
      );

      if (!result.allowed) {
        return this.jsonResponse(
          {
            allowed: false,
            reason: result.reason,
          },
          403
        );
      }

      return this.jsonResponse({ allowed: true });
    } catch (error) {
      console.error(
        `[GraphStateCSV ${this.orgId}] Validate endpoint error:`,
        error
      );
      return this.jsonResponse(
        {
          allowed: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
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
   * Process grant mutation (core logic for both HTTP and WebSocket)
   */
  private async processMutationGrant(
    user: string,
    permission: string,
    resource: string
  ): Promise<number> {
    // 1. Update in-memory index (fast)
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

    // 2. Write to DO SQLite (durable, fast - survives while DO is active)
    const sqliteKey = `perm:${user}:${resource}`;
    await this.state.storage.put(sqliteKey, perm);

    // 3. Write to KV namespace (async, non-blocking - durable backup)
    const kvKey = `${this.orgId}:perm:${user}:${resource}`;
    this.state.waitUntil(
      this.env.PERMISSIONS_KV.put(kvKey, JSON.stringify(perm))
    );

    // 4. Log mutation for WebSocket broadcast and catch-up sync
    const version = await this.logMutation("grant", {
      user,
      permission,
      resource,
      granted_at: perm.granted_at,
      granted_by: perm.granted_by,
    });

    // 5. Broadcast mutation to all connected clients
    this.broadcast({
      type: "mutation",
      version,
      mutation: {
        type: "grant",
        user,
        permission,
        resource,
        granted_at: perm.granted_at,
        granted_by: perm.granted_by,
      },
    });

    return version;
  }

  /**
   * Process revoke mutation (core logic for both HTTP and WebSocket)
   */
  private async processMutationRevoke(
    user: string,
    permission: string,
    resource: string
  ): Promise<number> {
    // 1. Remove from in-memory index
    const userPerms = this.userPermIndex.get(user);
    if (userPerms) {
      userPerms.delete(resource);
    }

    // 2. Delete from DO SQLite
    const sqliteKey = `perm:${user}:${resource}`;
    await this.state.storage.delete(sqliteKey);

    // 3. Delete from KV namespace (async, non-blocking)
    const kvKey = `${this.orgId}:perm:${user}:${resource}`;
    this.state.waitUntil(this.env.PERMISSIONS_KV.delete(kvKey));

    // 4. Log mutation for WebSocket broadcast and catch-up sync
    const version = await this.logMutation("revoke", {
      user,
      permission,
      resource,
    });

    // 5. Broadcast mutation to all connected clients
    this.broadcast({
      type: "mutation",
      version,
      mutation: {
        type: "revoke",
        user,
        permission,
        resource,
      },
    });

    return version;
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

      const version = await this.processMutationGrant(
        user,
        permission,
        resource
      );
      const totalTime = Date.now() - startTime;

      return this.jsonResponse({
        success: true,
        user,
        permission,
        resource,
        version,
        timing: {
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

      const version = await this.processMutationRevoke(
        user,
        permission,
        resource
      );
      const totalTime = Date.now() - startTime;

      return this.jsonResponse({
        success: true,
        user,
        resource,
        version,
        timing: {
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
