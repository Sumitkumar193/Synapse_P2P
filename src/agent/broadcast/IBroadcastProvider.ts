export interface BroadcastMessagePayload {
  id?: string;
  text: string;
  sender: string;
  timestamp: number;
  kind?: 'text' | 'code' | 'file';
  metadata?: Record<string, any>;
}

export interface BroadcastResult {
  providerId: string;
  success: boolean;
  error?: string;
}

/**
 * Pluggable Broadcast Provider Interface for fan-out AI notification delivery.
 * Allows seamless registration of Telegram, WebSockets, Push Notifications, Webhooks, etc.
 */
export interface IBroadcastProvider {
  id: string;
  name: string;
  isEnabled(): boolean;
  broadcast(payload: BroadcastMessagePayload): Promise<BroadcastResult>;
}
