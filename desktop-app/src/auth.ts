/**
 * Auth Service Client for Desktop App
 * 
 * Handles authentication and authorization with the cf-auth backend
 */

export interface User {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  displayName: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Permission {
  name: string;
  granted: boolean;
}

export class AuthClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(baseUrl: string = 'http://localhost:8787') {
    this.baseUrl = baseUrl;
    this.loadTokens();
  }

  /**
   * Save tokens to localStorage
   */
  private saveTokens(tokens: AuthTokens): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    
    localStorage.setItem('access_token', tokens.accessToken);
    localStorage.setItem('refresh_token', tokens.refreshToken);
    localStorage.setItem('expires_at', String(Date.now() + tokens.expiresIn * 1000));
  }

  /**
   * Load tokens from localStorage
   */
  private loadTokens(): void {
    this.accessToken = localStorage.getItem('access_token');
    this.refreshToken = localStorage.getItem('refresh_token');
  }

  /**
   * Clear tokens from memory and storage
   */
  private clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('expires_at');
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(): boolean {
    const expiresAt = localStorage.getItem('expires_at');
    if (!expiresAt) return true;
    return Date.now() >= parseInt(expiresAt);
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'Unknown error',
        message: response.statusText,
      }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<{ user: User }> {
    const result = await this.request<{ user: User }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result;
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<{ user: User; tokens: AuthTokens }> {
    const result = await this.request<{ user: User; tokens: AuthTokens }>(
      '/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      }
    );
    
    this.saveTokens(result.tokens);
    return result;
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      await this.request('/v1/auth/logout', {
        method: 'POST',
      });
    } finally {
      this.clearTokens();
    }
  }

  /**
   * Get current user
   */
  async getMe(): Promise<{ user: User }> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }

    return this.request('/v1/auth/me');
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const result = await this.request<{ tokens: AuthTokens }>('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });

    this.saveTokens(result.tokens);
  }

  /**
   * Get user permissions
   */
  async getUserPermissions(userId: string): Promise<{ permissions: Permission[] }> {
    return this.request(`/v1/users/${userId}/permissions`);
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(permissionName: string): Promise<boolean> {
    try {
      const { user } = await this.getMe();
      const { permissions } = await this.getUserPermissions(user.id);
      return permissions.some(p => p.name === permissionName && p.granted);
    } catch {
      return false;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken && !this.isTokenExpired();
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request('/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  /**
   * Request password reset
   */
  async forgotPassword(email: string): Promise<void> {
    await this.request('/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.request('/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    await this.request('/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }
}

// Create singleton instance
export const authClient = new AuthClient();
