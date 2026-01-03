# Client-Side Kuzu Security Architecture

## Executive Summary

After comprehensive investigation, **server-side KuzuDB is not feasible in Cloudflare Workers** due to filesystem dependencies in the C++ library. However, **client-side validation can be made cryptographically secure** with proper architecture.

## Why Server-Side Failed

All WASM compilation approaches are blocked:

| Approach                      | Blocker                                               |
| ----------------------------- | ----------------------------------------------------- |
| Emscripten                    | Requires WORKERFS → needs Web Workers (not supported) |
| WASI                          | Experimental, missing syscalls Kuzu needs             |
| Rust (wasm32-unknown-unknown) | No filesystem support                                 |
| Python/Pyodide                | Kuzu not in Pyodide packages                          |

**Root Cause:** Kuzu's C++ library requires filesystem operations that are fundamentally incompatible with all Workers WASM targets.

## System Architecture Overview

```mermaid
graph TB
    subgraph "Client Browser"
        UI[UI Layer]
        ClientKuzu[Kuzu WASM<br/>Full Graph]
        ClientCSV[CSV Cache<br/>IndexedDB]
        ClientMap[Permission Map<br/>Fast Lookups]
    end

    subgraph "Cloudflare Workers"
        Worker[Worker Script]

        subgraph "Durable Object: GraphStateDO"
            DO[Graph State Manager]
            DOGraph[Permission Graph<br/>In-Memory]
            DOMap[Direct Permissions<br/>Map Index]
            DOCommit[Commitment Cache<br/>Per-User State]
        end

        KV[(KV Store<br/>CSV Snapshots)]
        R2[(R2 Bucket<br/>CSV Archives)]
    end

    subgraph "External Storage"
        Analytics[(Analytics<br/>Logs)]
    end

    UI -->|Mutations| Worker
    UI -->|Query| ClientKuzu

    ClientKuzu -->|Load Graph| ClientCSV
    ClientMap -->|Fast Path| UI

    Worker -->|Validate| DO
    Worker -->|Get CSV| KV

    DO -->|Snapshot| KV
    KV -->|Archive| R2

    DO -->|Audit Logs| Analytics

    ClientCSV -.->|WebSocket Sync| DO
    DOCommit -.->|Push Updates| ClientMap

    style ClientKuzu fill:#e1f5ff
    style DO fill:#fff4e1
    style KV fill:#f0e1ff
    style R2 fill:#f0e1ff
```

## Component Responsibilities

```mermaid
graph LR
    subgraph "Client Responsibilities"
        C1[Complex Graph Queries<br/>Transitive Permissions]
        C2[CSV Graph Cache<br/>IndexedDB Storage]
        C3[Real-time Sync<br/>WebSocket Updates]
        C4[Direct Permission Map<br/>Fast Path Checks]
    end

    subgraph "Worker Responsibilities"
        W1[HTTP Request Routing]
        W2[Authentication]
        W3[CSV Distribution]
        W4[Rate Limiting]
    end

    subgraph "Durable Object Responsibilities"
        D1[Permission Graph<br/>Source of Truth]
        D2[Mutation Validation]
        D3[Commitment Generation]
        D4[WebSocket Coordination]
        D5[Audit Logging]
        D6[CSV Export/Import]
    end

    subgraph "KV Store Responsibilities"
        K1[CSV Snapshots<br/>per Version]
        K2[Fast Read Access]
        K3[Geographic Distribution]
    end

    subgraph "R2 Bucket Responsibilities"
        R1[CSV Archives<br/>Long-term Storage]
        R2[Backup History]
        R3[Compliance Retention]
    end

    style C1 fill:#e1f5ff
    style C2 fill:#e1f5ff
    style C3 fill:#e1f5ff
    style C4 fill:#e1f5ff
    style W1 fill:#ffe1e1
    style W2 fill:#ffe1e1
    style W3 fill:#ffe1e1
    style W4 fill:#ffe1e1
    style D1 fill:#fff4e1
    style D2 fill:#fff4e1
    style D3 fill:#fff4e1
    style D4 fill:#fff4e1
    style D5 fill:#fff4e1
    style D6 fill:#fff4e1
    style K1 fill:#f0e1ff
    style K2 fill:#f0e1ff
    style K3 fill:#f0e1ff
    style R1 fill:#e1ffe1
    style R2 fill:#e1ffe1
    style R3 fill:#e1ffe1
```

## Secure Client-Side Architecture

### Core Principle

**The server is the source of truth; the client is the query engine.**

### Permission Check Flow

```mermaid
sequenceDiagram
    participant U as User/UI
    participant C as Client Kuzu
    participant CM as Client Map
    participant W as Worker
    participant DO as Durable Object
    participant KV as KV Store

    Note over U,KV: Permission Check Flow

    U->>CM: Check permission<br/>(read:doc123)

    alt Fast Path: Direct Permission
        CM->>CM: Map lookup<br/>O(1) - <1ms
        CM-->>U: ✅ Allowed
    else Complex Path: Transitive Query
        CM->>C: Not in direct map
        C->>C: Query Kuzu graph<br/>(complex Cypher)
        Note over C: MATCH (u:User)-[:MEMBER_OF]->(g:Group)<br/>-[:INHERITS_FROM*0..]->(parent:Group)<br/>-[:HAS_PERM]->(r:Resource)
        C-->>CM: Permission path found

        CM->>W: Submit proof + mutation
        W->>W: Verify JWT
        W->>DO: Validate permission proof

        DO->>DO: Check signature
        DO->>DO: Validate path in snapshot
        DO->>DO: Log audit entry

        alt Valid Permission
            DO-->>W: ✅ Valid
            W->>DO: Apply mutation
            DO->>DO: Update graph
            DO->>KV: Export CSV snapshot
            DO-->>W: Success
            W-->>U: ✅ Mutation applied

            DO->>C: WebSocket: Graph update
            C->>C: Update local graph
            C->>CM: Update permission map
        else Invalid Permission
            DO-->>W: ❌ Invalid
            W-->>U: ❌ Permission denied
        end
    end
```

### CSV Maintenance Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant W as Worker
    participant DO as Durable Object
    participant KV as KV Store
    participant R2 as R2 Bucket
    participant WS as WebSocket

    Note over C,R2: CSV Export, Storage, and Distribution

    rect rgb(255, 244, 225)
        Note over DO: Graph Mutation Occurs
        DO->>DO: Update in-memory graph
        DO->>DO: Increment version counter
        DO->>DO: Generate CSV from graph

        Note over DO: nodes.csv, edges.csv,<br/>permissions.csv, groups.csv
    end

    rect rgb(240, 225, 255)
        Note over KV: Store Current Version
        DO->>KV: PUT csv:v{version}:nodes
        DO->>KV: PUT csv:v{version}:edges
        DO->>KV: PUT csv:v{version}:permissions
        DO->>KV: PUT csv:v{version}:groups
        DO->>KV: PUT csv:current-version<br/>{version}
    end

    rect rgb(225, 255, 225)
        Note over R2: Archive Old Versions
        alt Every 10 versions OR daily
            DO->>R2: PUT archive/{date}/v{old}.tar.gz
            DO->>KV: DELETE csv:v{old}:*
        end
    end

    rect rgb(225, 245, 255)
        Note over WS,C: Real-time Sync
        DO->>WS: Broadcast: graph_updated<br/>{version, changes}
        WS->>C: Push update
        C->>C: Check local version

        alt Version mismatch
            C->>W: GET /csv/current
            W->>KV: GET csv:v{version}:*
            KV-->>W: CSV files
            W-->>C: CSV bundle
            C->>C: Import to IndexedDB
            C->>C: Reload Kuzu graph
        else Incremental update
            C->>C: Apply changes to graph
            C->>C: Update permission map
        end
    end

    rect rgb(255, 225, 225)
        Note over C: On Initial Load
        C->>W: GET /csv/current
        W->>KV: GET csv:current-version
        KV-->>W: {version: 42}
        W->>KV: GET csv:v42:*
        KV-->>W: All CSV files
        W-->>C: CSV bundle
        C->>C: Store in IndexedDB
        C->>C: Load into Kuzu
        C->>C: Build permission map
    end
```

### Mutation and CRUD Flow

```mermaid
flowchart TB
    Start([User Action])

    Start --> CheckAuth{Authenticated?}
    CheckAuth -->|No| AuthError[❌ 401 Unauthorized]
    CheckAuth -->|Yes| CheckPerm[Check Permission]

    CheckPerm --> FastPath{In Direct<br/>Permission Map?}

    FastPath -->|Yes| FastCheck[Map Lookup<br/>O_1 - @1ms]
    FastPath -->|No| GraphQuery[Kuzu Graph Query<br/>Transitive Check]

    FastCheck --> HasPerm{Has Permission?}
    GraphQuery --> GenProof[Generate Proof<br/>with Path]
    GenProof --> HasPerm

    HasPerm -->|No| PermError[❌ 403 Forbidden<br/>Log Failed Attempt]
    HasPerm -->|Yes| ValidateMutation[Validate Mutation]

    ValidateMutation --> MutationType{Mutation Type}

    MutationType -->|CREATE| CreateFlow[Create Node/Edge]
    MutationType -->|UPDATE| UpdateFlow[Update Properties]
    MutationType -->|DELETE| DeleteFlow[Delete Node/Edge]
    MutationType -->|GRANT| GrantFlow[Grant Permission]
    MutationType -->|REVOKE| RevokeFlow[Revoke Permission]

    CreateFlow --> DOApply
    UpdateFlow --> DOApply
    DeleteFlow --> DOApply
    GrantFlow --> DOApply
    RevokeFlow --> DOApply

    DOApply[Apply to DO Graph] --> GenVersion[Increment Version]
    GenVersion --> ExportCSV[Export CSV]
    ExportCSV --> StoreKV[Store in KV]
    StoreKV --> BroadcastWS[Broadcast via WebSocket]
    BroadcastWS --> LogAudit[Log Audit Entry]
    LogAudit --> Success[✅ Success Response]

    Success --> SyncClients[Sync to Clients]
    SyncClients --> UpdateLocalGraph[Update Local Graphs]
    UpdateLocalGraph --> UpdateMaps[Update Permission Maps]
    UpdateMaps --> End([Complete])

    AuthError --> End
    PermError --> End

    style FastCheck fill:#90EE90
    style GraphQuery fill:#FFD700
    style DOApply fill:#FFA500
    style BroadcastWS fill:#87CEEB
    style Success fill:#90EE90
    style AuthError fill:#FF6B6B
    style PermError fill:#FF6B6B
```

### Security Model: Edge-Based Validation

**Key Insight**: Instead of validating path structure, we validate **exact edge IDs**. The client finds the shortest permission path and returns the edge IDs. The server simply checks if those edges exist in its graph.

```mermaid
flowchart LR
    subgraph "Client Side"
        C1[Query: Find shortest<br/>permission path]
        C2[Return edge IDs:<br/>e123, e456, e789]
    end
    
    subgraph "Server Side"
        S1[Check: edges.has e123 ?]
        S2[Check: edges.has e456 ?]
        S3[Check: edges.has e789 ?]
        S4[All exist? ✅ Valid]
    end
    
    C1 --> C2
    C2 --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    
    style C2 fill:#E1F5FF
    style S4 fill:#90EE90
```

#### Server-Side Edge Storage

```typescript
// ============================================================================
// SERVER: Edge-Based Permission Graph
// ============================================================================

interface Edge {
  id: string;              // Stable edge ID (UUID)
  type: string;            // MEMBER_OF, INHERITS_FROM, HAS_PERMISSION
  sourceId: string;        // Source node ID
  targetId: string;        // Target node ID
  properties: Record<string, any>; // capability, etc.
  createdAt: number;
  revokedAt?: number;      // Soft delete for audit trail
}

class GraphStateDO {
  // O(1) edge lookup by ID
  private edges: Map<string, Edge> = new Map();
  
  // O(1) edge lookup by type and source
  private edgesBySource: Map<string, Set<string>> = new Map();
  
  // Fast permission path validation
  async validatePermissionPath(edgeIds: string[]): Promise<{
    valid: boolean;
    reason?: string;
    invalidEdgeId?: string;
  }> {
    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      
      // Edge must exist
      if (!edge) {
        return {
          valid: false,
          reason: 'Edge does not exist',
          invalidEdgeId: edgeId
        };
      }
      
      // Edge must not be revoked
      if (edge.revokedAt) {
        return {
          valid: false,
          reason: 'Edge has been revoked',
          invalidEdgeId: edgeId
        };
      }
    }
    
    return { valid: true }; // All edges valid
  }
}

// ============================================================================
// CLIENT: Query for Shortest Path with Edge IDs
// ============================================================================

async function checkPermission(
  userId: string, 
  resourceId: string, 
  capability: string
): Promise<PermissionProof | null> {
  const result = await clientKuzu.query(`
    MATCH path = (u:User {id: $userId})
      -[r1:MEMBER_OF]->(g:Group)
      -[r2:INHERITS_FROM*0..]->(parent:Group)
      -[r3:HAS_PERMISSION {capability: $capability}]->(r:Resource {id: $resourceId})
    WITH path, 
         [rel in relationships(path) | id(rel)] as edgeIds,
         length(path) as pathLength
    ORDER BY pathLength ASC
    LIMIT 1
    RETURN edgeIds, pathLength
  `);
  
  if (result.numRows === 0) {
    return null; // No permission path found
  }
  
  return {
    userId,
    resourceId,
    capability,
    edgeIds: result.rows[0].edgeIds,
    pathLength: result.rows[0].pathLength
  };
}

// ============================================================================
// Simplified Commitment (No Inheritance Snapshot Needed!)
// ============================================================================

interface PermissionCommitment {
  userId: string;
  permissions: string[]; // Direct permissions (fast path)
  timestamp: number;
  signature: string; // HMAC-SHA256
  
  // No need for inheritanceSnapshot - we validate edges directly!
}

async function generateCommitment(
  userId: string
): Promise<PermissionCommitment> {
  const permissions = await getDirectPermissions(userId);

  const commitment = {
    userId,
    permissions,
    timestamp: Date.now(),
  };

  commitment.signature = await hmacSign(
    JSON.stringify(commitment),
    SERVER_SECRET
  );

  return commitment;
}

// ============================================================================
// Benefits of Edge-Based Validation
// ============================================================================
```

| Aspect | Edge-Based with Chain Validation (Proposed) | Structure-Based (Original) |
|--------|------------|------------------------------|
| **Validation Complexity** | O(n) edge lookups + O(n) chain check | O(n²) path structure check |
| **Server Logic** | Simple: `edges.has(id)` + connectivity check | Complex: validate graph structure |
| **Chain Validation** | Verify edge[i].target = edge[i+1].source | Implicit in structure validation |
| **Audit Trail** | Exact edges that granted permission | Path description only |
| **Debugging** | Traceable edge IDs with connectivity | Abstract path |
| **Performance** | ~1ms per edge + ~1ms chain check | ~10ms path validation |
| **Security** | Can't forge edge IDs (UUIDs) + can't submit disconnected edges | Could claim false path |
| **Storage** | Map<id, Edge> with sourceId/targetId | Snapshot of full hierarchy |
| **Commitment Size** | Small (direct perms only) | Large (includes inheritance) |


async function submitMutation(mutation: Mutation, proof: PermissionProof) {
  // Client signs the proof
  proof.clientSignature = await signWithSessionKey(proof);

  const response = await fetch("/api/mutate", {
    method: "POST",
    body: JSON.stringify({ mutation, proof }),
    headers: { Authorization: `Bearer ${sessionToken}` },
  });

  return response.json();
### Permission Check Flow (Edge-Based Validation)

```mermaid
sequenceDiagram
    participant U as User/UI
    participant C as Client Kuzu
    participant CM as Client Map
    participant W as Worker
    participant DO as Durable Object
    participant Edges as Edge Store<br/>(Map&lt;id Edge&gt;)
    participant KV as KV Store

    Note over U,KV: Permission Check Flow with Edge Validation

    U->>CM: Check permission<br/>(read:doc123)
    
    alt Fast Path: Direct Permission
        CM->>CM: Map lookup<br/>O(1) - &lt;1ms
        CM-->>U: ✅ Allowed
    else Transitive Path: Edge-Based Query
        CM->>C: Not in direct map
        C->>C: Query for shortest path<br/>with edge IDs
        Note over C: MATCH path = (u)-[*]->(r)<br/>RETURN [rel in relationships(path) | id(rel)]<br/>ORDER BY length(path) LIMIT 1
        C-->>CM: Found path:<br/>edgeIds=['e123' 'e456' 'e789']
        
        CM->>W: Submit proof + mutation<br/>{edgeIds userId resourceId}
        W->>W: Verify JWT
        W->>DO: Validate edge IDs
        
        loop For each edge ID
            DO->>Edges: edges.has(edgeId)?
            Edges-->>DO: ✅ exists not revoked
        end
        
        DO->>DO: Verify chain connectivity<br/>edge[i].target = edge[i+1].source
        DO->>DO: Check user → ... → resource
        DO->>DO: All edges valid + connected ✅
        DO->>DO: Log audit entry<br/>(with exact edge IDs)
        
        alt Valid Permission
            DO-->>W: ✅ Valid
            W->>DO: Apply mutation
            DO->>DO: Update graph
            DO->>Edges: Add/update edges
            DO->>KV: Export CSV snapshot
            DO-->>W: Success
            W-->>U: ✅ Mutation applied
            
            DO->>C: WebSocket: Graph update<br/>{addedEdges removedEdges}
            C->>C: Update local graph
            C->>CM: Update permission map
        else Invalid Permission
            Note over DO: Edge missing or revoked
            DO-->>W: ❌ Invalid edge IDs
            W-->>U: ❌ Permission denied
        end
    end
```

## Edge-Based Validation: Complete Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client Kuzu
    participant W as Worker
    participant DO as Durable Object
    participant ES as Edge Store

    Note over U,ES: Full Edge-Based Permission Flow

    rect rgb(225, 245, 255)
        Note over U,C: 1. Client Query (Shortest Path)
        U->>C: checkPermission(userId resourceId 'write')
        C->>C: Execute Cypher query<br/>Find shortest path<br/>Extract edge IDs
        C-->>U: {edgeIds: ['e123' 'e456' 'e789']<br/>pathLength: 3}
    end
    
    rect rgb(255, 244, 225)
        Note over U,DO: 2. Server Validation
        U->>W: POST /api/mutation<br/>{action proof: {edgeIds}}
        W->>W: Verify JWT
        W->>DO: validateAndApply(mutation proof)
        
        DO->>ES: edges.get('e123')
        ES-->>DO: {type: 'MEMBER_OF' from: u1 to: g1 ...}
        
        DO->>ES: edges.get('e456')
        ES-->>DO: {type: 'INHERITS_FROM' from: g1 to: g2 ...}
        
        DO->>ES: edges.get('e789')
        ES-->>DO: {type: 'HAS_PERMISSION' cap: 'write' ...}
        
        DO->>DO: Check all edges exist ✅<br/>Check none revoked ✅
        DO->>DO: Verify chain connectivity:<br/>u1→g1, g1→g2, g2→r1 ✅<br/>Path is valid ✅
    end
    
    rect rgb(225, 255, 225)
        Note over DO,ES: 3. Apply Mutation
        DO->>ES: Create new edge<br/>id='e999' type='HAS_PERMISSION'
        DO->>DO: Increment version counter
        DO->>DO: Log audit entry with edge IDs
        DO-->>W: ✅ Mutation applied
        W-->>U: ✅ Success
    end
    
    rect rgb(255, 225, 225)
        Note over DO,C: 4. Broadcast Update
        DO->>C: WebSocket: edge_added<br/>{id: 'e999' type: 'HAS_PERMISSION' ...}
        C->>C: Update local graph<br/>Add edge to Kuzu
        C->>C: Update permission map
    end
```

## Edge Storage in Durable Object

```typescript
class GraphStateDO {
  // Primary edge storage - O(1) lookup by ID
  private edges: Map<string, Edge> = new Map();
  
  // Index by source node - O(1) lookup of all edges from a node
  private edgesBySource: Map<string, Set<string>> = new Map();
  
  // Index by target node - O(1) lookup of all edges to a node
  private edgesByTarget: Map<string, Set<string>> = new Map();
  
  // Index by type - O(1) lookup of all edges of a type
  private edgesByType: Map<string, Set<string>> = new Map();
  
  /**
   * Validate that a permission path exists AND forms a valid chain
   * @param edgeIds - Edge IDs returned from client Kuzu query
   * @param userId - User attempting the action
   * @param resourceId - Target resource
   * @returns true if all edges exist, are not revoked, AND form a connected path
   */
  async validatePermissionPath(
    edgeIds: string[],
    userId: string,
    resourceId: string
  ): Promise<{
    valid: boolean;
    reason?: string;
    invalidEdgeId?: string;
    brokenChainAt?: number;
  }> {
    if (edgeIds.length === 0) {
      return { valid: false, reason: 'No edges provided' };
    }

    // Fetch all edges
    const edges: Edge[] = [];
    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      
      if (!edge) {
        return {
          valid: false,
          reason: 'Edge does not exist',
          invalidEdgeId: edgeId
        };
      }
      
      if (edge.revokedAt) {
        return {
          valid: false,
          reason: 'Edge has been revoked',
          invalidEdgeId: edgeId
        };
      }
      
      edges.push(edge);
    }
    
    // CRITICAL: Verify chain connectivity
    // Edge[i].target must equal Edge[i+1].source
    
    // First edge must start from the user
    if (edges[0].sourceId !== userId) {
      return {
        valid: false,
        reason: 'First edge does not start from user',
        brokenChainAt: 0
      };
    }
    
    // Check each link in the chain
    for (let i = 0; i < edges.length - 1; i++) {
      if (edges[i].targetId !== edges[i + 1].sourceId) {
        return {
          valid: false,
          reason: `Chain broken: edge ${i} target (${edges[i].targetId}) != edge ${i+1} source (${edges[i+1].sourceId})`,
          brokenChainAt: i
        };
      }
    }
    
    // Last edge must end at the resource
    const lastEdge = edges[edges.length - 1];
    if (lastEdge.targetId !== resourceId) {
      return {
        valid: false,
        reason: 'Last edge does not end at resource',
        brokenChainAt: edges.length - 1
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Create a new edge (e.g., permission grant)
   */
  async createEdge(edge: Omit<Edge, 'id' | 'createdAt'>): Promise<Edge> {
    const id = crypto.randomUUID(); // Cryptographically secure
    const newEdge: Edge = {
      ...edge,
      id,
      createdAt: Date.now()
    };
    
    // Store in all indexes
    this.edges.set(id, newEdge);
    this.indexEdge(newEdge);
    
    // Audit log
    await this.logAudit({
      action: 'EDGE_CREATED',
      edgeId: id,
      edgeType: edge.type,
      timestamp: newEdge.createdAt
    });
    
    return newEdge;
  }
  
  /**
   * Revoke an edge (soft delete for audit trail)
   */
  async revokeEdge(edgeId: string): Promise<void> {
    const edge = this.edges.get(edgeId);
    if (!edge) {
      throw new Error('Edge not found');
    }
    
    edge.revokedAt = Date.now();
    
    await this.logAudit({
      action: 'EDGE_REVOKED',
      edgeId,
      edgeType: edge.type,
      timestamp: edge.revokedAt
    });
  }
  
  private indexEdge(edge: Edge): void {
    // Index by source
    if (!this.edgesBySource.has(edge.sourceId)) {
      this.edgesBySource.set(edge.sourceId, new Set());
    }
    this.edgesBySource.get(edge.sourceId)!.add(edge.id);
    
    // Index by target
    if (!this.edgesByTarget.has(edge.targetId)) {
      this.edgesByTarget.set(edge.targetId, new Set());
    }
    this.edgesByTarget.get(edge.targetId)!.add(edge.id);
    
    // Index by type
    if (!this.edgesByType.has(edge.type)) {
      this.edgesByType.set(edge.type, new Set());
    }
    this.edgesByType.get(edge.type)!.add(edge.id);
  }
}
```

### Why Edge-Based Validation Is Secure

#### 1. Server Controls All Edge IDs
- Only server can create edges (with UUIDs)
- Client cannot forge edge IDs
- Edge IDs are cryptographically random (UUID v4)
- All edge mutations logged and audited

#### 2. Chain Connectivity Validation
- Server checks edges exist: `edges.has(edgeId)` - O(1) per edge
- **Server verifies chain**: `edge[i].target === edge[i+1].source`
- Prevents attack: submitting valid but disconnected edges
- O(n) validation (still fast, no graph traversal)
- Example attack prevented:
  ```typescript
  // Malicious client submits valid edges that don't connect:
  edgeIds: [
    'e123', // user1 → groupA
    'e456', // groupB → groupC (disconnected!)
    'e789'  // groupD → resource1 (disconnected!)
  ]
  // Server detects: groupA !== groupB, rejects
  ```

#### 3. Immutable Edge History
- Edges are soft-deleted (revokedAt timestamp)
- Full audit trail of when edge was created/revoked
- Can reconstruct permission state at any point in time
- Compliance-friendly (GDPR, SOC 2)

#### 4. Client Optimization, Server Authority
- Client finds the shortest path (optimization)
- Server validates edges exist AND form connected chain (authority)
- Even if client is compromised:
  - Can't forge edge IDs (server-generated UUIDs)
  - Can't submit disconnected edges (chain validation fails)
  - Can't bypass security (all validation server-side)
- Client can only query faster, not bypass security

#### 5. Defense in Depth

### 5. Attack Resistance

| Attack Vector                   | Mitigation with Edge-Based Validation |
| ------------------------------- | ------------------------------------------------ |
| **Forge edge IDs**            | Server-generated UUIDs (cryptographically random) |
| **Submit disconnected edges**       | Server verifies chain connectivity (target→source) |
| **Replay old proof**       | Edge revocation timestamps checked |
| **Claim false permission path** | Server validates all edge IDs exist + form connected chain |
| **Modify permission graph**     | Only server can create/revoke edges, full audit trail        |
| **Bypass validation**           | All mutations require edge ID + chain validation           |
| **Man-in-the-middle**           | HTTPS + JWT authentication                 |

#### Example Attack Prevented:

```typescript
// ❌ ATTACK: Malicious client submits valid but disconnected edges
const maliciousProof = {
  userId: 'user-123',
  resourceId: 'doc-789',
  edgeIds: [
    'e-abc', // user-123 → team-engineering
    'e-xyz', // team-sales → org-acme (NOT CONNECTED!)
    'e-def'  // org-root → doc-789 (NOT CONNECTED!)
  ]
};

// ✅ SERVER DETECTS: Chain validation fails
const validation = await validatePermissionPath(
  maliciousProof.edgeIds,
  maliciousProof.userId,
  maliciousProof.resourceId
);

// Returns:
{
  valid: false,
  reason: "Chain broken: edge 0 target (team-engineering) != edge 1 source (team-sales)",
  brokenChainAt: 0
}

// Audit log records the attack attempt
await logAuditEntry({
  eventType: 'ATTACK_DETECTED',
  attackType: 'DISCONNECTED_EDGE_CHAIN',
  userId: 'user-123',
  attemptedEdges: maliciousProof.edgeIds,
  result: 'BLOCKED'
});
```

## Map-Based Intermediary Architecture

The permission map serves as a critical fast-path optimization:

```mermaid
graph TB
    subgraph "Client Permission Map Structure"
        direction TB
        PermMap[Permission Map<br/>Map&lt;string, boolean&gt;]

        DirectPerms["Direct Permissions<br/>'write:doc123' → true<br/>'read:doc456' → true"]

        CachedPaths["Cached Transitive<br/>'write:project789' → true<br/>(via group inheritance)"]

        TTL["TTL Tracking<br/>Expires after 1 hour"]
    end

    subgraph "Map Population Sources"
        Commitment["Server Commitment<br/>(on login)"]
        WSUpdate["WebSocket Updates<br/>(real-time)"]
        QueryResult["Kuzu Query Results<br/>(on-demand)"]
    end

    subgraph "Map Usage"
        FastCheck["O(1) Lookup<br/>< 1ms"]
        Fallback["Miss → Kuzu Query<br/>10-100ms"]
        Cache["Cache Result<br/>for future"]
    end

    Commitment --> PermMap
    WSUpdate --> PermMap
    QueryResult --> PermMap

    PermMap --> DirectPerms
    PermMap --> CachedPaths
    PermMap --> TTL

    DirectPerms --> FastCheck
    CachedPaths --> FastCheck
    FastCheck -.->|Cache Miss| Fallback
    Fallback --> Cache
    Cache --> PermMap

    style PermMap fill:#FFE1E1
    style FastCheck fill:#90EE90
    style Fallback fill:#FFD700
```

### Map Update Flow

```mermaid
sequenceDiagram
    participant U as User
    participant W as Worker
    participant DO as Durable Object
    participant Auth as Auth Service

    U->>W: POST /api/auth/login<br/>{username, password}
    W->>Auth: Verify credentials
    Auth-->>W: ✅ User verified

    W->>DO: Generate commitment<br/>{userId}

    rect rgb(255, 244, 225)
        Note over DO: Commitment Generation
        DO->>DO: Get user's direct permissions
        DO->>DO: Get user's group memberships
        DO->>DO: Get group inheritance snapshot
        DO->>DO: Build commitment object
        DO->>DO: Sign with HMAC-SHA256
        DO->>DO: Store in commitment cache
    end

    DO-->>W: Commitment + signature
    W->>W: Generate JWT token
    W-->>U: {token, commitment}

    U->>U: Store commitment in memory
    U->>U: Build permission map
    U->>U: Subscribe to WebSocket

    Note over U: User session established<br/>Permission map ready

    rect rgb(225, 245, 255)
        Note over DO,U: Commitment Refresh (hourly)
        DO->>U: commitment_refresh event
        U->>W: GET /api/commitment/refresh
        W->>DO: Regenerate commitment
        DO-->>W: New commitment
        W-->>U: New commitment
        U->>U: Update permission map
    end
```

## Cloudflare Services Integration

```mermaid
graph TB
    subgraph "Edge Network"
        CF[Cloudflare CDN]
        Worker[Worker Script<br/>Global Distribution]
    end

    subgraph "Durable Object Instance"
        DO[GraphStateDO<br/>Single Instance]
        DOState[In-Memory State<br/>Permission Graph]
        DOWS[WebSocket Server<br/>Connection Manager]
    end

    subgraph "KV Storage"
        KVCurrent[Current CSV<br/>Fast Read Access]
        KVVersions[Version History<br/>Last 10 versions]
        KVMeta[Metadata<br/>Version info, checksums]
    end

    subgraph "R2 Storage"
        R2Archive[CSV Archives<br/>Long-term retention]
        R2Backup[Backup Bundles<br/>Daily snapshots]
        R2Audit[Audit Logs<br/>Compliance]
    end

    subgraph "Analytics & Monitoring"
        Analytics[Workers Analytics]
        Logs[Logpush<br/>to external SIEM]
        Metrics[Custom Metrics<br/>Performance tracking]
    end

    CF -->|Route Request| Worker
    Worker -->|HTTP| DO
    Worker -->|Read CSV| KVCurrent

    DO -->|Write| DOState
    DO -->|Manage| DOWS
    DO -->|Export CSV| KVCurrent
    DO -->|Version| KVVersions
    DO -->|Metadata| KVMeta

    KVVersions -->|Archive Old| R2Archive
    DO -->|Daily Backup| R2Backup
    DO -->|Audit Stream| R2Audit

    Worker -->|Track| Analytics
    DO -->|Send Logs| Logs
    DO -->|Report| Metrics

    DOWS -.->|WebSocket| CF
    CF -.->|WebSocket| Client[Clients<br/>Real-time Sync]

    style Worker fill:#FFA500
    style DO fill:#FFD700
    style KVCurrent fill:#E1BFFF
    style R2Archive fill:#90EE90
    style Analytics fill:#87CEEB

    class DO,DOState,DOWS doclass
    class KVCurrent,KVVersions,KVMeta kvclass
    class R2Archive,R2Backup,R2Audit r2class

    classDef doclass fill:#FFF4E1,stroke:#FF8C00,stroke-width:2px
    classDef kvclass fill:#F0E1FF,stroke:#9370DB,stroke-width:2px
    classDef r2class fill:#E1FFE1,stroke:#228B22,stroke-width:2px
```

### KV vs R2 Usage Strategy

| Aspect             | KV Store                                                               | R2 Bucket                                                               |
| ------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Purpose**        | Current version + recent history                                       | Long-term archives + backups                                            |
| **Access Pattern** | High-frequency reads                                                   | Infrequent reads                                                        |
| **Data Volume**    | ~10 versions × ~50MB = 500MB                                           | Unlimited historical data                                               |
| **TTL**            | Delete after 10 versions                                               | Lifecycle policies (90+ days)                                           |
| **Performance**    | Edge-cached, <10ms reads                                               | Origin fetch, ~50-200ms                                                 |
| **Cost Model**     | $0.50 per million reads                                                | $0.015 per GB storage                                                   |
| **Use Cases**      | - Current CSV distribution<br/>- Quick rollback<br/>- Version metadata | - Compliance archives<br/>- Disaster recovery<br/>- Audit trail storage |

### Data Flow: DO → KV → R2

```mermaid
flowchart LR
    subgraph "Real-time (Durable Object)"
        DO[Permission Graph<br/>In-Memory]
        Export[Export to CSV]
    end

    subgraph "Short-term (KV)"
        Current[Current Version<br/>v42]
        Recent[Recent Versions<br/>v41, v40, v39...]
    end

    subgraph "Long-term (R2)"
        Archive[Archive<br/>2024-12-30/v32.tar.gz]
        Backup[Daily Backup<br/>full-graph-2024-12-30.tar.gz]
    end

    DO -->|Every mutation| Export
    Export -->|Write| Current
    Export -->|Append| Recent

    Recent -->|When > 10 versions| Archive
    DO -->|Daily at midnight| Backup

    Current -.->|Read| Client[Client Initial Load]
    Recent -.->|Read| Client2[Client Rollback]
    Archive -.->|Read| Recovery[Disaster Recovery]

    style DO fill:#FFD700
    style Current fill:#E1BFFF
    style Recent fill:#E1BFFF
    style Archive fill:#90EE90
    style Backup fill:#90EE90
```

## Commitment Generation Flow

```mermaid
sequenceDiagram
    participant DO as Durable Object
    participant WS as WebSocket Server
    participant C1 as Client 1
    participant C2 as Client 2
    participant CM1 as Client 1 Map
    participant CM2 as Client 2 Map

    Note over DO: Permission Change Occurs
    DO->>DO: Grant permission<br/>team-eng → write:doc123
    DO->>DO: Find affected users

    par Broadcast to all clients
        DO->>WS: Broadcast update
        WS->>C1: graph_updated event
        WS->>C2: graph_updated event
    end

    par Update client maps
        C1->>CM1: Invalidate related entries
        C1->>CM1: Add new permission
        CM1->>CM1: Mark timestamp

        C2->>CM2: Invalidate related entries
        C2->>CM2: Add new permission
        CM2->>CM2: Mark timestamp
    end

    Note over C1,C2: Maps stay in sync<br/>within ~100ms

    rect rgb(255, 244, 225)
        Note over CM1: TTL Expiration (1 hour)
        CM1->>CM1: Check timestamps
        CM1->>CM1: Remove expired entries
        CM1->>C1: Request fresh commitment
        C1->>DO: GET /api/commitment
        DO-->>C1: New signed commitment
        C1->>CM1: Rebuild map
    end

```

## Why This Is Secure

| CSV export (DO → KV) | 100-500ms | ~50MB total, batched writes |
| CSV fetch (KV → Client) | 50-200ms | Edge-cached, parallel downloads |
| WebSocket sync | <100ms | Delta updates only |
| Initial page load | 1-3s | Parallel: HTML + CSV + auth |

### Performance Optimization Strategy

```mermaid
graph TB
    subgraph "Client-Side Optimizations"
        C1[IndexedDB Cache<br/>Persistent storage]
        C2[Service Worker<br/>Offline capability]
        C3[Incremental Sync<br/>Delta updates only]
        C4[Background Refresh<br/>Non-blocking loads]
    end

    subgraph "Network Optimizations"
        N1[HTTP/2 Push<br/>CSV preload]
        N2[Compression<br/>gzip/brotli]
        N3[CDN Edge Cache<br/>KV at edge]
        N4[Connection Pooling<br/>WebSocket reuse]
    end

    subgraph "Server Optimizations"
        S1[Permission Map Index<br/>O_1 fast path]
        S2[Commitment Cache<br/>Pre-computed state]
        S3[Batch CSV Exports<br/>Debounce writes]
        S4[Parallel Processing<br/>Multi-core DO]
    end

    User([User Request]) --> C4
    C4 --> C1
    C1 -.->|Cache Hit| Fast[< 100ms Response]
    C1 -.->|Cache Miss| N3
    N3 --> N2
    N2 --> S2
    S2 --> S1
    S1 --> Fast

    C3 --> N4
    N4 --> S3

    style Fast fill:#90EE90
    style C1 fill:#E1F5FF
    style S1 fill:#FFE1E1
```

### 1. Server Controls All Edge IDs

- Only server can create edges (generates UUIDs)
- Client cannot modify edges or forge IDs
- All edge mutations logged and audited

### 2. Simplified Commitments

- Only need direct permissions (no inheritance snapshot)
- Smaller payload, faster generation
- Commitments expire after 1 hour

### 3. Edge Existence + Chain Connectivity Validation

- Server checks: `edges.has(edgeId)` for all edges - O(n)
- Server verifies: `edge[i].target === edge[i+1].source` - O(n)
- Ensures user → ... → resource forms valid chain
- Total: O(n) validation (still fast, no graph traversal)

### 4. Defense in Depth

```
┌─────────────────────────────────────────────────┐
│ Layer 1: Authentication                         │
│ - JWT/session tokens                            │
│ - Client signatures                             │
└─────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────┐
│ Layer 2: Edge ID Validation                     │
│ - Check all edge IDs exist                      │
│ - Check no edges are revoked                    │
└─────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────┐
│ Layer 3: Chain Connectivity Validation          │
│ - Verify first edge starts from user            │
│ - Verify edge[i].target = edge[i+1].source      │
│ - Verify last edge ends at resource             │
└─────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────┐
│ Layer 4: Audit Logging                          │
│ - Log exact edge IDs used                       │
│ - Track all permission checks                   │
│ - Record failed attempts + attack patterns      │
└─────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Edge-Based DO Storage (Week 1-2)

```typescript
// Store edges in Durable Object with multiple indexes
class PermissionGraphDO {
  private edges: Map<string, Edge> = new Map();
  private edgesBySource: Map<string, Set<string>> = new Map();
  private edgesByTarget: Map<string, Set<string>> = new Map();
  private edgesByType: Map<string, Set<string>> = new Map();

  async createEdge(edge: Omit<Edge, 'id' | 'createdAt'>): Promise<Edge> {
    const id = crypto.randomUUID();
    const newEdge = { ...edge, id, createdAt: Date.now() };
    this.edges.set(id, newEdge);
    this.indexEdge(newEdge);
    return newEdge;
  }

  async validatePermissionPath(
    edgeIds: string[],
    userId: string,
    resourceId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    // 1. Check all edges exist and are not revoked
    const edges = edgeIds.map(id => this.edges.get(id)).filter(Boolean);
    if (edges.length !== edgeIds.length) {
      return { valid: false, reason: 'One or more edges do not exist' };
    }
    if (edges.some(e => e.revokedAt)) {
      return { valid: false, reason: 'One or more edges have been revoked' };
    }
    
    // 2. Verify chain connectivity
    if (edges[0].sourceId !== userId) {
      return { valid: false, reason: 'Chain does not start with user' };
    }
    for (let i = 0; i < edges.length - 1; i++) {
      if (edges[i].targetId !== edges[i + 1].sourceId) {
        return { valid: false, reason: `Chain broken at index ${i}` };
      }
    }
    if (edges[edges.length - 1].targetId !== resourceId) {
      return { valid: false, reason: 'Chain does not end at resource' };
    }
    
    return { valid: true };
  }
}
```

### Phase 2: Client Query with Edge IDs (Week 2-3)

```typescript
// Client queries for shortest path with edge IDs
async function checkPermission(userId, resourceId, capability) {
  const result = await kuzuClient.query(`
    MATCH path = (u:User {id: $userId})-[*]->(r:Resource {id: $resourceId})
    WHERE ANY(rel IN relationships(path) WHERE rel.capability = $capability)
    WITH path, [rel in relationships(path) | id(rel)] as edgeIds
    ORDER BY length(path) ASC
    LIMIT 1
    RETURN edgeIds
  `);

  return result.rows[0]?.edgeIds || null;
}
```

### Phase 3: Server Validation with Chain Check (Week 3-4)

```typescript
// Validate edge IDs + chain connectivity on every mutation
app.post("/api/mutate", async (req) => {
  const { mutation, proof } = req.body;

  // Edge ID + chain connectivity validation
  const validation = await graphDO.validatePermissionPath(
    proof.edgeIds,
    req.user.id,
    mutation.resourceId
  );
  
  if (!validation.valid) {
    await logAuditEntry({
      result: 'DENIED',
      reason: validation.reason,
      invalidEdgeId: validation.invalidEdgeId
    });
    throw new UnauthorizedError("Permission denied");
  }

  await applyMutation(mutation);
});
```

### Phase 4: Audit & CSV Export (Week 4-5)

```typescript
// Export graph to CSV with stable edge IDs
interface EdgeCSV {
  id: string;
  type: string;
  source_id: string;
  target_id: string;
  properties_json: string;
  created_at: number;
  revoked_at: number | null;
}

// Client imports CSV and edge IDs match server
await kuzuClient.query(`
  LOAD FROM 'edges.csv' (id STRING, ...) 
  CREATE (source)-[e:${type} {id: id, ...}]->(target)
`);
```

### Audit Trail Architecture (Edge-Based)

```mermaid
graph TB
    subgraph "Audit Event Sources"
        PermCheck[Permission Checks<br/>with Edge IDs]
        Mutations[Edge Mutations<br/>Create/Revoke]
        Auth[Auth Events]
        Export[CSV Exports]
    end

    subgraph "Audit Pipeline"
        DO[Durable Object]
        Buffer[Event Buffer<br/>In-memory]
        Batch[Batch Writer<br/>Every 10s or 100 events]
    end

    subgraph "Storage & Retention"
        R2Hot[R2: Hot Storage<br/>Last 30 days]
        R2Warm[R2: Warm Storage<br/>31-90 days]
        R2Cold[R2: Cold Storage<br/>90+ days]
    end

    subgraph "Analysis & Compliance"
        Query[Query Interface<br/>Workers Analytics]
        Export2[Export Tool<br/>Compliance reports]
        Alert[Alert System<br/>Suspicious patterns]
    end

    PermCheck --> DO
    Mutations --> DO
    Auth --> DO
    Export --> DO

    DO --> Buffer
    Buffer --> Batch

    Batch --> R2Hot
    R2Hot -->|After 30d| R2Warm
    R2Warm -->|After 90d| R2Cold

    R2Hot --> Query
    Query --> Export2
    Query --> Alert

    style R2Hot fill:#FF6B6B
    style R2Warm fill:#FFD700
    style R2Cold fill:#90EE90
```

### Audit Event Schema (Edge-Based)

```typescript
interface AuditEvent {
  // Core identification
  eventId: string;              // UUID
  timestamp: number;            // Unix timestamp
  eventType: AuditEventType;    // PERMISSION_CHECK, EDGE_CREATED, etc.

  // User context
  userId: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;

  // Permission context (edge-based)
  action: string;               // READ, WRITE, DELETE, GRANT, REVOKE
  resourceType: string;         // Document, Project, User, etc.
  resourceId: string;
  capability: string;           // read, write, admin

  // Result with exact edge IDs
  result: 'ALLOWED' | 'DENIED' | 'ERROR';
  edgeIds?: string[];           // Exact edges that granted permission
  invalidEdgeId?: string;       // If denied, which edge was invalid

  // Performance
  latencyMs: number;
  checkType: 'DIRECT' | 'EDGE_VALIDATION' | 'CACHED';

  // Compliance
  complianceFlags: string[];    // ['GDPR', 'SOC2', 'HIPAA']
  retentionPolicy: string;      // '30d', '90d', '7y'
}

// Example audit entry
{
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  timestamp: 1735574400000,
  eventType: "PERMISSION_CHECK",
  userId: "user-123",
  sessionId: "sess-456",
  action: "WRITE",
  resourceId: "doc-789",
  capability: "write",
  result: "ALLOWED",
  edgeIds: ["e-abc", "e-def", "e-ghi"], // Exact permission path
  latencyMs: 5,
  checkType: "EDGE_VALIDATION",
  complianceFlags: ["GDPR", "SOC2"]
}
```

```mermaid
graph TB
    subgraph "Initial Page Load"
        Load1[1. HTML/JS/CSS<br/>from CDN]
        Load2[2. Authenticate<br/>JWT token]
        Load3[3. Get Commitment<br/>signed permissions]
        Load4[4. Fetch CSV<br/>from KV edge]
        Load5[5. Load Kuzu<br/>WASM + Graph]
        Load6[6. Build Map<br/>permission index]
        Load7[7. Connect WS<br/>real-time sync]
    end

    subgraph "Permission Check (Fast Path)"
        Fast1[User action<br/>read:doc123]
        Fast2[Check Map<br/>O_1 lookup]
        Fast3[✅ Allowed<br/>< 1ms]
    end

    subgraph "Permission Check (Transitive)"
        Trans1[User action<br/>admin:project]
        Trans2[Map miss]
        Trans3[Query Kuzu<br/>complex Cypher]
        Trans4[Found path<br/>via groups]
        Trans5[Cache in Map]
        Trans6[Generate proof]
        Trans7[Send to server]
        Trans8[Server validates]
        Trans9[✅ Allowed<br/>~50ms total]
    end

    subgraph "Mutation Flow"
        Mut1[User mutation<br/>grant permission]
        Mut2[Include proof]
        Mut3[Server validates]
        Mut4[Apply to DO graph]
        Mut5[Export CSV]
        Mut6[Store in KV]
        Mut7[Broadcast WS]
        Mut8[Clients sync]
        Mut9[Update maps]
        Mut10[✅ Complete<br/>~200ms total]
    end

    subgraph "Background Tasks"
        BG1[Hourly: Commitment refresh]
        BG2[Daily: R2 backup]
        BG3[Continuous: Audit logging]
        BG4[On-demand: CSV export]
    end

    Load1 --> Load2 --> Load3 --> Load4 --> Load5 --> Load6 --> Load7

    Fast1 --> Fast2 --> Fast3

    Trans1 --> Trans2 --> Trans3 --> Trans4 --> Trans5 --> Trans6
    Trans6 --> Trans7 --> Trans8 --> Trans9

    Mut1 --> Mut2 --> Mut3 --> Mut4 --> Mut5 --> Mut6
    Mut6 --> Mut7 --> Mut8 --> Mut9 --> Mut10

    style Load7 fill:#90EE90
    style Fast3 fill:#90EE90
    style Trans9 fill:#FFD700
    style Mut10 fill:#FFA500
```

## Decision Matrix: When to Use What

| Scenario                    | Use This                        | Why                    |
| --------------------------- | ------------------------------- | ---------------------- |
| **Direct permission check** | Client Map (O(1))               | <1ms, no network       |
| **Transitive permission**   | Client Kuzu → Server validation | Complex query + proof  |
| **Permission grant/revoke** | Server mutation → WS sync       | Authority + real-time  |
| **Initial graph load**      | KV → Client                     | Edge-cached, parallel  |
| **Graph update (small)**    | WebSocket delta                 | <100ms sync            |
| **Permission check (edge-based)** | Client query → Server edge validation | Exact edge IDs traced |
| **Graph update (small)** | WebSocket delta | Edge additions/revocations |
| **Graph update (large)**    | KV CSV re-fetch                 | Rare, full consistency |
| **Permission audit**        | R2 audit logs with edge IDs                   | Compliance retention   |
| **Disaster recovery**       | R2 backups                      | Point-in-time restore  |
| **Edge revocation**         | Server-side soft delete               | Audit trail preserved |

## Conclusion

**Client-side KuzuDB with edge-based server validation provides**:

- ✅ Full graph query power (complex transitive queries)
- ✅ **Simple validation** (O(1) edge ID lookups)
- ✅ **Smaller commitments** (no inheritance snapshot needed)
- ✅ Fast performance (Map-based fast path)
- ✅ **Precise audit trail** (exact edge IDs logged)
- ✅ Cloudflare Workers compatible (no server-side Kuzu needed)
- ✅ Real-time synchronization (WebSocket delta updates)
- ✅ Offline capability (IndexedDB cache)
- ✅ Scalable storage (KV + R2 tiered architecture)
- ✅ **Immutable history** (soft-deleted edges for compliance)

**Edge-based validation is superior because**:

1. **Simpler**: `edges.has(id)` vs complex path structure validation
2. **Faster**: O(n) edge lookups vs O(n²) path validation
3. **More secure**: Can't forge UUIDs, exact edges traced
4. **Better audit**: Exact permission path with edge IDs
5. **Smaller payload**: No inheritance snapshot in commitments
6. **Easier debugging**: Traceable edge IDs vs abstract paths

**This architecture turns a limitation into an advantage** by:

1. Leveraging client-side compute for complex queries
2. Maintaining server authority through edge ID validation
3. Optimizing with simple Map lookups
4. Providing precise audit trails with edge IDs
5. Enabling offline-first workflows
6. Distributing load globally via edge caching
7. Maintaining complete compliance with immutable edge history

### GDPR Compliance

```mermaid
flowchart TB
    Request([User GDPR Request])

    Request --> Type{Request Type}

    Type -->|Access| Access[Data Access Request]
    Type -->|Rectification| Rectify[Data Correction]
    Type -->|Erasure| Delete[Right to be Forgotten]
    Type -->|Portability| Export[Data Export]
    Type -->|Restrict| Restrict[Processing Restriction]

    Access --> QueryAudit[Query Audit Logs]
    QueryAudit --> QueryGraph[Query Permission Graph]
    QueryGraph --> GenerateReport[Generate Report]
    GenerateReport --> Deliver[Deliver to User]

    Rectify --> UpdateGraph[Update Graph Data]
    UpdateGraph --> LogChange[Log Correction]
    LogChange --> NotifyUser[Notify User]

    Delete --> Anonymize[Anonymize User Data]
    Anonymize --> RemovePerms[Remove Permissions]
    RemovePerms --> MarkDeleted[Mark as Deleted]
    MarkDeleted --> AuditDelete[Audit Deletion]

    Export --> CollectData[Collect All Data]
    CollectData --> FormatJSON[Format as JSON]
    FormatJSON --> EncryptExport[Encrypt Package]
    EncryptExport --> DeliverExport[Secure Delivery]

    Restrict --> MarkRestricted[Mark Account]
    MarkRestricted --> BlockProcessing[Block New Processing]
    BlockProcessing --> MaintainData[Maintain Existing Data]

    style Access fill:#87CEEB
    style Delete fill:#FF6B6B
    style Export fill:#90EE90
```

### SOC 2 Requirements

- Access controls validated cryptographically
- All changes audited and timestamped
- Monitoring and alerting in place
- Regular security reviews
- Incident response procedures

### 2. Merkle Tree Commitments

```typescript
// More efficient commitment updates
const merkleRoot = buildMerkleTree(permissionGraph);
const proof = getMerkleProof(merkleRoot, permissionPath);

// Server validates with O(log n) complexity
const isValid = verifyMerkleProof(merkleRoot, proof);
```

### 3. Threshold Cryptography

```typescript
// Distribute trust across multiple servers
const partialSigs = await Promise.all(
  servers.map((s) => s.partialSign(commitment))
);

const fullSignature = combinePartialSignatures(partialSigs);
```

## Performance Characteristics

| Operation                   | Latency  | Notes                         |
| --------------------------- | -------- | ----------------------------- |
| Direct permission check     | <1ms     | Map lookup                    |
| Transitive permission check | <10ms    | Cached inheritance validation |
| Client graph query          | 10-100ms | Full Cypher power             |
| Commitment generation       | 50-200ms | Once per login/change         |
| Mutation validation         | 5-20ms   | Includes audit logging        |

## Compliance & Audit

### Audit Trail

- All permission checks logged with full context
- Permission paths recorded for compliance
- Failed attempts tracked for security

### GDPR Compliance

- Users can export their permission history
- Permission grants/revokes are transparent
- Data retention policies enforced

### SOC 2 Requirements

- Access controls validated cryptographically
- All changes audited and timestamped
- Monitoring and alerting in place

## Conclusion

**Client-side KuzuDB with cryptographic server validation provides**:

- ✅ Full graph query power (complex transitive queries)
- ✅ Strong security guarantees (cryptographic commitments)
- ✅ Fast performance (Map-based fast path)
- ✅ Complete audit trail (all checks logged)
- ✅ Cloudflare Workers compatible (no server-side Kuzu needed)

**This architecture turns a limitation into an advantage** by:

1. Leveraging client-side compute for complex queries
2. Maintaining server authority through cryptographic proofs
3. Optimizing common cases with cached snapshots
4. Providing defense-in-depth security layers
