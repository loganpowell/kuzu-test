/**
 * Optimistic Update Manager
 *
 * Applies mutations locally before server confirms, tracks pending state,
 * and handles rollback on rejection.
 */

export interface PendingMutation {
  id: string;
  type: "grant" | "revoke";
  userId: string;
  capability: string;
  resourceId: string;
  timestamp: number;
}

/**
 * Manages optimistic updates for authorization mutations
 *
 * Applies mutations locally immediately for instant UI updates,
 * then validates with server. Rolls back on rejection.
 */
export class OptimisticUpdater {
  private pendingMutations = new Map<string, PendingMutation>();

  constructor(
    private client: any, // KuzuAuthClient instance
    private onRollback?: (mutationId: string, error: Error) => void
  ) {}

  /**
   * Apply mutation optimistically (before server confirms)
   */
  async applyOptimistically(
    type: "grant" | "revoke",
    userId: string,
    capability: string,
    resourceId: string
  ): Promise<string> {
    const mutationId = `${type}-${userId}-${capability}-${resourceId}-${Date.now()}`;

    // Track pending mutation
    this.pendingMutations.set(mutationId, {
      id: mutationId,
      type,
      userId,
      capability,
      resourceId,
      timestamp: Date.now(),
    });

    // Apply mutation locally first
    if (type === "grant") {
      await this.client.grantPermission(userId, capability, resourceId);
    } else {
      await this.client.revokePermission(userId, capability, resourceId);
    }

    return mutationId;
  }

  /**
   * Confirm mutation when server responds with success
   */
  confirmMutation(mutationId: string): void {
    this.pendingMutations.delete(mutationId);
  }

  /**
   * Rollback mutation if server rejects
   */
  async rollbackMutation(mutationId: string): Promise<void> {
    const mutation = this.pendingMutations.get(mutationId);
    if (!mutation) return;

    try {
      if (mutation.type === "grant") {
        // Undo grant by revoking locally
        await this.client.revokePermission(
          mutation.userId,
          mutation.capability,
          mutation.resourceId
        );
      } else {
        // Undo revoke by re-granting
        await this.client.grantPermission(
          mutation.userId,
          mutation.capability,
          mutation.resourceId
        );
      }

      this.pendingMutations.delete(mutationId);

      // Clear caches after rollback
      this.client.queryCache.clear();
      this.client.resourceCache.clear();

      if (this.onRollback) {
        this.onRollback(mutationId, new Error("Server rejected mutation"));
      }
    } catch (error) {
      console.error(
        `[OptimisticUpdater] Rollback failed for ${mutationId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get pending mutations count
   */
  getPendingCount(): number {
    return this.pendingMutations.size;
  }

  /**
   * Get all pending mutations
   */
  getPendingMutations(): PendingMutation[] {
    return Array.from(this.pendingMutations.values());
  }

  /**
   * Check if a specific mutation is pending
   */
  isPending(mutationId: string): boolean {
    return this.pendingMutations.has(mutationId);
  }
}
