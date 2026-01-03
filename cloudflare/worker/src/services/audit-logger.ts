import { AuditEvent } from "../types/edge";

/**
 * Audit Logger for tracking all permission checks and mutations
 */
export class AuditLogger {
  private events: AuditEvent[] = [];

  log(event: Omit<AuditEvent, "timestamp">): void {
    this.events.push({
      ...event,
      timestamp: Date.now(),
    });
  }

  hasEvent(eventType: AuditEvent["eventType"]): boolean {
    return this.events.some((e) => e.eventType === eventType);
  }

  getLastEvent(): AuditEvent | undefined {
    return this.events[this.events.length - 1];
  }

  getAllEvents(): AuditEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }

  /**
   * Log permission check result
   */
  logPermissionCheck(params: {
    userId: string;
    resourceId: string;
    edgeIds: string[];
    result: "ALLOWED" | "DENIED";
    reason?: string;
    invalidEdgeId?: string;
  }): void {
    this.log({
      eventType: "PERMISSION_CHECK",
      checkType: "EDGE_VALIDATION",
      ...params,
    });
  }

  /**
   * Log detected attack attempt
   */
  logAttack(params: {
    userId: string;
    resourceId: string;
    edgeIds: string[];
    attackType: string;
    brokenChainAt?: number;
  }): void {
    this.log({
      eventType: "ATTACK_DETECTED",
      result: "DENIED",
      ...params,
    });
  }

  /**
   * Log successful mutation
   */
  logMutation(params: {
    userId: string;
    resourceId?: string;
    edgeIds: string[];
    mutation: any;
  }): void {
    this.log({
      eventType: "MUTATION_APPLIED",
      result: "ALLOWED",
      ...params,
    });
  }
}
