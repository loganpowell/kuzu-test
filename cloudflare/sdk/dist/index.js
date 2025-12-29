var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AuthClient: () => AuthClient
});
module.exports = __toCommonJS(index_exports);
var AuthClient = class {
  config;
  constructor(config) {
    this.config = {
      workerUrl: config.workerUrl.replace(/\/$/, ""),
      // Remove trailing slash
      apiKey: config.apiKey || "",
      timeout: config.timeout || 3e4,
      retries: config.retries || 3
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
  async check(request) {
    const response = await this.request("check", "GET", {
      params: {
        user: request.user,
        permission: request.permission,
        resource: request.resource
      }
    });
    return response.allowed;
  }
  /**
   * Check permission and get full response with metadata
   */
  async checkWithMetadata(request) {
    return this.request("check", "GET", {
      params: {
        user: request.user,
        permission: request.permission,
        resource: request.resource
      }
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
  async grant(request) {
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
  async revoke(request) {
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
  async listPermissions(request) {
    const params = {};
    if (request.user) params.user = request.user;
    if (request.resource) params.resource = request.resource;
    const response = await this.request("list", "GET", { params });
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
  async bulk(operations) {
    const response = await this.request("bulk", "POST", {
      body: { operations }
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
  async stats() {
    return this.request("stats", "GET");
  }
  /**
   * Check health of the service
   */
  async health() {
    return this.request("health", "GET");
  }
  /**
   * Internal request method with retry logic
   */
  async request(endpoint, method, options) {
    let lastError = null;
    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        const url = new URL(`${this.config.workerUrl}/${endpoint}`);
        if (options == null ? void 0 : options.params) {
          Object.entries(options.params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
          });
        }
        const headers = {
          "Content-Type": "application/json"
        };
        if (this.config.apiKey) {
          headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        const response = await fetch(url.toString(), {
          method,
          headers,
          body: (options == null ? void 0 : options.body) ? JSON.stringify(options.body) : void 0,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(`Request failed: ${response.status} ${JSON.stringify(error)}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        if (lastError.message.includes("400") || lastError.message.includes("404")) {
          throw lastError;
        }
        if (attempt < this.config.retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1e3));
        }
      }
    }
    throw lastError || new Error("Request failed after retries");
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AuthClient
});
