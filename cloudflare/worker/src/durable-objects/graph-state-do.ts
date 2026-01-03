import { DurableObject } from "cloudflare:workers";
import { Edge, CreateEdgeInput, ValidationResult } from "../types/edge";
import { randomUUID } from "crypto";

/**
 * Graph State Durable Object
 * Stores permission edges in-memory with O(1) lookups
 */
export class GraphStateDO extends DurableObject {
  private edges: Map<string, Edge>;
  private edgesBySource: Map<string, Set<string>>;
  private edgesByTarget: Map<string, Set<string>>;
  private edgesByType: Map<string, Set<string>>;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.edges = new Map();
    this.edgesBySource = new Map();
    this.edgesByTarget = new Map();
    this.edgesByType = new Map();
  }

  /**
   * Create a new edge with server-generated UUID
   */
  async createEdge(input: CreateEdgeInput): Promise<Edge> {
    const edge: Edge = {
      id: randomUUID(),
      type: input.type,
      sourceId: input.sourceId,
      targetId: input.targetId,
      properties: input.properties || {},
      createdAt: Date.now(),
    };

    // Store edge
    this.edges.set(edge.id, edge);

    // Update indexes
    this._addToIndex(this.edgesBySource, edge.sourceId, edge.id);
    this._addToIndex(this.edgesByTarget, edge.targetId, edge.id);
    this._addToIndex(this.edgesByType, edge.type, edge.id);

    return edge;
  }

  /**
   * Revoke an edge (soft delete for audit trail)
   */
  async revokeEdge(edgeId: string): Promise<void> {
    const edge = this.edges.get(edgeId);
    if (!edge) {
      throw new Error(`Edge ${edgeId} does not exist`);
    }

    edge.revokedAt = Date.now();
    this.edges.set(edgeId, edge);
  }

  /**
   * Check if edge exists and is not revoked
   */
  async edgeExists(edgeId: string): Promise<boolean> {
    const edge = this.edges.get(edgeId);
    return edge !== undefined && edge.revokedAt === undefined;
  }

  /**
   * Get edge by ID (includes revoked edges)
   */
  async getEdge(edgeId: string): Promise<Edge | undefined> {
    return this.edges.get(edgeId);
  }

  /**
   * Validate permission path with chain connectivity
   */
  async validatePermissionPath(
    edgeIds: string[],
    userId: string,
    resourceId: string
  ): Promise<ValidationResult> {
    // 1. Check all edges exist
    const edges: Edge[] = [];
    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      if (!edge) {
        return {
          valid: false,
          reason: `Edge ${edgeId} does not exist`,
          invalidEdgeId: edgeId,
        };
      }
      edges.push(edge);
    }

    // 2. Check no edges are revoked
    for (const edge of edges) {
      if (edge.revokedAt !== undefined) {
        return {
          valid: false,
          reason: `Edge ${edge.id} has been revoked`,
          invalidEdgeId: edge.id,
        };
      }
    }

    // 3. Verify chain starts with user
    if (edges[0].sourceId !== userId) {
      return {
        valid: false,
        reason: "Permission chain does not start with user",
      };
    }

    // 4. Verify chain connectivity
    for (let i = 0; i < edges.length - 1; i++) {
      if (edges[i].targetId !== edges[i + 1].sourceId) {
        return {
          valid: false,
          reason: `Broken chain between edge ${i} and ${i + 1}`,
          brokenChainAt: i,
        };
      }
    }

    // 5. Verify chain ends at resource
    if (edges[edges.length - 1].targetId !== resourceId) {
      return {
        valid: false,
        reason: "Permission chain does not end at resource",
      };
    }

    return { valid: true };
  }

  /**
   * Apply mutation after validating proof
   */
  async applyMutation(
    mutation: any,
    proof: { userId?: string; edgeIds?: string[] } | null
  ): Promise<{ success: boolean }> {
    if (!proof || !proof.edgeIds) {
      throw new Error("Proof required");
    }

    const validation = await this.validatePermissionPath(
      proof.edgeIds,
      proof.userId!,
      mutation.resourceId
    );

    if (!validation.valid) {
      throw new Error("Invalid permission proof");
    }

    // Apply mutation (implementation depends on mutation type)
    // For now, just validate the proof
    return { success: true };
  }

  /**
   * Helper: Create a chain of edges for testing
   */
  async createPermissionChain(params: {
    userId: string;
    groups: string[];
    resourceId: string;
    capability: string;
  }): Promise<Edge[]> {
    const edges: Edge[] = [];
    let currentSource = params.userId;

    // Create MEMBER_OF and INHERITS_FROM edges
    for (const group of params.groups) {
      const edge = await this.createEdge({
        type:
          params.groups.indexOf(group) === 0 ? "MEMBER_OF" : "INHERITS_FROM",
        sourceId: currentSource,
        targetId: group,
        properties: {},
      });
      edges.push(edge);
      currentSource = group;
    }

    // Create final HAS_PERMISSION edge
    const permEdge = await this.createEdge({
      type: "HAS_PERMISSION",
      sourceId: currentSource,
      targetId: params.resourceId,
      properties: { capability: params.capability },
    });
    edges.push(permEdge);

    return edges;
  }

  /**
   * Helper method to add to index
   */
  private _addToIndex(
    index: Map<string, Set<string>>,
    key: string,
    value: string
  ): void {
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    index.get(key)!.add(value);
  }
}
