/**
 * Standalone Document Management System Example
 *
 * This demonstrates the full authorization flow without requiring
 * the Cloudflare Workers runtime.
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// MOCK GRAPH STATE (Replaces GraphStateDO for standalone example)
// ============================================================================

interface Edge {
  id: string;
  source: string;
  target: string;
  edgeType: "MEMBER_OF" | "INHERITS" | "CAN_READ" | "CAN_WRITE";
  metadata?: Record<string, unknown>;
  isRevoked: boolean;
  createdAt: number;
  updatedAt: number;
}

class MockGraphState {
  private edges: Map<string, Edge> = new Map();

  addEdge(edge: Omit<Edge, "id" | "createdAt" | "updatedAt">): string {
    const id = `edge-${crypto.randomUUID()}`;
    const now = Date.now();
    this.edges.set(id, {
      id,
      ...edge,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  getEdge(id: string): Edge | undefined {
    return this.edges.get(id);
  }

  revokeEdge(id: string): void {
    const edge = this.edges.get(id);
    if (edge) {
      edge.isRevoked = true;
      edge.updatedAt = Date.now();
    }
  }
}

// ============================================================================
// AUDIT LOGGER
// ============================================================================

interface AuditEvent {
  timestamp: number;
  eventType: string;
  userId: string;
  resourceId: string;
  capability: string;
  edgeIds: string[];
  result: "ALLOWED" | "DENIED";
  reason?: string;
  metadata?: Record<string, unknown>;
}

class AuditLogger {
  private events: AuditEvent[] = [];

  logPermissionCheck(event: Omit<AuditEvent, "timestamp">): void {
    this.events.push({ timestamp: Date.now(), ...event });
  }

  getEvents(): AuditEvent[] {
    return this.events;
  }

  getEventsByUser(userId: string): AuditEvent[] {
    return this.events.filter((e) => e.userId === userId);
  }
}

// ============================================================================
// SERVER-SIDE VALIDATION
// ============================================================================

interface ValidationResult {
  valid: boolean;
  reason?: string;
  edgeChain?: Edge[];
}

async function validatePermissionPath(params: {
  edgeIds: string[];
  userId: string;
  resourceId: string;
  graphState: MockGraphState;
  auditLogger: AuditLogger;
}): Promise<ValidationResult> {
  const { edgeIds, userId, resourceId, graphState, auditLogger } = params;

  // 1. Fetch all edges (O(n) lookups, each O(1))
  const edges: Edge[] = [];
  for (const edgeId of edgeIds) {
    const edge = graphState.getEdge(edgeId);
    if (!edge) {
      auditLogger.logPermissionCheck({
        eventType: "PERMISSION_CHECK",
        userId,
        resourceId,
        capability: "unknown",
        edgeIds,
        result: "DENIED",
        reason: `Edge not found: ${edgeId}`,
      });
      return { valid: false, reason: `Edge not found: ${edgeId}` };
    }
    if (edge.isRevoked) {
      auditLogger.logPermissionCheck({
        eventType: "PERMISSION_CHECK",
        userId,
        resourceId,
        capability: "unknown",
        edgeIds,
        result: "DENIED",
        reason: `Edge revoked: ${edgeId}`,
      });
      return { valid: false, reason: `Edge revoked: ${edgeId}` };
    }
    edges.push(edge);
  }

  // 2. Validate chain connectivity (O(n) traversal)
  if (edges[0].source !== userId) {
    auditLogger.logPermissionCheck({
      eventType: "ATTACK_DETECTED",
      userId,
      resourceId,
      capability: "unknown",
      edgeIds,
      result: "DENIED",
      reason: "First edge does not start from user",
      metadata: { attackType: "IMPERSONATION" },
    });
    return { valid: false, reason: "First edge does not start from user" };
  }

  for (let i = 0; i < edges.length - 1; i++) {
    if (edges[i].target !== edges[i + 1].source) {
      auditLogger.logPermissionCheck({
        eventType: "ATTACK_DETECTED",
        userId,
        resourceId,
        capability: "unknown",
        edgeIds,
        result: "DENIED",
        reason: `Broken chain between edge ${i} and ${i + 1}`,
        metadata: { attackType: "DISCONNECTED_EDGE_CHAIN" },
      });
      return {
        valid: false,
        reason: `Broken chain between edge ${i} and ${i + 1}`,
      };
    }
  }

  const lastEdge = edges[edges.length - 1];
  if (lastEdge.target !== resourceId) {
    auditLogger.logPermissionCheck({
      eventType: "ATTACK_DETECTED",
      userId,
      resourceId,
      capability: "unknown",
      edgeIds,
      result: "DENIED",
      reason: "Last edge does not target the requested resource",
      metadata: { attackType: "WRONG_RESOURCE" },
    });
    return {
      valid: false,
      reason: "Last edge does not target the requested resource",
    };
  }

  // 3. Success
  auditLogger.logPermissionCheck({
    eventType: "PERMISSION_CHECK",
    userId,
    resourceId,
    capability: lastEdge.edgeType,
    edgeIds,
    result: "ALLOWED",
  });
  return { valid: true, edgeChain: edges };
}

// ============================================================================
// CLIENT-SIDE (Simulates Kuzu WASM)
// ============================================================================

class ClientAuthorizationService {
  private graphData: Map<string, string[]> = new Map();

  addPermissionPath(
    userId: string,
    resourceId: string,
    capability: string,
    edgeIds: string[]
  ): void {
    this.graphData.set(`${userId}:${resourceId}:${capability}`, edgeIds);
  }

  async findPermissionPath(
    userId: string,
    resourceId: string,
    capability: string
  ): Promise<string[] | null> {
    const key = `${userId}:${resourceId}:${capability}`;
    return this.graphData.get(key) || null;
  }
}

// ============================================================================
// FULL CLIENT-SERVER FLOW
// ============================================================================

async function clientRequestPermission(params: {
  userId: string;
  resourceId: string;
  capability: string;
  clientService: ClientAuthorizationService;
}): Promise<{ edgeIds: string[] | null }> {
  const { userId, resourceId, capability, clientService } = params;

  console.log(
    `[CLIENT] Checking permission for ${userId} to ${capability} ${resourceId}`
  );

  // Simulate: const result = await kuzu.query(`MATCH path = (u:User {id: $userId})-[*]->(r:Resource {id: $resourceId}) ...`)
  const edgeIds = await clientService.findPermissionPath(
    userId,
    resourceId,
    capability
  );

  if (edgeIds) {
    console.log(
      `[CLIENT] Found permission path with ${
        edgeIds.length
      } edges: ${edgeIds.join(", ")}`
    );
  } else {
    console.log(`[CLIENT] No permission path found`);
  }

  return { edgeIds };
}

async function serverValidatePermission(params: {
  userId: string;
  resourceId: string;
  edgeIds: string[];
  graphState: MockGraphState;
  auditLogger: AuditLogger;
}): Promise<{ allowed: boolean; reason?: string }> {
  console.log(`[SERVER] Validating permission proof from ${params.userId}`);

  const result = await validatePermissionPath(params);

  if (result.valid) {
    console.log(`[SERVER] ✓ Permission GRANTED for ${params.userId}`);
  } else {
    console.log(`[SERVER] ✗ Permission DENIED: ${result.reason}`);
  }

  return { allowed: result.valid, reason: result.reason };
}

// ============================================================================
// EXAMPLE SCENARIO
// ============================================================================

export async function runDocumentSystemExample(): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("DOCUMENT MANAGEMENT SYSTEM - Authorization Example");
  console.log("=".repeat(80) + "\n");

  const graphState = new MockGraphState();
  const auditLogger = new AuditLogger();
  const clientService = new ClientAuthorizationService();

  // ========================================
  // SETUP: Create organization structure
  // ========================================

  console.log("📋 Setting up organization structure...\n");

  // Users
  const alice = "user:alice"; // CTO
  const bob = "user:bob"; // Senior Engineer
  const charlie = "user:charlie"; // Junior Engineer
  const diana = "user:diana"; // Intern

  // Groups
  const engineeringLeadership = "group:engineering-leadership";
  const engineeringTeam = "group:engineering-team";
  const interns = "group:interns";

  // Resources
  const techDocs = "resource:tech-docs";
  const teamDocs = "resource:team-docs";
  const projectAlpha = "resource:project-alpha";

  // Create edges
  const edge1 = graphState.addEdge({
    source: alice,
    target: engineeringLeadership,
    edgeType: "MEMBER_OF",
    isRevoked: false,
  });
  const edge2 = graphState.addEdge({
    source: engineeringLeadership,
    target: techDocs,
    edgeType: "CAN_WRITE",
    isRevoked: false,
  });

  const edge3 = graphState.addEdge({
    source: bob,
    target: engineeringTeam,
    edgeType: "MEMBER_OF",
    isRevoked: false,
  });
  const edge4 = graphState.addEdge({
    source: engineeringTeam,
    target: teamDocs,
    edgeType: "CAN_WRITE",
    isRevoked: false,
  });

  const edge5 = graphState.addEdge({
    source: charlie,
    target: engineeringTeam,
    edgeType: "MEMBER_OF",
    isRevoked: false,
  });
  const edge6 = graphState.addEdge({
    source: engineeringTeam,
    target: teamDocs,
    edgeType: "CAN_READ",
    isRevoked: false,
  });

  const edge7 = graphState.addEdge({
    source: diana,
    target: interns,
    edgeType: "MEMBER_OF",
    isRevoked: false,
  });
  const edge8 = graphState.addEdge({
    source: interns,
    target: projectAlpha,
    edgeType: "CAN_READ",
    isRevoked: false,
  });

  // Add permission paths to client service
  clientService.addPermissionPath(alice, techDocs, "write", [edge1, edge2]);
  clientService.addPermissionPath(bob, teamDocs, "write", [edge3, edge4]);
  clientService.addPermissionPath(charlie, teamDocs, "read", [edge5, edge6]);
  clientService.addPermissionPath(diana, projectAlpha, "read", [edge7, edge8]);

  console.log("✓ Organization structure created\n");

  // ========================================
  // TEST CASE 1: CTO Edits Tech Documentation
  // ========================================

  console.log("📝 Test Case 1: CTO Edits Tech Documentation");
  console.log("-".repeat(80));

  const request1 = await clientRequestPermission({
    userId: alice,
    resourceId: techDocs,
    capability: "write",
    clientService,
  });

  if (request1.edgeIds) {
    const response1 = await serverValidatePermission({
      userId: alice,
      resourceId: techDocs,
      edgeIds: request1.edgeIds,
      graphState,
      auditLogger,
    });

    console.log(`\n🎉 Result: ${response1.allowed ? "ALLOWED" : "DENIED"}`);
    if (response1.allowed) {
      console.log(`   Alice can edit tech-docs as CTO\n`);
    }
  }

  // ========================================
  // TEST CASE 2: Senior Engineer Edits Team Docs
  // ========================================

  console.log("📝 Test Case 2: Senior Engineer Edits Team Docs");
  console.log("-".repeat(80));

  const request2 = await clientRequestPermission({
    userId: bob,
    resourceId: teamDocs,
    capability: "write",
    clientService,
  });

  if (request2.edgeIds) {
    const response2 = await serverValidatePermission({
      userId: bob,
      resourceId: teamDocs,
      edgeIds: request2.edgeIds,
      graphState,
      auditLogger,
    });

    console.log(`\n🎉 Result: ${response2.allowed ? "ALLOWED" : "DENIED"}`);
    if (response2.allowed) {
      console.log(`   Bob can edit team-docs as senior engineer\n`);
    }
  }

  // ========================================
  // TEST CASE 3: Junior Engineer Tries to Edit (Should fail - read-only)
  // ========================================

  console.log("📝 Test Case 3: Junior Engineer Tries to Edit");
  console.log("-".repeat(80));

  const request3 = await clientRequestPermission({
    userId: charlie,
    resourceId: teamDocs,
    capability: "write",
    clientService,
  });

  if (!request3.edgeIds) {
    console.log(`\n🚫 Result: DENIED`);
    console.log(`   Charlie only has read access to team-docs\n`);
  }

  // ========================================
  // TEST CASE 4: Intern Accesses Project
  // ========================================

  console.log("📝 Test Case 4: Intern Accesses Project");
  console.log("-".repeat(80));

  const request4 = await clientRequestPermission({
    userId: diana,
    resourceId: projectAlpha,
    capability: "read",
    clientService,
  });

  if (request4.edgeIds) {
    const response4 = await serverValidatePermission({
      userId: diana,
      resourceId: projectAlpha,
      edgeIds: request4.edgeIds,
      graphState,
      auditLogger,
    });

    console.log(`\n🎉 Result: ${response4.allowed ? "ALLOWED" : "DENIED"}`);
    if (response4.allowed) {
      console.log(`   Diana can read project-alpha as intern\n`);
    }
  }

  // ========================================
  // TEST CASE 5: Revoke Intern Access (Internship ends)
  // ========================================

  console.log("📝 Test Case 5: Revoke Intern Access (Internship ends)");
  console.log("-".repeat(80));

  console.log(`[ADMIN] Revoking Diana's group membership...`);
  graphState.revokeEdge(edge7);

  const request5 = await clientRequestPermission({
    userId: diana,
    resourceId: projectAlpha,
    capability: "read",
    clientService,
  });

  if (request5.edgeIds) {
    const response5 = await serverValidatePermission({
      userId: diana,
      resourceId: projectAlpha,
      edgeIds: request5.edgeIds,
      graphState,
      auditLogger,
    });

    console.log(`\n🚫 Result: ${response5.allowed ? "ALLOWED" : "DENIED"}`);
    if (!response5.allowed) {
      console.log(`   Reason: ${response5.reason}`);
      console.log(`   Diana's access revoked after internship ended\n`);
    }
  }

  // ========================================
  // TEST CASE 6: Attack Prevention - Privilege Escalation
  // ========================================

  console.log("📝 Test Case 6: Attack Prevention - Privilege Escalation");
  console.log("-".repeat(80));

  // Charlie tries to use disconnected edges to access tech-docs
  console.log(
    `[ATTACKER] Charlie attempts to use disconnected edges to access tech-docs`
  );

  const response6 = await serverValidatePermission({
    userId: charlie,
    resourceId: techDocs,
    edgeIds: [edge5, edge2], // edge5 (charlie → team), edge2 (leadership → tech-docs) - NOT CONNECTED!
    graphState,
    auditLogger,
  });

  console.log(`\n🛡️  Result: ${response6.allowed ? "ALLOWED" : "DENIED"}`);
  if (!response6.allowed) {
    console.log(`   Reason: ${response6.reason}`);
    console.log(`   Attack detected and blocked!\n`);
  }

  // ========================================
  // AUDIT TRAIL REPORT
  // ========================================

  console.log("=".repeat(80));
  console.log("AUDIT TRAIL REPORT");
  console.log("=".repeat(80) + "\n");

  const events = auditLogger.getEvents();
  console.log(`Total Events: ${events.length}\n`);

  events.forEach((event, i) => {
    console.log(`Event ${i + 1}:`);
    console.log(`  Type: ${event.eventType}`);
    console.log(`  User: ${event.userId}`);
    console.log(`  Resource: ${event.resourceId}`);
    console.log(`  Result: ${event.result}`);
    if (event.reason) {
      console.log(`  Reason: ${event.reason}`);
    }
    if (event.metadata?.attackType) {
      console.log(`  ⚠️  Attack Type: ${event.metadata.attackType}`);
    }
    console.log();
  });

  console.log("=".repeat(80));
  console.log("EXAMPLE COMPLETE");
  console.log("=".repeat(80) + "\n");
}

// ============================================================================
// RUN EXAMPLE
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runDocumentSystemExample().catch(console.error);
}
