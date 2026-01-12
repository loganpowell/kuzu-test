import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  OptimisticUpdater,
  type PendingMutation,
} from "../src/optimistic-updater";

describe("OptimisticUpdater", () => {
  let updater: OptimisticUpdater;
  let mockClient: any;
  let onRollbackSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock client with required methods
    mockClient = {
      grantPermission: vi.fn().mockResolvedValue(undefined),
      revokePermission: vi.fn().mockResolvedValue(undefined),
      queryCache: {
        clear: vi.fn(),
      },
      resourceCache: {
        clear: vi.fn(),
      },
    };

    onRollbackSpy = vi.fn();
    updater = new OptimisticUpdater(mockClient, onRollbackSpy);
  });

  describe("applyOptimistically", () => {
    it("should apply grant mutation locally", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      expect(mutationId).toMatch(/^grant-user:alice-read-doc:readme-\d+$/);
      expect(mockClient.grantPermission).toHaveBeenCalledWith(
        "user:alice",
        "read",
        "doc:readme"
      );
    });

    it("should apply revoke mutation locally", async () => {
      const mutationId = await updater.applyOptimistically(
        "revoke",
        "user:bob",
        "write",
        "doc:api"
      );

      expect(mutationId).toMatch(/^revoke-user:bob-write-doc:api-\d+$/);
      expect(mockClient.revokePermission).toHaveBeenCalledWith(
        "user:bob",
        "write",
        "doc:api"
      );
    });

    it("should track pending mutation", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      expect(updater.getPendingCount()).toBe(1);
      expect(updater.isPending(mutationId)).toBe(true);

      const pending = updater.getPendingMutations();
      expect(pending).toHaveLength(1);
      expect(pending[0].type).toBe("grant");
      expect(pending[0].userId).toBe("user:alice");
      expect(pending[0].capability).toBe("read");
      expect(pending[0].resourceId).toBe("doc:readme");
    });

    it("should generate unique mutation IDs", async () => {
      const id1 = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:1"
      );
      const id2 = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:2"
      );

      expect(id1).not.toBe(id2);
      expect(updater.getPendingCount()).toBe(2);
    });

    it("should handle multiple pending mutations", async () => {
      await updater.applyOptimistically("grant", "user:alice", "read", "doc:1");
      await updater.applyOptimistically("revoke", "user:bob", "write", "doc:2");
      await updater.applyOptimistically(
        "grant",
        "user:charlie",
        "admin",
        "doc:3"
      );

      expect(updater.getPendingCount()).toBe(3);

      const pending = updater.getPendingMutations();
      expect(pending[0].type).toBe("grant");
      expect(pending[1].type).toBe("revoke");
      expect(pending[2].type).toBe("grant");
    });
  });

  describe("confirmMutation", () => {
    it("should remove mutation from pending", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      expect(updater.getPendingCount()).toBe(1);

      updater.confirmMutation(mutationId);

      expect(updater.getPendingCount()).toBe(0);
      expect(updater.isPending(mutationId)).toBe(false);
    });

    it("should handle confirming non-existent mutation gracefully", () => {
      updater.confirmMutation("non-existent-id");
      expect(updater.getPendingCount()).toBe(0);
    });

    it("should only remove confirmed mutation, not others", async () => {
      const id1 = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:1"
      );
      const id2 = await updater.applyOptimistically(
        "grant",
        "user:bob",
        "write",
        "doc:2"
      );

      updater.confirmMutation(id1);

      expect(updater.getPendingCount()).toBe(1);
      expect(updater.isPending(id1)).toBe(false);
      expect(updater.isPending(id2)).toBe(true);
    });
  });

  describe("rollbackMutation", () => {
    it("should reverse grant mutation by revoking", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      await updater.rollbackMutation(mutationId);

      expect(mockClient.revokePermission).toHaveBeenCalledWith(
        "user:alice",
        "read",
        "doc:readme"
      );
    });

    it("should reverse revoke mutation by granting", async () => {
      const mutationId = await updater.applyOptimistically(
        "revoke",
        "user:bob",
        "write",
        "doc:api"
      );

      await updater.rollbackMutation(mutationId);

      expect(mockClient.grantPermission).toHaveBeenCalledWith(
        "user:bob",
        "write",
        "doc:api"
      );
    });

    it("should remove mutation from pending list", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      expect(updater.getPendingCount()).toBe(1);

      await updater.rollbackMutation(mutationId);

      expect(updater.getPendingCount()).toBe(0);
      expect(updater.isPending(mutationId)).toBe(false);
    });

    it("should clear all caches after rollback", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      await updater.rollbackMutation(mutationId);

      expect(mockClient.queryCache.clear).toHaveBeenCalled();
      expect(mockClient.resourceCache.clear).toHaveBeenCalled();
    });

    it("should call onRollback callback", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      await updater.rollbackMutation(mutationId);

      expect(onRollbackSpy).toHaveBeenCalledWith(mutationId, expect.any(Error));
    });

    it("should handle rolling back non-existent mutation gracefully", async () => {
      await expect(
        updater.rollbackMutation("non-existent-id")
      ).resolves.not.toThrow();

      expect(mockClient.grantPermission).not.toHaveBeenCalled();
      expect(mockClient.revokePermission).not.toHaveBeenCalled();
    });

    it("should propagate errors from rollback operations", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      const rollbackError = new Error("Rollback failed");
      mockClient.revokePermission.mockRejectedValueOnce(rollbackError);

      await expect(updater.rollbackMutation(mutationId)).rejects.toThrow(
        "Rollback failed"
      );
    });
  });

  describe("getPendingMutations", () => {
    it("should return empty array when no pending mutations", () => {
      expect(updater.getPendingMutations()).toEqual([]);
    });

    it("should return all pending mutations with details", async () => {
      const id1 = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:1"
      );
      const id2 = await updater.applyOptimistically(
        "revoke",
        "user:bob",
        "write",
        "doc:2"
      );

      const pending = updater.getPendingMutations();

      expect(pending).toHaveLength(2);
      expect(pending[0].id).toBe(id1);
      expect(pending[0].type).toBe("grant");
      expect(pending[1].id).toBe(id2);
      expect(pending[1].type).toBe("revoke");
    });

    it("should include timestamp in mutation details", async () => {
      const id = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:1"
      );
      const pending = updater.getPendingMutations();

      expect(pending[0].timestamp).toBeTypeOf("number");
      expect(pending[0].timestamp).toBeGreaterThan(0);
    });
  });

  describe("isPending", () => {
    it("should return true for pending mutations", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      expect(updater.isPending(mutationId)).toBe(true);
    });

    it("should return false for non-existent mutations", () => {
      expect(updater.isPending("non-existent")).toBe(false);
    });

    it("should return false after confirmation", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      updater.confirmMutation(mutationId);

      expect(updater.isPending(mutationId)).toBe(false);
    });

    it("should return false after rollback", async () => {
      const mutationId = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:readme"
      );

      await updater.rollbackMutation(mutationId);

      expect(updater.isPending(mutationId)).toBe(false);
    });
  });

  describe("getPendingCount", () => {
    it("should return 0 initially", () => {
      expect(updater.getPendingCount()).toBe(0);
    });

    it("should increment with each pending mutation", async () => {
      await updater.applyOptimistically("grant", "user:alice", "read", "doc:1");
      expect(updater.getPendingCount()).toBe(1);

      await updater.applyOptimistically("grant", "user:bob", "write", "doc:2");
      expect(updater.getPendingCount()).toBe(2);

      await updater.applyOptimistically(
        "revoke",
        "user:charlie",
        "admin",
        "doc:3"
      );
      expect(updater.getPendingCount()).toBe(3);
    });

    it("should decrement on confirmation", async () => {
      const id1 = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:1"
      );
      const id2 = await updater.applyOptimistically(
        "grant",
        "user:bob",
        "write",
        "doc:2"
      );

      updater.confirmMutation(id1);
      expect(updater.getPendingCount()).toBe(1);

      updater.confirmMutation(id2);
      expect(updater.getPendingCount()).toBe(0);
    });

    it("should decrement on rollback", async () => {
      const id1 = await updater.applyOptimistically(
        "grant",
        "user:alice",
        "read",
        "doc:1"
      );
      const id2 = await updater.applyOptimistically(
        "grant",
        "user:bob",
        "write",
        "doc:2"
      );

      await updater.rollbackMutation(id1);
      expect(updater.getPendingCount()).toBe(1);

      await updater.rollbackMutation(id2);
      expect(updater.getPendingCount()).toBe(0);
    });
  });
});
