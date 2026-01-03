/**
 * Core Edge types for permission graph
 */

export interface Edge {
  /** Server-generated UUID v4 */
  id: string;

  /** Edge type: MEMBER_OF, INHERITS_FROM, HAS_PERMISSION */
  type: EdgeType;

  /** Source node ID (user, group, or organization) */
  sourceId: string;

  /** Target node ID (group, organization, or resource) */
  targetId: string;

  /** Optional edge properties (e.g., capability for HAS_PERMISSION edges) */
  properties: Record<string, any>;

  /** Creation timestamp (Unix ms) */
  createdAt: number;

  /** Revocation timestamp (Unix ms) - undefined if not revoked */
  revokedAt?: number;
}

export type EdgeType = "MEMBER_OF" | "INHERITS_FROM" | "HAS_PERMISSION";

export interface CreateEdgeInput {
  type: EdgeType;
  sourceId: string;
  targetId: string;
  properties?: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  brokenChainAt?: number;
  invalidEdgeId?: string;
}

export interface PermissionProof {
  userId: string;
  edgeIds: string[];
}

export interface AuditEvent {
  eventType: "PERMISSION_CHECK" | "ATTACK_DETECTED" | "MUTATION_APPLIED";
  timestamp: number;
  userId: string;
  resourceId?: string;
  edgeIds?: string[];
  result?: "ALLOWED" | "DENIED";
  reason?: string;
  attackType?: string;
  brokenChainAt?: number;
  invalidEdgeId?: string;
  checkType?: string;
  mutation?: any;
}
