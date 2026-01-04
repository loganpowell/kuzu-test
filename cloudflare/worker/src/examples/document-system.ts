/**
 * Full Stack Example: Document Management System
 *
 * This demonstrates a complete client-server authorization flow:
 * 1. Client-side: User requests access to a document
 * 2. Client-side: KuzuDB WASM queries local graph for permission path
 * 3. Client-side: Extracts edge IDs from query result
 * 4. Server-side: Validates edge IDs exist and form connected chain
 * 5. Server-side: Returns authorized response or denial
 */

import { GraphStateDO } from "../durable-objects/graph-state-do";
import { validatePermissionPath } from "../services/permission-validator";
import { AuditLogger } from "../services/audit-logger";

// ============================================================================
// CLIENT-SIDE CODE (Browser/Worker with Kuzu WASM)
// ============================================================================

interface ClientPermissionRequest {
  userId: string;
  resourceId: string;
  capability: "read" | "write" | "delete";
}

interface ClientPermissionResponse {
  allowed: boolean;
  edgeIds: string[];
  reason?: string;
}

/**
 * CLIENT: Query local Kuzu graph for permission path
 * In a real application, this would use actual Kuzu WASM
 */
class ClientAuthorizationService {
  private graphData: Map<string, any> = new Map();

  /**
   * Simulate Kuzu WASM query for shortest permission path
   * In reality, this would be:
   *
   * const result = await kuzuConnection.query(`
   *   MATCH path = (u:User {id: $userId})-[*]->(r:Resource {id: $resourceId})
   *   WHERE ANY(rel IN relationships(path) WHERE rel.capability = $capability)
   *   WITH path, [rel IN relationships(path) | id(rel)] as edgeIds
   *   ORDER BY length(path) ASC
   *   LIMIT 1
   *   RETURN edgeIds
   * `);
   */
  async findPermissionPath(
    userId: string,
    resourceId: string,
    capability: string
  ): Promise<string[] | null> {
    // In real app, Kuzu WASM would execute graph traversal
    // For this example, we'll simulate with stored edge IDs
    const key = `${userId}:${resourceId}:${capability}`;
    return this.graphData.get(key) || null;
  }

  /**
   * Register a known path (simulates Kuzu graph data)
   */
  registerPath(
    userId: string,
    resourceId: string,
    capability: string,
    edgeIds: string[]
  ) {
    const key = `${userId}:${resourceId}:${capability}`;
    this.graphData.set(key, edgeIds);
  }
}

/**
 * CLIENT: Request permission check with automatic graph query
 */
async function clientRequestPermission(
  request: ClientPermissionRequest,
  clientService: ClientAuthorizationService
): Promise<ClientPermissionResponse> {
  console.log(
    `[CLIENT] Checking permission for ${request.userId} to ${request.capability} ${request.resourceId}`
  );

  // Step 1: Query local Kuzu graph
  const edgeIds = await clientService.findPermissionPath(
    request.userId,
    request.resourceId,
    request.capability
  );

  if (!edgeIds) {
    console.log("[CLIENT] No permission path found in local graph");
    return {
      allowed: false,
      edgeIds: [],
      reason: "No permission path found",
    };
  }

  console.log(
    `[CLIENT] Found permission path with ${edgeIds.length} edges:`,
    edgeIds
  );

  return {
    allowed: true,
    edgeIds,
  };
}

// ============================================================================
// SERVER-SIDE CODE (Cloudflare Worker + Durable Object)
// ============================================================================

interface ServerValidationRequest {
  userId: string;
  resourceId: string;
  edgeIds: string[];
}

interface ServerValidationResponse {
  allowed: boolean;
  reason?: string;
  timestamp: number;
}

/**
 * SERVER: Validate permission proof from client
 */
async function serverValidatePermission(
  request: ServerValidationRequest,
  graphDO: GraphStateDO,
  auditLogger: AuditLogger
): Promise<ServerValidationResponse> {
  console.log(`[SERVER] Validating permission proof from ${request.userId}`);
  console.log(`[SERVER] Edge IDs to validate:`, request.edgeIds);

  // Validate edge-based proof with chain connectivity
  const result = await validatePermissionPath({
    edgeIds: request.edgeIds,
    userId: request.userId,
    resourceId: request.resourceId,
    graphDO,
    auditLogger,
  });

  if (result.valid) {
    console.log(`[SERVER] ✓ Permission GRANTED for ${request.userId}`);
  } else {
    console.log(`[SERVER] ✗ Permission DENIED: ${result.reason}`);
  }

  return {
    allowed: result.valid,
    reason: result.reason,
    timestamp: Date.now(),
  };
}

// ============================================================================
// FULL STACK EXAMPLE APPLICATION
// ============================================================================

/**
 * Example: Document Management System
 *
 * Scenario: Engineering team collaborates on technical documents
 * - Alice (CTO) can access all engineering docs
 * - Bob (Senior Engineer) can edit team docs
 * - Charlie (Junior Engineer) can read team docs
 * - Diana (Intern) has temporary access to specific project
 */
export async function runDocumentSystemExample() {
  console.log("=".repeat(80));
  console.log("DOCUMENT MANAGEMENT SYSTEM - Authorization Example");
  console.log("=".repeat(80));
  console.log("");

  // Setup
  const mockState = {} as any;
  const mockEnv = {} as any;
  const graphDO = new GraphStateDO(mockState, mockEnv);
  const auditLogger = new AuditLogger();
  const clientService = new ClientAuthorizationService();

  // Build organizational structure
  console.log("📋 Setting up organization structure...\n");

  // Alice (CTO) -> Engineering Leadership -> Tech Docs
  const aliceEdges = [
    await graphDO.createEdge({
      type: "MEMBER_OF",
      sourceId: "user:alice",
      targetId: "group:eng-leadership",
      properties: { role: "cto" },
    }),
    await graphDO.createEdge({
      type: "HAS_PERMISSION",
      sourceId: "group:eng-leadership",
      targetId: "resource:tech-docs",
      properties: { capability: "write" },
    }),
  ];
  clientService.registerPath(
    "user:alice",
    "resource:tech-docs",
    "write",
    aliceEdges.map((e) => e.id)
  );

  // Bob (Senior Engineer) -> Engineering Team -> Team Docs
  const bobEdges = [
    await graphDO.createEdge({
      type: "MEMBER_OF",
      sourceId: "user:bob",
      targetId: "group:eng-team",
      properties: { role: "senior-engineer" },
    }),
    await graphDO.createEdge({
      type: "HAS_PERMISSION",
      sourceId: "group:eng-team",
      targetId: "resource:team-docs",
      properties: { capability: "write" },
    }),
  ];
  clientService.registerPath(
    "user:bob",
    "resource:team-docs",
    "write",
    bobEdges.map((e) => e.id)
  );

  // Charlie (Junior Engineer) -> Engineering Team -> Team Docs (read only)
  const charlieEdges = [
    await graphDO.createEdge({
      type: "MEMBER_OF",
      sourceId: "user:charlie",
      targetId: "group:eng-team",
      properties: { role: "junior-engineer" },
    }),
    await graphDO.createEdge({
      type: "HAS_PERMISSION",
      sourceId: "group:eng-team",
      targetId: "resource:team-docs",
      properties: { capability: "read" },
    }),
  ];
  clientService.registerPath(
    "user:charlie",
    "resource:team-docs",
    "read",
    charlieEdges.map((e) => e.id)
  );

  // Diana (Intern) -> Intern Team -> Project Alpha (temporary)
  const dianaEdges = [
    await graphDO.createEdge({
      type: "MEMBER_OF",
      sourceId: "user:diana",
      targetId: "group:interns",
      properties: { role: "intern", temporary: true },
    }),
    await graphDO.createEdge({
      type: "HAS_PERMISSION",
      sourceId: "group:interns",
      targetId: "resource:project-alpha",
      properties: { capability: "read" },
    }),
  ];
  clientService.registerPath(
    "user:diana",
    "resource:project-alpha",
    "read",
    dianaEdges.map((e) => e.id)
  );

  console.log("✓ Organization structure created\n");
  console.log("");

  // ========================================================================
  // TEST CASE 1: Alice (CTO) edits technical documentation
  // ========================================================================
  console.log("📝 Test Case 1: CTO Edits Tech Documentation");
  console.log("-".repeat(80));

  const clientReq1 = await clientRequestPermission(
    {
      userId: "user:alice",
      resourceId: "resource:tech-docs",
      capability: "write",
    },
    clientService
  );

  if (clientReq1.allowed) {
    const serverResp1 = await serverValidatePermission(
      {
        userId: "user:alice",
        resourceId: "resource:tech-docs",
        edgeIds: clientReq1.edgeIds,
      },
      graphDO,
      auditLogger
    );

    console.log(`\n🎉 Result: ${serverResp1.allowed ? "ALLOWED" : "DENIED"}`);
    console.log(`   Alice can edit tech-docs as CTO\n`);
  }

  // ========================================================================
  // TEST CASE 2: Bob (Senior Engineer) edits team docs
  // ========================================================================
  console.log("📝 Test Case 2: Senior Engineer Edits Team Docs");
  console.log("-".repeat(80));

  const clientReq2 = await clientRequestPermission(
    {
      userId: "user:bob",
      resourceId: "resource:team-docs",
      capability: "write",
    },
    clientService
  );

  if (clientReq2.allowed) {
    const serverResp2 = await serverValidatePermission(
      {
        userId: "user:bob",
        resourceId: "resource:team-docs",
        edgeIds: clientReq2.edgeIds,
      },
      graphDO,
      auditLogger
    );

    console.log(`\n🎉 Result: ${serverResp2.allowed ? "ALLOWED" : "DENIED"}`);
    console.log(`   Bob can edit team-docs as senior engineer\n`);
  }

  // ========================================================================
  // TEST CASE 3: Charlie (Junior) tries to edit (should fail)
  // ========================================================================
  console.log("📝 Test Case 3: Junior Engineer Tries to Edit (Should Fail)");
  console.log("-".repeat(80));

  const clientReq3 = await clientRequestPermission(
    {
      userId: "user:charlie",
      resourceId: "resource:team-docs",
      capability: "write",
    },
    clientService
  );

  if (!clientReq3.allowed) {
    console.log("\n🚫 Result: DENIED");
    console.log(`   Charlie only has read access, cannot edit\n`);
  }

  // ========================================================================
  // TEST CASE 4: Diana (Intern) accesses project
  // ========================================================================
  console.log("📝 Test Case 4: Intern Accesses Project Documentation");
  console.log("-".repeat(80));

  const clientReq4 = await clientRequestPermission(
    {
      userId: "user:diana",
      resourceId: "resource:project-alpha",
      capability: "read",
    },
    clientService
  );

  if (clientReq4.allowed) {
    const serverResp4 = await serverValidatePermission(
      {
        userId: "user:diana",
        resourceId: "resource:project-alpha",
        edgeIds: clientReq4.edgeIds,
      },
      graphDO,
      auditLogger
    );

    console.log(`\n🎉 Result: ${serverResp4.allowed ? "ALLOWED" : "DENIED"}`);
    console.log(`   Diana can read project-alpha as intern\n`);
  }

  // ========================================================================
  // TEST CASE 5: Revoke intern access (end of internship)
  // ========================================================================
  console.log("📝 Test Case 5: Revoke Intern Access (End of Internship)");
  console.log("-".repeat(80));

  // Revoke Diana's membership
  await graphDO.revokeEdge(dianaEdges[0].id);
  console.log("[ADMIN] Revoked Diana's group membership\n");

  // Try to access again
  const clientReq5 = await clientRequestPermission(
    {
      userId: "user:diana",
      resourceId: "resource:project-alpha",
      capability: "read",
    },
    clientService
  );

  if (clientReq5.allowed) {
    const serverResp5 = await serverValidatePermission(
      {
        userId: "user:diana",
        resourceId: "resource:project-alpha",
        edgeIds: clientReq5.edgeIds,
      },
      graphDO,
      auditLogger
    );

    console.log(`\n🚫 Result: ${serverResp5.allowed ? "ALLOWED" : "DENIED"}`);
    console.log(`   Reason: ${serverResp5.reason}`);
    console.log(`   Diana's access revoked after internship ended\n`);
  }

  // ========================================================================
  // TEST CASE 6: Attack Scenario - Privilege Escalation
  // ========================================================================
  console.log("📝 Test Case 6: Attack Prevention - Privilege Escalation");
  console.log("-".repeat(80));

  // Charlie tries to use disconnected edges to access tech-docs
  console.log(
    "[ATTACKER] Charlie attempts to use disconnected edges to access tech-docs\n"
  );

  const attackEdges = [
    charlieEdges[0].id, // Charlie -> eng-team (valid)
    aliceEdges[1].id, // eng-leadership -> tech-docs (valid but NOT CONNECTED!)
  ];

  const serverResp6 = await serverValidatePermission(
    {
      userId: "user:charlie",
      resourceId: "resource:tech-docs",
      edgeIds: attackEdges,
    },
    graphDO,
    auditLogger
  );

  console.log(`\n🛡️  Result: ${serverResp6.allowed ? "ALLOWED" : "DENIED"}`);
  console.log(`   Reason: ${serverResp6.reason}`);
  console.log(`   Attack detected and blocked!\n`);

  // ========================================================================
  // AUDIT REPORT
  // ========================================================================
  console.log("");
  console.log("=".repeat(80));
  console.log("AUDIT TRAIL REPORT");
  console.log("=".repeat(80));
  console.log("");

  const events = auditLogger.getAllEvents();
  console.log(`Total Events: ${events.length}\n`);

  events.forEach((event, idx) => {
    console.log(`Event ${idx + 1}:`);
    console.log(`  Type: ${event.eventType}`);
    console.log(`  User: ${event.userId}`);
    console.log(`  Resource: ${event.resourceId}`);
    console.log(`  Result: ${event.result}`);
    if (event.attackType) {
      console.log(`  ⚠️  Attack Type: ${event.attackType}`);
    }
    console.log("");
  });

  console.log("=".repeat(80));
  console.log("EXAMPLE COMPLETE");
  console.log("=".repeat(80));
}

// Run the example
if (require.main === module) {
  runDocumentSystemExample().catch(console.error);
}
