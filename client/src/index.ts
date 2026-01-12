/**
 * @kuzu-auth/client - Browser SDK for KuzuDB WASM authorization
 *
 * Provides <1ms client-side authorization checks with server-side validation.
 *
 * @example
 * ```typescript
 * import { KuzuAuthClient } from '@kuzu-auth/client';
 *
 * const client = new KuzuAuthClient('https://auth.example.com', 'org-123');
 * await client.initialize();
 *
 * // Check permissions (cached, <0.1ms)
 * const canRead = await client.can('user:alice', 'read', 'doc:readme');
 *
 * // Grant permission (optimistic update)
 * await client.grant('user:bob', 'write', 'doc:api');
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { KuzuAuthClient } from "./client";

// WebSocket manager for real-time sync
export { WebSocketManager } from "./websocket-manager";
export type {
  WebSocketManagerOptions,
  ConnectionState,
  MutationMessage,
  MutationAckMessage,
  PingMessage,
  PongMessage,
  ErrorMessage,
  WebSocketMessage,
} from "./websocket-manager";

// Query cache for performance
export { QueryCache } from "./query-cache";

// Optimistic updates
export { OptimisticUpdater } from "./optimistic-updater";
export type { PendingMutation } from "./optimistic-updater";

// Client options type
export interface KuzuAuthClientOptions {
  useMultiThreadedCDN?: boolean;
  enableOptimisticUpdates?: boolean;
}
