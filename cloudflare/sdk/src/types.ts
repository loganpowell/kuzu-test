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
