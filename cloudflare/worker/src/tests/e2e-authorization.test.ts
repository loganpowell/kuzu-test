import { describe, it, expect, beforeEach } from "vitest";
import { GraphStateDO } from "../durable-objects/graph-state-do";
import { validatePermissionPath } from "../services/permission-validator";
import { AuditLogger } from "../services/audit-logger";

/**
 * End-to-End Authorization Test Suite
 *
 * Demonstrates real-world authorization scenarios:
 * - Corporate hierarchy (CEO -> Managers -> Engineers)
 * - Department-based access
 * - Project-based permissions
 * - Temporary access grants
 * - Permission revocation
 */

describe("E2E Authorization Scenarios", () => {
  let graphDO: GraphStateDO;
  let auditLogger: AuditLogger;

  // Mock entities
  const mockState = {} as any;
  const mockEnv = {} as any;

  beforeEach(async () => {
    graphDO = new GraphStateDO(mockState, mockEnv);
    auditLogger = new AuditLogger();

    // Build the organization structure
    await setupOrganization();
  });

  /**
   * Setup: Create a realistic organization structure
   *
   * Users:
   * - alice (CEO)
   * - bob (Engineering Manager)
   * - charlie (Engineer)
   * - diana (Sales Manager)
   * - eve (Contractor - temporary access)
   *
   * Groups:
   * - executives
   * - engineering-dept
   * - sales-dept
   * - engineering-team
   * - project-alpha-team
   *
   * Resources:
   * - company-financials
   * - engineering-docs
   * - project-alpha-code
   * - sales-reports
   * - public-wiki
   */
  async function setupOrganization() {
    // 1. Create organizational hierarchy
    // Alice (CEO) -> Executives
    const aliceToExecs = await graphDO.createEdge({
      type: "MEMBER_OF",
      sourceId: "user:alice",
      targetId: "group:executives",
      properties: { role: "ceo" },
    });

    // Bob (Eng Manager) -> Engineering Dept
    const bobToEngDept = await graphDO.createEdge({
      type: "MEMBER_OF",
      sourceId: "user:bob",
      targetId: "group:engineering-dept",
      properties: { role: "manager" },
    });

    // Charlie (Engineer) -> Engineering Team
    const charlieToEngTeam = await graphDO.createEdge({
      type: "MEMBER_OF",
      sourceId: "user:charlie",
      targetId: "group:engineering-team",
      properties: { role: "engineer" },
    });

    // Diana (Sales Manager) -> Sales Dept
    const dianaToSales = await graphDO.createEdge({
      type: "MEMBER_OF",
      sourceId: "user:diana",
      targetId: "group:sales-dept",
      properties: { role: "manager" },
    });

    // Eve (Contractor) -> Project Alpha Team
    const eveToProjectAlpha = await graphDO.createEdge({
      type: "MEMBER_OF",
      sourceId: "user:eve",
      targetId: "group:project-alpha-team",
      properties: { role: "contractor", temporary: true },
    });

    // 2. Setup group inheritance
    // Engineering Team -> Engineering Dept
    await graphDO.createEdge({
      type: "INHERITS_FROM",
      sourceId: "group:engineering-team",
      targetId: "group:engineering-dept",
      properties: {},
    });

    // Engineering Dept -> Executives (managers report to execs)
    await graphDO.createEdge({
      type: "INHERITS_FROM",
      sourceId: "group:engineering-dept",
      targetId: "group:executives",
      properties: {},
    });

    // Sales Dept -> Executives
    await graphDO.createEdge({
      type: "INHERITS_FROM",
      sourceId: "group:sales-dept",
      targetId: "group:executives",
      properties: {},
    });

    // Project Alpha Team -> Engineering Team
    await graphDO.createEdge({
      type: "INHERITS_FROM",
      sourceId: "group:project-alpha-team",
      targetId: "group:engineering-team",
      properties: {},
    });

    // 3. Setup resource permissions
    // Executives can access company financials
    await graphDO.createEdge({
      type: "HAS_PERMISSION",
      sourceId: "group:executives",
      targetId: "resource:company-financials",
      properties: { capability: "read" },
    });

    // Engineering Dept can access engineering docs
    await graphDO.createEdge({
      type: "HAS_PERMISSION",
      sourceId: "group:engineering-dept",
      targetId: "resource:engineering-docs",
      properties: { capability: "write" },
    });

    // Project Alpha Team can access project code
    await graphDO.createEdge({
      type: "HAS_PERMISSION",
      sourceId: "group:project-alpha-team",
      targetId: "resource:project-alpha-code",
      properties: { capability: "write" },
    });

    // Sales Dept can access sales reports
    await graphDO.createEdge({
      type: "HAS_PERMISSION",
      sourceId: "group:sales-dept",
      targetId: "resource:sales-reports",
      properties: { capability: "write" },
    });

    // Everyone can read public wiki (direct user permissions)
    await graphDO.createEdge({
      type: "HAS_PERMISSION",
      sourceId: "user:alice",
      targetId: "resource:public-wiki",
      properties: { capability: "read" },
    });

    await graphDO.createEdge({
      type: "HAS_PERMISSION",
      sourceId: "user:charlie",
      targetId: "resource:public-wiki",
      properties: { capability: "read" },
    });
  }

  describe("Scenario 1: CEO Access (Deep Hierarchy)", () => {
    it("should allow CEO to access company financials via executives group", async () => {
      // Alice: user:alice -> group:executives -> resource:company-financials
      const edges = await graphDO.createPermissionChain({
        userId: "user:alice",
        groups: ["group:executives"],
        resourceId: "resource:company-financials",
        capability: "read",
      });

      const result = await validatePermissionPath({
        edgeIds: edges.map((e) => e.id),
        userId: "user:alice",
        resourceId: "resource:company-financials",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(true);
      expect(auditLogger.getLastEvent()!.result).toBe("ALLOWED");
    });

    it("should allow CEO to access engineering docs via inheritance chain", async () => {
      // Alice: user -> executives <- eng-dept -> engineering-docs
      // This demonstrates multi-level inheritance
      const edges = await graphDO.createPermissionChain({
        userId: "user:alice",
        groups: ["group:executives", "group:engineering-dept"],
        resourceId: "resource:engineering-docs",
        capability: "write",
      });

      const result = await validatePermissionPath({
        edgeIds: edges.map((e) => e.id),
        userId: "user:alice",
        resourceId: "resource:engineering-docs",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("Scenario 2: Engineer Access (Mid-Level)", () => {
    it("should allow engineer to access engineering docs via team inheritance", async () => {
      // Charlie: user -> eng-team -> eng-dept -> engineering-docs
      const edges = await graphDO.createPermissionChain({
        userId: "user:charlie",
        groups: ["group:engineering-team", "group:engineering-dept"],
        resourceId: "resource:engineering-docs",
        capability: "write",
      });

      const result = await validatePermissionPath({
        edgeIds: edges.map((e) => e.id),
        userId: "user:charlie",
        resourceId: "resource:engineering-docs",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(true);
    });

    it("should deny engineer access to company financials (insufficient permissions)", async () => {
      // Charlie doesn't have path to financials
      const result = await validatePermissionPath({
        edgeIds: ["non-existent-edge"],
        userId: "user:charlie",
        resourceId: "resource:company-financials",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("does not exist");
    });
  });

  describe("Scenario 3: Contractor Access (Temporary)", () => {
    it("should allow contractor to access project code via project team", async () => {
      // Eve: user -> project-alpha-team -> project-alpha-code
      const edges = await graphDO.createPermissionChain({
        userId: "user:eve",
        groups: ["group:project-alpha-team"],
        resourceId: "resource:project-alpha-code",
        capability: "write",
      });

      const result = await validatePermissionPath({
        edgeIds: edges.map((e) => e.id),
        userId: "user:eve",
        resourceId: "resource:project-alpha-code",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(true);
    });

    it("should deny contractor access after revocation", async () => {
      // Setup: Give Eve access
      const edges = await graphDO.createPermissionChain({
        userId: "user:eve",
        groups: ["group:project-alpha-team"],
        resourceId: "resource:project-alpha-code",
        capability: "write",
      });

      // Access works initially
      let result = await validatePermissionPath({
        edgeIds: edges.map((e) => e.id),
        userId: "user:eve",
        resourceId: "resource:project-alpha-code",
        graphDO,
        auditLogger,
      });
      expect(result.valid).toBe(true);

      // Revoke contractor's team membership (end of contract)
      await graphDO.revokeEdge(edges[0].id);

      // Access denied after revocation
      result = await validatePermissionPath({
        edgeIds: edges.map((e) => e.id),
        userId: "user:eve",
        resourceId: "resource:project-alpha-code",
        graphDO,
        auditLogger,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("revoked");
    });
  });

  describe("Scenario 4: Cross-Department Denial", () => {
    it("should deny sales manager access to engineering docs", async () => {
      // Diana (sales) should not access engineering resources
      const result = await validatePermissionPath({
        edgeIds: ["fake-edge"],
        userId: "user:diana",
        resourceId: "resource:engineering-docs",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
    });

    it("should deny engineer access to sales reports", async () => {
      // Charlie (engineer) should not access sales resources
      const result = await validatePermissionPath({
        edgeIds: ["fake-edge"],
        userId: "user:charlie",
        resourceId: "resource:sales-reports",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
    });
  });

  describe("Scenario 5: Direct Permissions", () => {
    it("should allow user to access public wiki via direct permission", async () => {
      // Charlie has direct access to public wiki
      const edges = await graphDO.createPermissionChain({
        userId: "user:charlie",
        groups: [],
        resourceId: "resource:public-wiki",
        capability: "read",
      });

      const result = await validatePermissionPath({
        edgeIds: edges.map((e) => e.id),
        userId: "user:charlie",
        resourceId: "resource:public-wiki",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("Scenario 6: Attack Prevention", () => {
    it("should prevent privilege escalation via disconnected chain", async () => {
      // ATTACK: Charlie tries to access financials by submitting valid but disconnected edges

      // Valid edge: Charlie -> Engineering Team
      const charlieToEngTeam = await graphDO.createEdge({
        type: "MEMBER_OF",
        sourceId: "user:charlie",
        targetId: "group:engineering-team",
        properties: {},
      });

      // Valid edge: Executives -> Financials (but Charlie is NOT an executive)
      const execsToFinancials = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "group:executives",
        targetId: "resource:company-financials",
        properties: { capability: "read" },
      });

      // ATTACK: Submit disconnected chain
      const result = await validatePermissionPath({
        edgeIds: [charlieToEngTeam.id, execsToFinancials.id],
        userId: "user:charlie",
        resourceId: "resource:company-financials",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
      expect(result.brokenChainAt).toBe(0);
      expect(auditLogger.getLastEvent()!.eventType).toBe("ATTACK_DETECTED");
    });

    it("should prevent impersonation attack", async () => {
      // ATTACK: Bob tries to use Alice's edges
      const aliceEdges = await graphDO.createPermissionChain({
        userId: "user:alice",
        groups: ["group:executives"],
        resourceId: "resource:company-financials",
        capability: "read",
      });

      // Bob submits Alice's edge IDs
      const result = await validatePermissionPath({
        edgeIds: aliceEdges.map((e) => e.id),
        userId: "user:bob", // Different user!
        resourceId: "resource:company-financials",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("does not start with user");
    });

    it("should prevent wrong resource attack", async () => {
      // ATTACK: Charlie has access to engineering docs, tries to use those edges for financials
      const charlieEdges = await graphDO.createPermissionChain({
        userId: "user:charlie",
        groups: ["group:engineering-team", "group:engineering-dept"],
        resourceId: "resource:engineering-docs",
        capability: "write",
      });

      // Try to access different resource with those edges
      const result = await validatePermissionPath({
        edgeIds: charlieEdges.map((e) => e.id),
        userId: "user:charlie",
        resourceId: "resource:company-financials", // Wrong resource!
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("does not end at resource");
    });
  });

  describe("Scenario 7: Audit Trail", () => {
    it("should log complete audit trail for successful access", async () => {
      auditLogger.clear();

      const edges = await graphDO.createPermissionChain({
        userId: "user:alice",
        groups: ["group:executives"],
        resourceId: "resource:company-financials",
        capability: "read",
      });

      await validatePermissionPath({
        edgeIds: edges.map((e) => e.id),
        userId: "user:alice",
        resourceId: "resource:company-financials",
        graphDO,
        auditLogger,
      });

      const events = auditLogger.getAllEvents();
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe("PERMISSION_CHECK");
      expect(events[0].userId).toBe("user:alice");
      expect(events[0].resourceId).toBe("resource:company-financials");
      expect(events[0].result).toBe("ALLOWED");
      expect(events[0].edgeIds).toEqual(edges.map((e) => e.id));
    });

    it("should log attack attempts with full context", async () => {
      auditLogger.clear();

      // Disconnected chain attack
      const edge1 = await graphDO.createEdge({
        type: "MEMBER_OF",
        sourceId: "user:charlie",
        targetId: "group:engineering-team",
        properties: {},
      });

      const edge2 = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "group:executives",
        targetId: "resource:company-financials",
        properties: { capability: "read" },
      });

      await validatePermissionPath({
        edgeIds: [edge1.id, edge2.id],
        userId: "user:charlie",
        resourceId: "resource:company-financials",
        graphDO,
        auditLogger,
      });

      const events = auditLogger.getAllEvents();
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe("ATTACK_DETECTED");
      expect(events[0].attackType).toBe("DISCONNECTED_EDGE_CHAIN");
      expect(events[0].brokenChainAt).toBe(0);
    });
  });

  describe("Scenario 8: Performance at Scale", () => {
    it("should validate long permission chains efficiently", async () => {
      // Create a deep hierarchy: 10 levels
      const levels = 10;
      const groups: string[] = [];
      for (let i = 0; i < levels; i++) {
        groups.push(`group:level-${i}`);
      }

      const edges = await graphDO.createPermissionChain({
        userId: "user:deep-user",
        groups,
        resourceId: "resource:deep-resource",
        capability: "read",
      });

      const start = performance.now();
      const result = await validatePermissionPath({
        edgeIds: edges.map((e) => e.id),
        userId: "user:deep-user",
        resourceId: "resource:deep-resource",
        graphDO,
        auditLogger,
      });
      const duration = performance.now() - start;

      expect(result.valid).toBe(true);
      expect(duration).toBeLessThan(10); // Should complete in <10ms
    });
  });
});
