/**
 * TypeScript SDK for Kuzu Auth
 *
 * Simple, type-safe client for interacting with the Cloudflare-based
 * Zanzibar-inspired authorization system.
 */

export interface AuthClientConfig {
  workerUrl: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
}

export interface CheckPermissionRequest {
  user: string;
  permission: string;
  resource: string;
}

export interface CheckPermissionResponse {
  allowed: boolean;
  user: string;
  permission: string;
  resource: string;
  latency_ms: number;
}

export interface GrantPermissionRequest {
  user: string;
  permission: string;
  resource: string;
}

export interface RevokePermissionRequest {
  user: string;
  permission: string;
  resource: string;
}

export interface ListPermissionsRequest {
  user?: string;
  resource?: string;
}

export interface Permission {
  user?: string;
  resource?: string;
  permission: string;
}

export interface Stats {
  users: number;
  resources: number;
  permissions: number;
  recordCount: number;
  lastBackup: number;
}

export interface BulkOperation {
  action: "grant" | "revoke" | "check";
  user: string;
  permission: string;
  resource: string;
}

export class AuthClient {
  private config: Required<AuthClientConfig>;

  constructor(config: AuthClientConfig) {
    this.config = {
      workerUrl: config.workerUrl.replace(/\/$/, ""), // Remove trailing slash
      apiKey: config.apiKey || "",
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
    };
  }

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
  async check(request: CheckPermissionRequest): Promise<boolean> {
    const response = await this.request<CheckPermissionResponse>(
      "check",
      "GET",
      {
        params: {
          user: request.user,
          permission: request.permission,
          resource: request.resource,
        },
      }
    );
    return response.allowed;
  }

  /**
   * Check permission and get full response with metadata
   */
  async checkWithMetadata(
    request: CheckPermissionRequest
  ): Promise<CheckPermissionResponse> {
    return this.request<CheckPermissionResponse>("check", "GET", {
      params: {
        user: request.user,
        permission: request.permission,
        resource: request.resource,
      },
    });
  }

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
  async grant(request: GrantPermissionRequest): Promise<void> {
    await this.request("grant", "POST", { body: request });
  }

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
  async revoke(request: RevokePermissionRequest): Promise<void> {
    await this.request("revoke", "POST", { body: request });
  }

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
  async listPermissions(
    request: ListPermissionsRequest
  ): Promise<Permission[]> {
    const params: any = {};
    if (request.user) params.user = request.user;
    if (request.resource) params.resource = request.resource;

    const response = await this.request<{ permissions: Permission[] }>(
      "list",
      "GET",
      { params }
    );
    return response.permissions;
  }

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
  async bulk(operations: BulkOperation[]): Promise<any[]> {
    const response = await this.request<{ results: any[] }>("bulk", "POST", {
      body: { operations },
    });
    return response.results;
  }

  /**
   * Get statistics about the authorization graph
   *
   * @example
   * const stats = await client.stats();
   * console.log(`Users: ${stats.users}, Resources: ${stats.resources}`);
   */
  async stats(): Promise<Stats> {
    return this.request<Stats>("stats", "GET");
  }

  /**
   * Check health of the service
   */
  async health(): Promise<{ status: string; environment: string }> {
    return this.request<{ status: string; environment: string }>(
      "health",
      "GET"
    );
  }

  /**
   * Internal request method with retry logic
   */
  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    options?: {
      params?: Record<string, string>;
      body?: any;
    }
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        const url = new URL(`${this.config.workerUrl}/${endpoint}`);

        // Add query params
        if (options?.params) {
          Object.entries(options.params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
          });
        }

        // Build request
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (this.config.apiKey) {
          headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout
        );

        const response = await fetch(url.toString(), {
          method,
          headers,
          body: options?.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          throw new Error(
            `Request failed: ${response.status} ${JSON.stringify(error)}`
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");

        // Don't retry on 4xx errors
        if (
          lastError.message.includes("400") ||
          lastError.message.includes("404")
        ) {
          throw lastError;
        }

        // Exponential backoff
        if (attempt < this.config.retries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          );
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }
}

// Re-export types
export * from "./types";
