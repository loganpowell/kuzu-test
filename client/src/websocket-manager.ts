/**
 * WebSocket connection manager for real-time permission sync
 * Handles connection lifecycle, idle timeout, reconnection, and catch-up sync
 */

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface MutationMessage {
  type: "mutation";
  version: number;
  mutation: {
    type: "grant" | "revoke";
    user: string;
    permission?: string;
    resource: string;
    granted_at?: string;
    granted_by?: string;
  };
}

export interface PingMessage {
  type: "ping";
}

export interface PongMessage {
  type: "pong";
}

export interface VersionMessage {
  type: "version";
  version: number;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface MutationRequestMessage {
  type: "mutate";
  operation: "grant" | "revoke";
  user: string;
  permission: string;
  resource: string;
}

export interface MutationAckMessage {
  type: "ack";
  success: boolean;
  version?: number;
  error?: string;
}

export type WebSocketMessage =
  | MutationMessage
  | PingMessage
  | PongMessage
  | VersionMessage
  | ErrorMessage
  | MutationRequestMessage
  | MutationAckMessage;

export interface WebSocketManagerOptions {
  serverUrl: string;
  orgId: string;
  onMutation?: (mutation: MutationMessage) => void;
  onStateChange?: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
  heartbeatInterval?: number; // Default: 30s
  reconnectMaxDelay?: number; // Default: 30s
  idleTimeout?: number; // Default: 5 minutes (matches server)
}

/**
 * Manages WebSocket connection with smart idle timeout and reconnection
 */
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private options: Required<WebSocketManagerOptions>;
  private lastKnownVersion: number = 0;
  private heartbeatTimer?: number;
  private reconnectTimer?: number;
  private reconnectDelay: number = 1000; // Start at 1s, exponential backoff
  private lastActivityTime: number = Date.now();
  private missedPongs: number = 0;
  private maxMissedPongs: number = 2;

  constructor(options: WebSocketManagerOptions) {
    this.options = {
      ...options,
      heartbeatInterval: options.heartbeatInterval ?? 30000, // 30s
      reconnectMaxDelay: options.reconnectMaxDelay ?? 30000, // 30s
      idleTimeout: options.idleTimeout ?? 5 * 60 * 1000, // 5 minutes
      onMutation: options.onMutation ?? (() => {}),
      onStateChange: options.onStateChange ?? (() => {}),
      onError: options.onError ?? (() => {}),
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(initialVersion: number = 0): Promise<void> {
    if (this.state === "connected" || this.state === "connecting") {
      console.log("[WebSocketManager] Already connected/connecting");
      return;
    }

    this.lastKnownVersion = initialVersion;
    this.setState("connecting");

    try {
      // Convert HTTP URL to WebSocket URL
      const wsUrl = this.options.serverUrl
        .replace("http://", "ws://")
        .replace("https://", "wss://");

      // Construct WebSocket URL for Durable Object
      const url = `${wsUrl}/org/${this.options.orgId}/ws`;

      console.log(`[WebSocketManager] Connecting to ${url}...`);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onclose = (event) => this.handleClose(event);
      this.ws.onerror = (event) => this.handleError(event);
    } catch (error) {
      console.error("[WebSocketManager] Connection failed:", error);
      this.setState("error");
      this.options.onError(
        error instanceof Error ? error : new Error("Connection failed")
      );
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    this.setState("disconnected");
  }

  /**
   * Send version to server for tracking
   */
  updateVersion(version: number): void {
    this.lastKnownVersion = version;

    if (this.state === "connected" && this.ws) {
      this.send({ type: "version", version });
    }
  }

  /**
   * Mark activity (resets idle timeout on server)
   */
  markActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get last known version
   */
  getLastKnownVersion(): number {
    return this.lastKnownVersion;
  }

  /**
   * Send mutation request to server
   */
  async sendMutation(
    operation: "grant" | "revoke",
    user: string,
    permission: string,
    resource: string
  ): Promise<{ success: boolean; version?: number; error?: string }> {
    if (this.state !== "connected" || !this.ws) {
      throw new Error("WebSocket not connected");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Mutation request timeout"));
      }, 10000); // 10s timeout

      // Create one-time handler for ack
      const ackHandler = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          if (message.type === "ack") {
            clearTimeout(timeout);
            this.ws!.removeEventListener("message", ackHandler);
            resolve({
              success: message.success,
              version: message.version,
              error: message.error,
            });
          }
        } catch (error) {
          // Ignore parse errors, let normal handler deal with them
        }
      };

      this.ws!.addEventListener("message", ackHandler);

      // Send mutation request
      this.send({
        type: "mutate",
        operation,
        user,
        permission,
        resource,
      });
    });
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {
    console.log("[WebSocketManager] Connected");
    this.setState("connected");
    this.reconnectDelay = 1000; // Reset backoff
    this.missedPongs = 0;

    // Send initial version
    this.updateVersion(this.lastKnownVersion);

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    this.markActivity();

    try {
      const message = JSON.parse(event.data) as WebSocketMessage;

      switch (message.type) {
        case "ack":
          // Acknowledgment from server for mutation request
          console.log("[WebSocketManager] Mutation acknowledged:", message);
          break;

        case "mutation":
          console.log(
            `[WebSocketManager] Received mutation v${message.version}:`,
            message.mutation.type
          );
          this.lastKnownVersion = message.version;
          this.options.onMutation(message);
          break;

        case "pong":
          // Reset missed pongs counter
          this.missedPongs = 0;
          break;

        case "error":
          console.error("[WebSocketManager] Server error:", message.message);
          this.options.onError(new Error(message.message));
          break;

        default:
          console.warn("[WebSocketManager] Unknown message type:", message);
      }
    } catch (error) {
      console.error("[WebSocketManager] Failed to parse message:", error);
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    console.log(
      `[WebSocketManager] Disconnected: code=${event.code}, reason=${event.reason}`
    );

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    this.ws = null;

    // If not a clean close, schedule reconnect
    if (event.code !== 1000) {
      this.setState("reconnecting");
      this.scheduleReconnect();
    } else {
      this.setState("disconnected");
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(event: Event): void {
    console.error("[WebSocketManager] WebSocket error:", event);
    this.setState("error");
    this.options.onError(new Error("WebSocket error"));
  }

  /**
   * Start heartbeat/ping-pong protocol
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.state !== "connected" || !this.ws) {
        return;
      }

      // Check if we've missed too many pongs
      if (this.missedPongs >= this.maxMissedPongs) {
        console.warn(
          "[WebSocketManager] Missed too many pongs, reconnecting..."
        );
        this.ws.close(1001, "Heartbeat timeout");
        return;
      }

      // Send ping
      this.missedPongs++;
      this.send({ type: "ping" });
    }, this.options.heartbeatInterval) as unknown as number;
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(this.reconnectDelay, this.options.reconnectMaxDelay);
    console.log(`[WebSocketManager] Reconnecting in ${delay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnect();
    }, delay) as unknown as number;

    // Exponential backoff: 1s → 2s → 4s → 8s → ... → 30s max
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.options.reconnectMaxDelay
    );
  }

  /**
   * Reconnect with catch-up sync
   */
  private async reconnect(): Promise<void> {
    console.log(
      `[WebSocketManager] Reconnecting (last version: ${this.lastKnownVersion})...`
    );

    try {
      // Perform catch-up sync before reconnecting WebSocket
      await this.catchUpSync();

      // Reconnect WebSocket
      await this.connect(this.lastKnownVersion);
    } catch (error) {
      console.error("[WebSocketManager] Reconnect failed:", error);
      this.options.onError(
        error instanceof Error ? error : new Error("Reconnect failed")
      );
      this.scheduleReconnect();
    }
  }

  /**
   * Fetch missed mutations from /changes endpoint
   */
  private async catchUpSync(): Promise<void> {
    const url = `${this.options.serverUrl}/org/${this.options.orgId}/changes?since=${this.lastKnownVersion}`;

    console.log(`[WebSocketManager] Fetching missed changes: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Catch-up sync failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.fullSyncRequired) {
      console.warn(
        "[WebSocketManager] Full sync required (version gap too large)"
      );
      // Trigger full resync via callback
      this.options.onError(
        new Error("Full sync required - version gap too large")
      );
      return;
    }

    console.log(
      `[WebSocketManager] Applying ${
        data.changes?.length || 0
      } missed mutations`
    );

    // Apply missed mutations
    for (const change of data.changes || []) {
      const mutationMessage: MutationMessage = {
        type: "mutation",
        version: change.version,
        mutation: change.data,
      };
      this.options.onMutation(mutationMessage);
    }

    this.lastKnownVersion = data.currentVersion;
    console.log(
      `[WebSocketManager] Caught up to version ${this.lastKnownVersion}`
    );
  }

  /**
   * Send message to server
   */
  private send(message: WebSocketMessage): void {
    if (!this.ws || this.state !== "connected") {
      console.warn("[WebSocketManager] Cannot send, not connected");
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error("[WebSocketManager] Failed to send message:", error);
    }
  }

  /**
   * Update connection state and notify listeners
   */
  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    console.log(`[WebSocketManager] State: ${oldState} → ${newState}`);
    this.options.onStateChange(newState);
  }
}
