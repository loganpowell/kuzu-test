import { ValidationResult } from "../types/edge";
import { GraphStateDO } from "../durable-objects/graph-state-do";
import { AuditLogger } from "./audit-logger";

/**
 * Validate permission path with edge-based approach
 */
export async function validatePermissionPath(params: {
  edgeIds: string[];
  userId: string;
  resourceId: string;
  graphDO: GraphStateDO;
  auditLogger: AuditLogger;
}): Promise<ValidationResult> {
  const { edgeIds, userId, resourceId, graphDO, auditLogger } = params;

  // Validate with DO
  const result = await graphDO.validatePermissionPath(
    edgeIds,
    userId,
    resourceId
  );

  // Log the check
  if (result.valid) {
    auditLogger.logPermissionCheck({
      userId,
      resourceId,
      edgeIds,
      result: "ALLOWED",
    });
  } else {
    // Determine if this is an attack
    if (result.brokenChainAt !== undefined) {
      auditLogger.logAttack({
        userId,
        resourceId,
        edgeIds,
        attackType: "DISCONNECTED_EDGE_CHAIN",
        brokenChainAt: result.brokenChainAt,
      });
    } else {
      auditLogger.logPermissionCheck({
        userId,
        resourceId,
        edgeIds,
        result: "DENIED",
        reason: result.reason,
        invalidEdgeId: result.invalidEdgeId,
      });
    }
  }

  return result;
}
