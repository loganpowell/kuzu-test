import type Database from "kuzu-wasm";
import { openDB, type IDBPDatabase } from "idb";
import {
  WebSocketManager,
  type MutationMessage,
  type ConnectionState,
} from "./websocket-manager";

/**
 * IndexedDB schema for storing graph data
 */
interface GraphDB {
  metadata: {
    key: string;
    value: {
      version: number;
      orgId: string;
      lastSync: number;
    };
  };
  csv_data: {
    key: string;
    value: {
      name: string;
      content: string;
      checksum: string;
    };
  };
}

/**
 * Client SDK for KuzuDB WASM authorization
 */
export class KuzuAuthClient {
  private db: typeof Database | null = null;
  private connection: any = null;
  private idb: IDBPDatabase<GraphDB> | null = null;
  private fs: any = null;
  private serverUrl: string;
  private orgId: string;
  private wsManager: WebSocketManager | null = null;
  private useMultiThreadedCDN: boolean;
  private currentVersion: number = 0;

  // Cold start timing metrics
  public coldStartTimings: {
    wasmDownload: number;
    wasmCompilation: number;
    kuzuInitialization: number;
    dataFetch: number;
    graphConstruction: number;
    total: number;
  } | null = null;

  constructor(
    serverUrl: string,
    orgId: string,
    options: { useMultiThreadedCDN?: boolean } = {}
  ) {
    this.serverUrl = serverUrl;
    this.orgId = orgId;
    this.useMultiThreadedCDN = options.useMultiThreadedCDN ?? false;
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    const startTotal = performance.now();
    console.log("[KuzuAuthClient] Initializing...");

    // Register Service Worker for caching
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        console.log(
          "[KuzuAuthClient] ServiceWorker registered:",
          registration.scope
        );
      } catch (error) {
        console.warn(
          "[KuzuAuthClient] ServiceWorker registration failed:",
          error
        );
      }
    }

    // Open IndexedDB
    this.idb = await openDB<GraphDB>("kuzu-auth", 1, {
      upgrade(db) {
        db.createObjectStore("metadata");
        db.createObjectStore("csv_data");
      },
    });

    // Load KuzuDB WASM - default export is the initialized module object
    const startWasm = performance.now();

    console.log(
      "[KuzuAuthClient] Loading multi-threaded WASM from CDN (cached)..."
    );
    const kuzu_wasm = await import(
      "https://cdn.jsdelivr.net/npm/@kuzu/kuzu-wasm@latest/dist/kuzu-browser.js"
    );
    const kuzu = await kuzu_wasm.default();
    window.kuzu = kuzu;

    const wasmDownload = performance.now() - startWasm;

    const startCompilation = performance.now();

    // Check for multi-threading support
    console.log(
      "[KuzuAuthClient] SharedArrayBuffer available:",
      typeof SharedArrayBuffer !== "undefined"
    );
    console.log(
      "[KuzuAuthClient] Hardware concurrency:",
      navigator.hardwareConcurrency
    );

    // Store reference to Emscripten FS module
    this.fs = (kuzu as any).FS;

    // Create in-memory database with large buffer pool (2 GB)
    // Enable multi-threading for better performance
    // Parameters: (path, bufferPoolSize, maxNumThreads, enableCompression, readOnly, autoCheckpoint, checkpointThreshold)
    const bufferPoolSize = 2 * 1024 * 1024 * 1024; // 2 GB in bytes
    const maxNumThreads = navigator.hardwareConcurrency || 8; // Use all available cores
    const enableCompression = false; // Disable compression for better memory usage

    console.log(
      "[KuzuAuthClient] Creating database with",
      maxNumThreads,
      "threads"
    );
    const startKuzu = performance.now();

    // CDN version uses async factory functions
    this.db = await kuzu.Database();
    this.connection = await kuzu.Connection(this.db);

    console.log("[KuzuAuthClient] Database created");
    const kuzuInitialization = performance.now() - startKuzu;
    const wasmCompilation =
      performance.now() - startCompilation - kuzuInitialization;

    console.log("[KuzuAuthClient] KuzuDB WASM initialized");

    // Initialize coldStartTimings object BEFORE loadGraphData
    this.coldStartTimings = {
      wasmDownload,
      wasmCompilation,
      kuzuInitialization,
      dataFetch: 0,
      graphConstruction: 0,
      total: 0,
    };

    // Load graph data (will update dataFetch and graphConstruction)

    await this.loadGraphData();

    const total = performance.now() - startTotal;
    this.coldStartTimings.total = total;

    // Initialize WebSocket connection for real-time updates
    this.initializeWebSocket();

    console.log("[KuzuAuthClient] Ready");
  }

  /**
   * Execute a query with parameters
   * CDN version only supports execute() without parameters,
   * so we manually substitute parameters in the query string
   */
  private async executeQuery(
    sql: string,
    params?: Record<string, any>
  ): Promise<any> {
    let finalSql = sql;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        const paramPlaceholder = `$${key}`;
        // Escape string values with single quotes
        const paramValue = typeof value === "string" ? `'${value}'` : value;
        finalSql = finalSql.replace(
          new RegExp(`\\${paramPlaceholder}`, "g"),
          String(paramValue)
        );
      }
    }
    const result = await this.connection.execute(finalSql);

    // Wrap result to provide consistent API for compatibility
    return {
      getAllObjects: async () => result || [],
      getAll: () => result || [],
      close: async () => {}, // CDN doesn't need explicit close
    };
  }

  /**
   * Load graph data from IndexedDB or fetch from server
   */
  private async loadGraphData(): Promise<void> {
    console.log("[KuzuAuthClient] Loading graph data...");

    // Check IndexedDB cache
    const cachedMetadata = await this.idb!.get("metadata", "current");

    let csvData: Map<string, string>;
    let dataFetchTime = 0;

    if (cachedMetadata && cachedMetadata.orgId === this.orgId) {
      console.log("[KuzuAuthClient] Loading from IndexedDB cache");
      const startFetch = performance.now();
      csvData = await this.loadFromIndexedDB();
      dataFetchTime = performance.now() - startFetch;
    } else {
      console.log("[KuzuAuthClient] Fetching from server");
      const startFetch = performance.now();
      csvData = await this.fetchFromServer();
      dataFetchTime = performance.now() - startFetch;
      await this.saveToIndexedDB(csvData);
    }

    // Create schema and load data
    const startConstruction = performance.now();
    await this.createSchema();
    await this.loadCSVData(csvData);
    const constructionTime = performance.now() - startConstruction;

    // Update coldStartTimings with actual measured values
    if (this.coldStartTimings) {
      this.coldStartTimings.dataFetch = dataFetchTime;
      this.coldStartTimings.graphConstruction = constructionTime;
    }

    console.log("[KuzuAuthClient] Graph data loaded");
  }

  /**
   * Load CSV data from IndexedDB
   */
  private async loadFromIndexedDB(): Promise<Map<string, string>> {
    const data = new Map<string, string>();
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
      const cached = await this.idb!.get("csv_data", table);
      if (cached) {
        data.set(table, cached.content);
      }
    }

    return data;
  }

  /**
   * Fetch CSV data from server
   */
  private async fetchFromServer(): Promise<Map<string, string>> {
    const response = await fetch(`${this.serverUrl}/org/${this.orgId}/csv`);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }

    const csvData = await response.json();
    return new Map(Object.entries(csvData));
  }

  /**
   * Save CSV data to IndexedDB
   */
  private async saveToIndexedDB(csvData: Map<string, string>): Promise<void> {
    const tx = this.idb!.transaction(["metadata", "csv_data"], "readwrite");

    // Save metadata
    await tx.objectStore("metadata").put(
      {
        version: 1,
        orgId: this.orgId,
        lastSync: Date.now(),
      },
      "current"
    );

    // Save CSV data
    for (const [name, content] of csvData) {
      await tx.objectStore("csv_data").put(
        {
          name,
          content,
          checksum: this.checksum(content),
        },
        name
      );
    }

    await tx.done;
  }

  /**
   * Create KuzuDB schema
   */
  private async createSchema(): Promise<void> {
    // Create node tables
    await this.executeQuery(`
      CREATE NODE TABLE User(id STRING, PRIMARY KEY(id))
    `);

    await this.executeQuery(`
      CREATE NODE TABLE UserGroup(id STRING, PRIMARY KEY(id))
    `);

    await this.executeQuery(`
      CREATE NODE TABLE Resource(id STRING, name STRING, PRIMARY KEY(id))
    `);

    // Create relationship tables
    await this.executeQuery(`
      CREATE REL TABLE MEMBER_OF(FROM User TO UserGroup)
    `);

    await this.executeQuery(`
      CREATE REL TABLE INHERITS_FROM(FROM UserGroup TO UserGroup)
    `);

    await this.executeQuery(`
      CREATE REL TABLE USER_PERMISSION(FROM User TO Resource, capability STRING)
    `);

    await this.executeQuery(`
      CREATE REL TABLE GROUP_PERMISSION(FROM UserGroup TO Resource, capability STRING)
    `);
  }

  /**
   * Load CSV data into KuzuDB using COPY FROM with in-memory filesystem
   */
  private async loadCSVData(csvData: Map<string, string>): Promise<void> {
    const MAX_ROWS_PER_TABLE = 1000; // Limit dataset size for client-side testing

    // Access Emscripten's FS module (MEMFS)
    const FS = this.fs;
    if (!FS) {
      throw new Error("Emscripten FS module not available");
    }

    // Track loaded node IDs to filter relationships
    const loadedUserIds = new Set<string>();
    const loadedGroupIds = new Set<string>();
    const loadedResourceIds = new Set<string>();

    // Load nodes first (required for relationships), then relationships
    const nodeTableOrder = ["users", "groups", "resources"];
    const relTableOrder = [
      "member_of",
      "inherits_from",
      "user_permissions",
      "group_permissions",
    ];
    const tableOrder = [...nodeTableOrder, ...relTableOrder];

    for (const table of tableOrder) {
      const tableStart = performance.now();
      const content = csvData.get(table);
      if (!content) continue;

      const parseStart = performance.now();
      const allRows = this.parseCSV(content);
      const validRows = allRows.filter(
        (row) => row.length > 0 && row[0] && row[0].trim() !== ""
      );
      let rows = validRows.slice(0, MAX_ROWS_PER_TABLE);
      const parseTime = performance.now() - parseStart;

      // Filter relationship rows to only include references to loaded nodes
      const filterStart = performance.now();
      if (table === "member_of") {
        rows = rows.filter(
          (row) => loadedUserIds.has(row[0]) && loadedGroupIds.has(row[1])
        );
      } else if (table === "inherits_from") {
        rows = rows.filter(
          (row) => loadedGroupIds.has(row[0]) && loadedGroupIds.has(row[1])
        );
      } else if (table === "user_permissions") {
        rows = rows.filter(
          (row) => loadedUserIds.has(row[0]) && loadedResourceIds.has(row[1])
        );
      } else if (table === "group_permissions") {
        rows = rows.filter(
          (row) => loadedGroupIds.has(row[0]) && loadedResourceIds.has(row[1])
        );
      }
      const filterTime = performance.now() - filterStart;

      console.log(
        `[KuzuAuthClient] Loading ${rows.length}/${
          validRows.length
        } rows for ${table} (parse: ${parseTime.toFixed(
          1
        )}ms, filter: ${filterTime.toFixed(1)}ms)`
      );

      // Write CSV data to virtual filesystem and use COPY FROM
      const filename = `/${table}.csv`;

      const writeStart = performance.now();
      if (table === "users") {
        // Single column: id
        rows.forEach((row) => loadedUserIds.add(row[0]));
        const csvContent = rows.map((row) => row[0]).join("\n");
        await FS.writeFile(filename, csvContent);
        const writeTime = performance.now() - writeStart;

        const copyStart = performance.now();
        await this.executeQuery(`COPY User FROM '${filename}' (HEADER=false)`);
        const copyTime = performance.now() - copyStart;

        await FS.unlink(filename);
        console.log(
          `[KuzuAuthClient] Completed loading ${table} (write: ${writeTime.toFixed(
            1
          )}ms, copy: ${copyTime.toFixed(1)}ms, total: ${(
            performance.now() - tableStart
          ).toFixed(1)}ms)`
        );
      } else if (table === "groups") {
        // Single column: id
        rows.forEach((row) => loadedGroupIds.add(row[0]));
        const csvContent = rows.map((row) => row[0]).join("\n");
        await FS.writeFile(filename, csvContent);
        const writeTime = performance.now() - writeStart;

        const copyStart = performance.now();
        await this.executeQuery(
          `COPY UserGroup FROM '${filename}' (HEADER=false)`
        );
        const copyTime = performance.now() - copyStart;

        await FS.unlink(filename);
        console.log(
          `[KuzuAuthClient] Completed loading ${table} (write: ${writeTime.toFixed(
            1
          )}ms, copy: ${copyTime.toFixed(1)}ms, total: ${(
            performance.now() - tableStart
          ).toFixed(1)}ms)`
        );
      } else if (table === "resources") {
        // Two columns: id, name
        rows.forEach((row) => loadedResourceIds.add(row[0]));
        const csvContent = rows.map((row) => `${row[0]},${row[1]}`).join("\n");
        await FS.writeFile(filename, csvContent);
        const writeTime = performance.now() - writeStart;

        const copyStart = performance.now();
        await this.executeQuery(
          `COPY Resource FROM '${filename}' (HEADER=false)`
        );
        const copyTime = performance.now() - copyStart;

        await FS.unlink(filename);
        console.log(
          `[KuzuAuthClient] Completed loading ${table} (write: ${writeTime.toFixed(
            1
          )}ms, copy: ${copyTime.toFixed(1)}ms, total: ${(
            performance.now() - tableStart
          ).toFixed(1)}ms)`
        );
      } else if (table === "member_of") {
        // Two columns: user_id, group_id
        const csvContent = rows.map((row) => `${row[0]},${row[1]}`).join("\n");
        await FS.writeFile(filename, csvContent);
        const writeTime = performance.now() - writeStart;

        const copyStart = performance.now();
        await this.executeQuery(
          `COPY MEMBER_OF FROM '${filename}' (HEADER=false)`
        );
        const copyTime = performance.now() - copyStart;

        await FS.unlink(filename);
        console.log(
          `[KuzuAuthClient] Completed loading ${table} (write: ${writeTime.toFixed(
            1
          )}ms, copy: ${copyTime.toFixed(1)}ms, total: ${(
            performance.now() - tableStart
          ).toFixed(1)}ms)`
        );
      } else if (table === "inherits_from") {
        // Two columns: from_group_id, to_group_id
        const csvContent = rows.map((row) => `${row[0]},${row[1]}`).join("\n");
        await FS.writeFile(filename, csvContent);
        const writeTime = performance.now() - writeStart;

        const copyStart = performance.now();
        await this.executeQuery(
          `COPY INHERITS_FROM FROM '${filename}' (HEADER=false)`
        );
        const copyTime = performance.now() - copyStart;

        await FS.unlink(filename);
        console.log(
          `[KuzuAuthClient] Completed loading ${table} (write: ${writeTime.toFixed(
            1
          )}ms, copy: ${copyTime.toFixed(1)}ms, total: ${(
            performance.now() - tableStart
          ).toFixed(1)}ms)`
        );
      } else if (table === "user_permissions") {
        // Three columns: user_id, resource_id, capability
        const csvContent = rows
          .map((row) => `${row[0]},${row[1]},${row[2]}`)
          .join("\n");
        await FS.writeFile(filename, csvContent);
        const writeTime = performance.now() - writeStart;

        const copyStart = performance.now();
        await this.executeQuery(
          `COPY USER_PERMISSION FROM '${filename}' (HEADER=false)`
        );
        const copyTime = performance.now() - copyStart;

        await FS.unlink(filename);
        console.log(
          `[KuzuAuthClient] Completed loading ${table} (write: ${writeTime.toFixed(
            1
          )}ms, copy: ${copyTime.toFixed(1)}ms, total: ${(
            performance.now() - tableStart
          ).toFixed(1)}ms)`
        );
      } else if (table === "group_permissions") {
        // Three columns: group_id, resource_id, capability
        const csvContent = rows
          .map((row) => `${row[0]},${row[1]},${row[2]}`)
          .join("\n");
        await FS.writeFile(filename, csvContent);
        const writeTime = performance.now() - writeStart;

        const copyStart = performance.now();
        await this.executeQuery(
          `COPY GROUP_PERMISSION FROM '${filename}' (HEADER=false)`
        );
        const copyTime = performance.now() - copyStart;

        await FS.unlink(filename);
        console.log(
          `[KuzuAuthClient] Completed loading ${table} (write: ${writeTime.toFixed(
            1
          )}ms, copy: ${copyTime.toFixed(1)}ms, total: ${(
            performance.now() - tableStart
          ).toFixed(1)}ms)`
        );
      }
    }
  }

  /**
   * Check if a user can perform an action on a resource
   */
  async can(
    userId: string,
    capability: string,
    resourceId: string
  ): Promise<boolean> {
    // Query for direct user permission or inherited group permission
    const query = `
      MATCH path = (u:User {id: $userId})-[*1..10]->(r:Resource {id: $resourceId})
      WHERE ANY(rel IN relationships(path) WHERE 
        (type(rel) = 'USER_PERMISSION' AND rel.capability = $capability) OR
        (type(rel) = 'GROUP_PERMISSION' AND rel.capability = $capability)
      )
      RETURN COUNT(*) > 0 AS has_permission
    `;

    const result = await this.executeQuery(query, {
      userId,
      capability,
      resourceId,
    });

    try {
      const rows = await result.getAllObjects();
      return rows.length > 0 && rows[0].has_permission;
    } finally {
      // Always close the result to free memory
      await result.close();
    }
  }

  /**
   * Find all resources a user can access
   */
  async findAllResourcesUserCanAccess(
    userId: string,
    capability: string
  ): Promise<string[]> {
    const query = `
      MATCH path = (u:User {id: $userId})-[*1..10]->(r:Resource)
      WHERE ANY(rel IN relationships(path) WHERE 
        (type(rel) = 'USER_PERMISSION' AND rel.capability = $capability) OR
        (type(rel) = 'GROUP_PERMISSION' AND rel.capability = $capability)
      )
      RETURN DISTINCT r.id AS resource_id
    `;

    const result = await this.executeQuery(query, { userId, capability });
    const rows = result.getAll();
    return rows.map((row) => row.resource_id);
  }

  /**
   * Connect to server for real-time updates
   */
  connectWebSocket(): void {
    const wsUrl = this.serverUrl.replace("http", "ws");
    this.wsConnection = new WebSocket(`${wsUrl}/sync/${this.orgId}`);

    this.wsConnection.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "permission_granted") {
        // Apply incremental update
        await this.grantPermission(
          message.userId,
          message.capability,
          message.resourceId
        );
      } else if (message.type === "permission_revoked") {
        // Apply incremental update
        await this.revokePermission(
          message.userId,
          message.capability,
          message.resourceId
        );
      }
    };
  }

  /**
   * Grant permission via WebSocket mutation
   */
  async grant(
    user: string,
    permission: string,
    resource: string
  ): Promise<{ success: boolean; version?: number }> {
    if (!this.wsManager || this.wsManager.getState() !== "connected") {
      throw new Error(
        "WebSocket not connected. Call initialize() and wait for connection."
      );
    }

    console.log(
      `[KuzuAuthClient] Granting ${permission} on ${resource} to ${user}`
    );

    const result = await this.wsManager.sendMutation(
      "grant",
      user,
      permission,
      resource
    );

    if (!result.success) {
      throw new Error(result.error || "Grant failed");
    }

    return result;
  }

  /**
   * Grant permission (local update) - used by mutation handler
   */
  private async grantPermission(
    userId: string,
    capability: string,
    resourceId: string
  ): Promise<void> {
    await this.executeQuery(
      `
      MATCH (u:User {id: $userId}), (r:Resource {id: $resourceId})
      CREATE (u)-[:USER_PERMISSION {capability: $capability}]->(r)
    `,
      { userId, capability, resourceId }
    );
  }

  /**
   * Revoke permission via WebSocket mutation
   */
  async revoke(
    user: string,
    permission: string,
    resource: string
  ): Promise<{ success: boolean; version?: number }> {
    if (!this.wsManager || this.wsManager.getState() !== "connected") {
      throw new Error(
        "WebSocket not connected. Call initialize() and wait for connection."
      );
    }

    console.log(
      `[KuzuAuthClient] Revoking ${permission} on ${resource} from ${user}`
    );

    const result = await this.wsManager.sendMutation(
      "revoke",
      user,
      permission,
      resource
    );

    if (!result.success) {
      throw new Error(result.error || "Revoke failed");
    }

    return result;
  }

  /**
   * Revoke permission (local update) - used by mutation handler
   */
  private async revokePermission(
    userId: string,
    capability: string,
    resourceId: string
  ): Promise<void> {
    await this.executeQuery(
      `
      MATCH (u:User {id: $userId})-[rel:USER_PERMISSION {capability: $capability}]->(r:Resource {id: $resourceId})
      DELETE rel
    `,
      { userId, capability, resourceId }
    );
  }

  /**
   * Simple CSV parser
   */
  private parseCSV(content: string): string[][] {
    const lines = content.trim().split("\n");
    const rows: string[][] = [];

    // Skip header (first line)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const fields: string[] = [];
      let currentField = "";
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];

        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          fields.push(currentField.trim());
          currentField = "";
        } else {
          currentField += char;
        }
      }

      // Push the last field
      fields.push(currentField.trim());
      rows.push(fields);
    }

    return rows;
  }

  /**
   * Simple checksum
   */
  private checksum(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Initialize WebSocket connection for real-time updates
   */
  private initializeWebSocket(): void {
    console.log("[KuzuAuthClient] Initializing WebSocket connection...");

    this.wsManager = new WebSocketManager({
      serverUrl: this.serverUrl,
      orgId: this.orgId,
      onMutation: (mutation) => this.handleMutation(mutation),
      onStateChange: (state) => this.handleConnectionStateChange(state),
      onError: (error) => this.handleConnectionError(error),
    });

    // Connect with current version (0 for now, will track mutations later)
    this.wsManager.connect(this.currentVersion);
  }

  /**
   * Handle incoming mutation from WebSocket broadcast
   */
  private async handleMutation(mutation: MutationMessage): Promise<void> {
    console.log(
      `[KuzuAuthClient] Applying mutation v${mutation.version}:`,
      mutation.mutation
    );

    try {
      this.currentVersion = mutation.version;

      if (mutation.mutation.type === "grant") {
        // Apply grant to local KuzuDB graph
        await this.applyGrantMutation(mutation.mutation);
      } else if (mutation.mutation.type === "revoke") {
        // Apply revoke to local KuzuDB graph
        await this.applyRevokeMutation(mutation.mutation);
      }

      // Update WebSocket manager with new version
      if (this.wsManager) {
        this.wsManager.updateVersion(this.currentVersion);
      }
    } catch (error) {
      console.error("[KuzuAuthClient] Failed to apply mutation:", error);
    }
  }

  /**
   * Apply grant mutation to local graph
   */
  private async applyGrantMutation(mutation: any): Promise<void> {
    // TODO: Implement actual grant mutation application to KuzuDB
    // For now, just log it
    console.log("[KuzuAuthClient] Grant:", mutation);

    // Example implementation (needs actual KuzuDB schema):
    // await this.connection.execute(`
    //   MERGE (u:User {id: '${mutation.user}'})
    //   MERGE (r:Resource {id: '${mutation.resource}'})
    //   MERGE (u)-[:HAS_PERMISSION {
    //     action: '${mutation.permission}',
    //     granted_at: '${mutation.granted_at}'
    //   }]->(r)
    // `);
  }

  /**
   * Apply revoke mutation to local graph
   */
  private async applyRevokeMutation(mutation: any): Promise<void> {
    // TODO: Implement actual revoke mutation application to KuzuDB
    // For now, just log it
    console.log("[KuzuAuthClient] Revoke:", mutation);

    // Example implementation:
    // await this.connection.execute(`
    //   MATCH (u:User {id: '${mutation.user}'})-[p:HAS_PERMISSION]->(r:Resource {id: '${mutation.resource}'})
    //   WHERE p.action = '${mutation.permission}'
    //   DELETE p
    // `);
  }

  /**
   * Handle WebSocket connection state changes
   */
  private handleConnectionStateChange(state: ConnectionState): void {
    console.log(`[KuzuAuthClient] WebSocket state: ${state}`);

    if (state === "error") {
      console.warn(
        "[KuzuAuthClient] WebSocket connection error, will auto-reconnect"
      );
    }
  }

  /**
   * Handle WebSocket connection errors
   */
  private handleConnectionError(error: Error): void {
    console.error("[KuzuAuthClient] WebSocket error:", error);

    if (error.message.includes("Full sync required")) {
      console.warn(
        "[KuzuAuthClient] Full sync required - version gap too large"
      );
      // TODO: Trigger full resync
      // this.fullResync();
    }
  }

  /**
   * Clear all caches (Service Worker + IndexedDB)
   */
  async clearCache(): Promise<void> {
    console.log("[KuzuAuthClient] Clearing all caches...");

    // Clear Service Worker cache
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      const messageChannel = new MessageChannel();
      const promise = new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data);
        };
      });
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" }, [
        messageChannel.port2,
      ]);
      await promise;
      console.log("[KuzuAuthClient] ServiceWorker cache cleared");
    }

    // Clear IndexedDB cache
    if (this.idb) {
      await this.idb.clear("metadata");
      await this.idb.clear("csv_data");
      console.log("[KuzuAuthClient] IndexedDB cache cleared");
    }
  }

  /**
   * Cleanup
   */
  async close(): Promise<void> {
    if (this.wsManager) {
      this.wsManager.disconnect();
    }
    if (this.connection) {
      this.connection.close();
    }
    if (this.db) {
      this.db.close();
    }
    if (this.idb) {
      this.idb.close();
    }
  }
}
