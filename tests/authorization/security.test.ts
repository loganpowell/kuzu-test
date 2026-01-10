import { describe, it, expect, beforeEach } from "vitest";
import { GraphStateDO } from "../../cloudflare/worker/src/durable-objects/graph-state-do";
import { validatePermissionPath } from "../../cloudflare/worker/src/services/permission-validator";
import { AuditLogger } from "../../cloudflare/worker/src/services/audit-logger";

/**
 * TDD Security Test Suite for Edge-Based Permission System
 *
 * These tests define the security contract that our system must uphold.
 * All tests should pass before deploying to production.
 */

describe("Edge-Based Permission Security", () => {
  let graphDO: GraphStateDO;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    // Setup fresh instances for each test
    const mockState = {} as any;
    const mockEnv = {} as any;
    graphDO = new GraphStateDO(mockState, mockEnv);
    auditLogger = new AuditLogger();
  });

  describe("Edge ID Security", () => {
    it("should reject forged edge IDs", async () => {
      // ATTACK: Client submits non-existent edge IDs
      const forgedEdgeIds = ["forged-uuid-1", "forged-uuid-2"];

      const result = await validatePermissionPath({
        edgeIds: forgedEdgeIds,
        userId: "user-123",
        resourceId: "doc-456",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("does not exist");
      // Note: This is logged as DENIED, not ATTACK_DETECTED (no broken chain)
      expect(auditLogger.getLastEvent()!.result).toBe("DENIED");
    });

    it("should only accept server-generated UUIDs", async () => {
      // Setup: Create edge through proper server API
      const validEdge = await graphDO.createEdge({
        type: "MEMBER_OF",
        sourceId: "user-123",
        targetId: "group-456",
        properties: {},
      });

      // Edge ID should be a valid UUID v4
      expect(validEdge.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(await graphDO.edgeExists(validEdge.id)).toBe(true);
    });

    it("should reject revoked edges", async () => {
      // Setup: Create and then revoke an edge
      const edge = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "group-123",
        targetId: "doc-456",
        properties: { capability: "write" },
      });

      await graphDO.revokeEdge(edge.id);

      // ATTACK: Try to use revoked edge
      const result = await validatePermissionPath({
        edgeIds: [edge.id],
        userId: "user-123",
        resourceId: "doc-456",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("revoked");
    });
  });

  describe("Chain Connectivity Security", () => {
    it("should reject disconnected edge chains", async () => {
      // Setup: Create valid but disconnected edges
      const edge1 = await graphDO.createEdge({
        type: "MEMBER_OF",
        sourceId: "user-123",
        targetId: "team-engineering",
        properties: {},
      });

      const edge2 = await graphDO.createEdge({
        type: "INHERITS_FROM",
        sourceId: "team-sales", // NOT CONNECTED TO edge1!
        targetId: "org-acme",
        properties: {},
      });

      const edge3 = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "org-acme",
        targetId: "doc-789",
        properties: { capability: "read" },
      });

      // ATTACK: Submit disconnected chain
      const result = await validatePermissionPath({
        edgeIds: [edge1.id, edge2.id, edge3.id],
        userId: "user-123",
        resourceId: "doc-789",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
      expect(result.reason!.toLowerCase()).toContain("broken");
      expect(result.brokenChainAt).toBe(0); // Break between edge1 and edge2
      expect(auditLogger.hasEvent("ATTACK_DETECTED")).toBe(true);
      expect(auditLogger.getLastEvent()!.attackType).toBe(
        "DISCONNECTED_EDGE_CHAIN"
      );
    });

    it("should verify chain starts with requesting user", async () => {
      // Setup: Create valid chain but starting from different user
      const edge1 = await graphDO.createEdge({
        type: "MEMBER_OF",
        sourceId: "user-999", // WRONG USER!
        targetId: "team-eng",
        properties: {},
      });

      const edge2 = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "team-eng",
        targetId: "doc-123",
        properties: { capability: "read" },
      });

      // ATTACK: User-123 tries to use user-999's permissions
      const result = await validatePermissionPath({
        edgeIds: [edge1.id, edge2.id],
        userId: "user-123", // Different from edge1.sourceId
        resourceId: "doc-123",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("does not start with user");
    });

    it("should verify chain ends at target resource", async () => {
      // Setup: Valid chain but ends at wrong resource
      const edge1 = await graphDO.createEdge({
        type: "MEMBER_OF",
        sourceId: "user-123",
        targetId: "team-eng",
        properties: {},
      });

      const edge2 = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "team-eng",
        targetId: "doc-999", // WRONG RESOURCE!
        properties: { capability: "write" },
      });

      // ATTACK: Try to access doc-123 using permission for doc-999
      const result = await validatePermissionPath({
        edgeIds: [edge1.id, edge2.id],
        userId: "user-123",
        resourceId: "doc-123", // Different from edge2.targetId
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("does not end at resource");
    });

    it("should validate correct chain connectivity", async () => {
      // Setup: Create properly connected chain
      const edge1 = await graphDO.createEdge({
        type: "MEMBER_OF",
        sourceId: "user-123",
        targetId: "team-eng",
        properties: {},
      });

      const edge2 = await graphDO.createEdge({
        type: "INHERITS_FROM",
        sourceId: "team-eng", // Connects to edge1.targetId ✓
        targetId: "org-acme",
        properties: {},
      });

      const edge3 = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "org-acme", // Connects to edge2.targetId ✓
        targetId: "doc-789",
        properties: { capability: "write" },
      });

      // Valid chain should pass
      const result = await validatePermissionPath({
        edgeIds: [edge1.id, edge2.id, edge3.id],
        userId: "user-123",
        resourceId: "doc-789",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("Permission Validation", () => {
    it("should allow valid direct permissions", async () => {
      // Setup: Direct permission (no inheritance)
      const edge = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "user-123",
        targetId: "doc-456",
        properties: { capability: "read" },
      });

      const result = await validatePermissionPath({
        edgeIds: [edge.id],
        userId: "user-123",
        resourceId: "doc-456",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(true);
    });

    it("should allow valid transitive permissions", async () => {
      // Setup: Multi-hop permission chain
      const edges = await graphDO.createPermissionChain({
        userId: "user-123",
        groups: ["team-eng", "org-acme", "parent-org"],
        resourceId: "doc-789",
        capability: "write",
      });

      const result = await validatePermissionPath({
        edgeIds: edges.map((e) => e.id),
        userId: "user-123",
        resourceId: "doc-789",
        graphDO,
        auditLogger,
      });

      expect(result.valid).toBe(true);
      expect(auditLogger.getLastEvent()!.checkType).toBe("EDGE_VALIDATION");
      expect(auditLogger.getLastEvent()!.edgeIds).toEqual(
        edges.map((e) => e.id)
      );
    });

    it("should deny permissions after revocation", async () => {
      // Setup: Grant then revoke permission
      const edge = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "team-eng",
        targetId: "doc-123",
        properties: { capability: "write" },
      });

      // Create a user->team edge first
      const userEdge = await graphDO.createEdge({
        type: "MEMBER_OF",
        sourceId: "user-123",
        targetId: "team-eng",
        properties: {},
      });

      // Permission works initially
      let result = await validatePermissionPath({
        edgeIds: [userEdge.id, edge.id],
        userId: "user-123",
        resourceId: "doc-123",
        graphDO,
        auditLogger,
      });
      expect(result.valid).toBe(true);

      // Revoke permission
      await graphDO.revokeEdge(edge.id);

      // Should now be denied
      result = await validatePermissionPath({
        edgeIds: [userEdge.id, edge.id],
        userId: "user-123",
        resourceId: "doc-123",
        graphDO,
        auditLogger,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("Audit Logging", () => {
    it("should log all permission checks with edge IDs", async () => {
      const edge = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "user-123",
        targetId: "doc-456",
        properties: { capability: "read" },
      });

      await validatePermissionPath({
        edgeIds: [edge.id],
        userId: "user-123",
        resourceId: "doc-456",
        graphDO,
        auditLogger,
      });

      const auditEvent = auditLogger.getLastEvent()!;
      expect(auditEvent.eventType).toBe("PERMISSION_CHECK");
      expect(auditEvent.userId).toBe("user-123");
      expect(auditEvent.resourceId).toBe("doc-456");
      expect(auditEvent.edgeIds).toEqual([edge.id]);
      expect(auditEvent.result).toBe("ALLOWED");
      expect(auditEvent.timestamp).toBeDefined();
    });

    it("should log failed attempts with reason", async () => {
      const forgedEdgeIds = ["fake-id"];

      await validatePermissionPath({
        edgeIds: forgedEdgeIds,
        userId: "user-123",
        resourceId: "doc-456",
        graphDO,
        auditLogger,
      });

      const auditEvent = auditLogger.getLastEvent()!;
      expect(auditEvent.result).toBe("DENIED");
      expect(auditEvent.invalidEdgeId).toBe("fake-id");
      expect(auditEvent.reason).toContain("does not exist");
    });

    it("should log attack attempts", async () => {
      // Setup disconnected chain
      const edge1 = await graphDO.createEdge({
        type: "MEMBER_OF",
        sourceId: "user-123",
        targetId: "team-a",
        properties: {},
      });
      const edge2 = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "team-b", // Disconnected!
        targetId: "doc-789",
        properties: { capability: "admin" },
      });

      await validatePermissionPath({
        edgeIds: [edge1.id, edge2.id],
        userId: "user-123",
        resourceId: "doc-789",
        graphDO,
        auditLogger,
      });

      const auditEvent = auditLogger.getLastEvent()!;
      expect(auditEvent.eventType).toBe("ATTACK_DETECTED");
      expect(auditEvent.attackType).toBe("DISCONNECTED_EDGE_CHAIN");
      expect(auditEvent.brokenChainAt).toBe(0);
    });
  });

  describe("Performance & Efficiency", () => {
    it("should validate edges in O(n) time", async () => {
      // Create chain with varying lengths
      const testChainLengths = [1, 3, 5, 10];
      const timings: number[] = [];

      for (const length of testChainLengths) {
        const edges = await graphDO.createPermissionChain({
          userId: "user-123",
          groups: Array(length)
            .fill(0)
            .map((_, i) => `group-${i}`),
          resourceId: "doc-test",
          capability: "read",
        });

        const start = performance.now();
        await validatePermissionPath({
          edgeIds: edges.map((e) => e.id),
          userId: "user-123",
          resourceId: "doc-test",
          graphDO,
          auditLogger,
        });
        const end = performance.now();

        timings.push(end - start);
      }

      // Validation should be roughly O(n) - longer chains take proportionally longer
      // but not exponentially longer (which would indicate O(n²))
      const ratio_3_to_1 = timings[1] / timings[0];
      const ratio_10_to_5 = timings[3] / timings[2];

      // Ratios should be roughly similar (indicating linear growth)
      expect(Math.abs(ratio_3_to_1 - ratio_10_to_5)).toBeLessThan(2);

      // All validations should complete quickly
      timings.forEach((t) => expect(t).toBeLessThan(10)); // <10ms
    });

    it("should handle edge lookup in O(1) time", async () => {
      // Create many edges
      const edgeCount = 1000;
      const edges = await Promise.all(
        Array(edgeCount)
          .fill(0)
          .map((_, i) =>
            graphDO.createEdge({
              type: "TEST",
              sourceId: `source-${i}`,
              targetId: `target-${i}`,
              properties: {},
            })
          )
      );

      // Lookup should be constant time regardless of total edge count
      const lookupTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const randomEdge = edges[Math.floor(Math.random() * edges.length)];
        const start = performance.now();
        await graphDO.edgeExists(randomEdge.id);
        const end = performance.now();
        lookupTimes.push(end - start);
      }

      // All lookups should be fast and consistent
      lookupTimes.forEach((t) => expect(t).toBeLessThan(1)); // <1ms
      const avgTime = lookupTimes.reduce((a, b) => a + b) / lookupTimes.length;
      const variance =
        lookupTimes.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) /
        lookupTimes.length;
      expect(variance).toBeLessThan(0.1); // Low variance = consistent O(1)
    });
  });

  describe("Mutation Security", () => {
    it("should require valid proof for mutations", async () => {
      const mutation = {
        type: "UPDATE_RESOURCE",
        resourceId: "doc-123",
        updates: { title: "New Title" },
      };

      // ATTACK: Try mutation without proof
      await expect(graphDO.applyMutation(mutation, null)).rejects.toThrow(
        "Proof required"
      );
    });

    it("should validate proof before applying mutation", async () => {
      // Setup: Create valid permission
      const edge = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "user-123",
        targetId: "doc-123",
        properties: { capability: "write" },
      });

      const mutation = {
        type: "UPDATE_RESOURCE",
        resourceId: "doc-123",
        updates: { title: "New Title" },
      };

      // Should succeed with valid proof
      const result = await graphDO.applyMutation(mutation, {
        userId: "user-123",
        edgeIds: [edge.id],
      });

      expect(result.success).toBe(true);
    });

    it("should reject mutations with invalid proof", async () => {
      const mutation = {
        type: "UPDATE_RESOURCE",
        resourceId: "doc-123",
        updates: { title: "Hacked" },
      };

      // ATTACK: Use forged edge IDs
      await expect(
        graphDO.applyMutation(mutation, {
          userId: "user-123",
          edgeIds: ["forged-id"],
        })
      ).rejects.toThrow("Invalid permission proof");
    });
  });

  describe("Edge Immutability", () => {
    it("should preserve edge history through soft deletes", async () => {
      const edge = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "user-123",
        targetId: "doc-456",
        properties: { capability: "admin" },
      });

      const createdAt = edge.createdAt;

      // Wait 2ms to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 2));

      // Revoke edge
      await graphDO.revokeEdge(edge.id);

      // Edge should still exist but be marked revoked
      const revokedEdge = await graphDO.getEdge(edge.id);
      expect(revokedEdge).toBeDefined();
      expect(revokedEdge!.id).toBe(edge.id);
      expect(revokedEdge!.createdAt).toBe(createdAt);
      expect(revokedEdge!.revokedAt).toBeDefined();
      expect(revokedEdge!.revokedAt!).toBeGreaterThanOrEqual(createdAt);
    });

    it("should support audit trail reconstruction", async () => {
      const edge = await graphDO.createEdge({
        type: "HAS_PERMISSION",
        sourceId: "user-123",
        targetId: "doc-456",
        properties: { capability: "write" },
      });

      // Use permission
      await validatePermissionPath({
        edgeIds: [edge.id],
        userId: "user-123",
        resourceId: "doc-456",
        graphDO,
        auditLogger,
      });

      // Revoke permission
      await graphDO.revokeEdge(edge.id);

      // Try to use again
      await validatePermissionPath({
        edgeIds: [edge.id],
        userId: "user-123",
        resourceId: "doc-456",
        graphDO,
        auditLogger,
      });

      // Audit trail should show both events
      const events = auditLogger.getAllEvents();
      expect(events.length).toBe(2);
      expect(events[0].result).toBe("ALLOWED");
      expect(events[1].result).toBe("DENIED");
      expect(events[1].reason).toContain("revoked");
    });
  });
});
