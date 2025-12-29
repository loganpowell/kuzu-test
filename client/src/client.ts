import type Database from 'kuzu-wasm';
import { openDB, type IDBPDatabase } from 'idb';

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
  private serverUrl: string;
  private orgId: string;
  private wsConnection: WebSocket | null = null;

  constructor(serverUrl: string, orgId: string) {
    this.serverUrl = serverUrl;
    this.orgId = orgId;
  }

  /**
   * Initialize the client
   */
  async initialize(): Promise<void> {
    console.log('[KuzuAuthClient] Initializing...');
    
    // Open IndexedDB
    this.idb = await openDB<GraphDB>('kuzu-auth', 1, {
      upgrade(db) {
        db.createObjectStore('metadata');
        db.createObjectStore('csv_data');
      },
    });

    // Load KuzuDB WASM
    const kuzu = await import('kuzu-wasm');
    await kuzu.default();
    
    // Create in-memory database
    this.db = new kuzu.Database('', 1, false, false, 0);
    this.connection = new kuzu.Connection(this.db);

    console.log('[KuzuAuthClient] KuzuDB WASM initialized');

    // Load graph data
    await this.loadGraphData();

    console.log('[KuzuAuthClient] Ready');
  }

  /**
   * Load graph data from IndexedDB or fetch from server
   */
  private async loadGraphData(): Promise<void> {
    console.log('[KuzuAuthClient] Loading graph data...');
    
    // Check IndexedDB cache
    const cachedMetadata = await this.idb!.get('metadata', 'current');
    
    let csvData: Map<string, string>;
    
    if (cachedMetadata && cachedMetadata.orgId === this.orgId) {
      console.log('[KuzuAuthClient] Loading from IndexedDB cache');
      csvData = await this.loadFromIndexedDB();
    } else {
      console.log('[KuzuAuthClient] Fetching from server');
      csvData = await this.fetchFromServer();
      await this.saveToIndexedDB(csvData);
    }

    // Create schema and load data
    await this.createSchema();
    await this.loadCSVData(csvData);

    console.log('[KuzuAuthClient] Graph data loaded');
  }

  /**
   * Load CSV data from IndexedDB
   */
  private async loadFromIndexedDB(): Promise<Map<string, string>> {
    const data = new Map<string, string>();
    const tables = ['users', 'groups', 'resources', 'member_of', 'inherits_from', 'user_permissions', 'group_permissions'];
    
    for (const table of tables) {
      const cached = await this.idb!.get('csv_data', table);
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
    const tx = this.idb!.transaction(['metadata', 'csv_data'], 'readwrite');
    
    // Save metadata
    await tx.objectStore('metadata').put({
      version: 1,
      orgId: this.orgId,
      lastSync: Date.now(),
    }, 'current');

    // Save CSV data
    for (const [name, content] of csvData) {
      await tx.objectStore('csv_data').put({
        name,
        content,
        checksum: this.checksum(content),
      }, name);
    }

    await tx.done;
  }

  /**
   * Create KuzuDB schema
   */
  private async createSchema(): Promise<void> {
    // Create node tables
    await this.connection.query(`
      CREATE NODE TABLE User(id STRING, PRIMARY KEY(id))
    `);

    await this.connection.query(`
      CREATE NODE TABLE Group(id STRING, PRIMARY KEY(id))
    `);

    await this.connection.query(`
      CREATE NODE TABLE Resource(id STRING, name STRING, PRIMARY KEY(id))
    `);

    // Create relationship tables
    await this.connection.query(`
      CREATE REL TABLE MEMBER_OF(FROM User TO Group)
    `);

    await this.connection.query(`
      CREATE REL TABLE INHERITS_FROM(FROM Group TO Group)
    `);

    await this.connection.query(`
      CREATE REL TABLE USER_PERMISSION(FROM User TO Resource, capability STRING)
    `);

    await this.connection.query(`
      CREATE REL TABLE GROUP_PERMISSION(FROM Group TO Resource, capability STRING)
    `);
  }

  /**
   * Load CSV data into KuzuDB
   */
  private async loadCSVData(csvData: Map<string, string>): Promise<void> {
    // In a real implementation, we'd write CSV to virtual filesystem
    // For now, we'll parse and insert row by row
    
    for (const [table, content] of csvData) {
      const rows = this.parseCSV(content);
      
      if (table === 'users') {
        for (const row of rows) {
          await this.connection.query(`CREATE (u:User {id: '${row[0]}'}) RETURN u`);
        }
      } else if (table === 'groups') {
        for (const row of rows) {
          await this.connection.query(`CREATE (g:Group {id: '${row[0]}'}) RETURN g`);
        }
      } else if (table === 'resources') {
        for (const row of rows) {
          await this.connection.query(`CREATE (r:Resource {id: '${row[0]}', name: '${row[1]}'}) RETURN r`);
        }
      } else if (table === 'member_of') {
        for (const row of rows) {
          await this.connection.query(`
            MATCH (u:User {id: '${row[0]}'}), (g:Group {id: '${row[1]}'})
            CREATE (u)-[:MEMBER_OF]->(g)
          `);
        }
      } else if (table === 'inherits_from') {
        for (const row of rows) {
          await this.connection.query(`
            MATCH (g1:Group {id: '${row[0]}'}), (g2:Group {id: '${row[1]}'})
            CREATE (g1)-[:INHERITS_FROM]->(g2)
          `);
        }
      } else if (table === 'user_permissions') {
        for (const row of rows) {
          await this.connection.query(`
            MATCH (u:User {id: '${row[0]}'}), (r:Resource {id: '${row[1]}'})
            CREATE (u)-[:USER_PERMISSION {capability: '${row[2]}'}]->(r)
          `);
        }
      } else if (table === 'group_permissions') {
        for (const row of rows) {
          await this.connection.query(`
            MATCH (g:Group {id: '${row[0]}'}), (r:Resource {id: '${row[1]}'})
            CREATE (g)-[:GROUP_PERMISSION {capability: '${row[2]}'}]->(r)
          `);
        }
      }
    }
  }

  /**
   * Check if a user can perform an action on a resource
   */
  async can(userId: string, capability: string, resourceId: string): Promise<boolean> {
    // Query for direct user permission or inherited group permission
    const query = `
      MATCH path = (u:User {id: $userId})-[*1..10]->(r:Resource {id: $resourceId})
      WHERE ANY(rel IN relationships(path) WHERE 
        (type(rel) = 'USER_PERMISSION' AND rel.capability = $capability) OR
        (type(rel) = 'GROUP_PERMISSION' AND rel.capability = $capability)
      )
      RETURN COUNT(*) > 0 AS has_permission
    `;

    const result = await this.connection.query(query, {
      userId,
      capability,
      resourceId,
    });

    const rows = result.getAll();
    return rows.length > 0 && rows[0].has_permission;
  }

  /**
   * Find all resources a user can access
   */
  async findAllResourcesUserCanAccess(userId: string, capability: string): Promise<string[]> {
    const query = `
      MATCH path = (u:User {id: $userId})-[*1..10]->(r:Resource)
      WHERE ANY(rel IN relationships(path) WHERE 
        (type(rel) = 'USER_PERMISSION' AND rel.capability = $capability) OR
        (type(rel) = 'GROUP_PERMISSION' AND rel.capability = $capability)
      )
      RETURN DISTINCT r.id AS resource_id
    `;

    const result = await this.connection.query(query, { userId, capability });
    const rows = result.getAll();
    return rows.map(row => row.resource_id);
  }

  /**
   * Connect to server for real-time updates
   */
  connectWebSocket(): void {
    const wsUrl = this.serverUrl.replace('http', 'ws');
    this.wsConnection = new WebSocket(`${wsUrl}/sync/${this.orgId}`);

    this.wsConnection.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'permission_granted') {
        // Apply incremental update
        await this.grantPermission(
          message.userId,
          message.capability,
          message.resourceId
        );
      } else if (message.type === 'permission_revoked') {
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
   * Grant permission (local update)
   */
  private async grantPermission(userId: string, capability: string, resourceId: string): Promise<void> {
    await this.connection.query(`
      MATCH (u:User {id: $userId}), (r:Resource {id: $resourceId})
      CREATE (u)-[:USER_PERMISSION {capability: $capability}]->(r)
    `, { userId, capability, resourceId });
  }

  /**
   * Revoke permission (local update)
   */
  private async revokePermission(userId: string, capability: string, resourceId: string): Promise<void> {
    await this.connection.query(`
      MATCH (u:User {id: $userId})-[rel:USER_PERMISSION {capability: $capability}]->(r:Resource {id: $resourceId})
      DELETE rel
    `, { userId, capability, resourceId });
  }

  /**
   * Simple CSV parser
   */
  private parseCSV(content: string): string[][] {
    return content
      .trim()
      .split('\n')
      .slice(1) // Skip header
      .map(line => line.split(',').map(field => field.trim()));
  }

  /**
   * Simple checksum
   */
  private checksum(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Cleanup
   */
  async close(): Promise<void> {
    if (this.wsConnection) {
      this.wsConnection.close();
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
