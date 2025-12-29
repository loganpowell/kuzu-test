/**
 * TypeScript SDK for Kuzu Auth
 *
 * Simple, type-safe client for interacting with the Cloudflare-based
 * Zanzibar-inspired authorization system.
 */
interface AuthClientConfig {
    workerUrl: string;
    apiKey?: string;
    timeout?: number;
    retries?: number;
}
interface CheckPermissionRequest {
    user: string;
    permission: string;
    resource: string;
}
interface CheckPermissionResponse {
    allowed: boolean;
    user: string;
    permission: string;
    resource: string;
    latency_ms: number;
}
interface GrantPermissionRequest {
    user: string;
    permission: string;
    resource: string;
}
interface RevokePermissionRequest {
    user: string;
    permission: string;
    resource: string;
}
interface ListPermissionsRequest {
    user?: string;
    resource?: string;
}
interface Permission {
    user?: string;
    resource?: string;
    permission: string;
}
interface Stats {
    users: number;
    resources: number;
    permissions: number;
    recordCount: number;
    lastBackup: number;
}
interface BulkOperation {
    action: 'grant' | 'revoke' | 'check';
    user: string;
    permission: string;
    resource: string;
}
declare class AuthClient {
    private config;
    constructor(config: AuthClientConfig);
    /**
     * Check if a user has a specific permission on a resource
     *
     * @example
     * const allowed = await client.check({
     *   user: 'user:alice',
     *   permission: 'read',
     *   resource: 'resource:doc123'
     * });
     */
    check(request: CheckPermissionRequest): Promise<boolean>;
    /**
     * Check permission and get full response with metadata
     */
    checkWithMetadata(request: CheckPermissionRequest): Promise<CheckPermissionResponse>;
    /**
     * Grant a permission to a user on a resource
     *
     * @example
     * await client.grant({
     *   user: 'user:alice',
     *   permission: 'write',
     *   resource: 'resource:doc123'
     * });
     */
    grant(request: GrantPermissionRequest): Promise<void>;
    /**
     * Revoke a permission from a user on a resource
     *
     * @example
     * await client.revoke({
     *   user: 'user:alice',
     *   permission: 'write',
     *   resource: 'resource:doc123'
     * });
     */
    revoke(request: RevokePermissionRequest): Promise<void>;
    /**
     * List all permissions for a user or resource
     *
     * @example
     * // List all permissions for a user
     * const userPerms = await client.listPermissions({ user: 'user:alice' });
     *
     * // List all users with permissions on a resource
     * const resourcePerms = await client.listPermissions({ resource: 'resource:doc123' });
     */
    listPermissions(request: ListPermissionsRequest): Promise<Permission[]>;
    /**
     * Perform multiple operations in a single request
     *
     * @example
     * const results = await client.bulk({
     *   operations: [
     *     { action: 'grant', user: 'user:alice', permission: 'read', resource: 'resource:doc1' },
     *     { action: 'grant', user: 'user:alice', permission: 'write', resource: 'resource:doc2' },
     *     { action: 'check', user: 'user:bob', permission: 'read', resource: 'resource:doc1' },
     *   ]
     * });
     */
    bulk(operations: BulkOperation[]): Promise<any[]>;
    /**
     * Get statistics about the authorization graph
     *
     * @example
     * const stats = await client.stats();
     * console.log(`Users: ${stats.users}, Resources: ${stats.resources}`);
     */
    stats(): Promise<Stats>;
    /**
     * Check health of the service
     */
    health(): Promise<{
        status: string;
        environment: string;
    }>;
    /**
     * Internal request method with retry logic
     */
    private request;
}

export { AuthClient, type AuthClientConfig, type BulkOperation, type CheckPermissionRequest, type CheckPermissionResponse, type GrantPermissionRequest, type ListPermissionsRequest, type Permission, type RevokePermissionRequest, type Stats };
