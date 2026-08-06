export interface EventMap {
  'participant_joined': { peerId: string; roomId: string; isHost: boolean; timestamp: number };
  'participant_left': { peerId: string; roomId: string; timestamp: number };
  'transcript.partial': { text: string; speaker: 'local' | 'remote'; timestamp: number };
  'transcript.final': { text: string; speaker: 'local' | 'remote'; start?: number; end?: number; timestamp: number };
  'screen_started': { streamId: string; sourceId?: string; timestamp: number };
  'screen_stopped': { streamId?: string; timestamp: number };
  'chat_received': { id: string; sender: string; text: string; timestamp: number; isAi?: boolean };
  'tool_executed': { toolName: string; args: any; result: any; timestamp: number };
  'tool_pending_approval': { id: string; toolName: string; args: any; requestedBy: string; timestamp: number };
  'tool_approved': { approvalId: string; toolName: string; approvedBy?: string; result?: any; timestamp?: number };
  'tool_dismissed': { approvalId: string; toolName: string; dismissedBy?: string; timestamp?: number };
  'closed_caption': { text: string; speaker: string; isFinal: boolean; timestamp: number };
  'cc.chat.local': { text: string; tag: string; timestamp: number };
  'cc.chat.remote': { text: string; tag: string; timestamp: number };
  'transcript.pause': { timestamp: number };
}





export type EventHandler<T = any> = (payload: T) => void | Promise<void>;

/**
 * Strongly-typed Centralized Event Bus supporting synchronous & asynchronous Pub/Sub subscribers.
 */
export class EventBus {
  private static instance: EventBus;
  private listeners = new Map<keyof EventMap, Set<EventHandler>>();

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to a strongly typed event channel.
   */
  public on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlers = this.listeners.get(event)!;
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
    };
  }

  /**
   * Subscribe to an event channel once.
   */
  public once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      handler(payload);
    });
  }

  /**
   * Publish a strongly typed event payload to all subscribed listeners.
   */
  public emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    for (const handler of Array.from(handlers)) {
      try {
        const result = handler(payload);
        if (result && typeof (result as any).catch === 'function') {
          (result as any).catch((err: any) => {
            console.error(`[EventBus] Unhandled async error in listener for '${String(event)}':`, err);
          });
        }
      } catch (err) {
        console.error(`[EventBus] Error in listener for '${String(event)}':`, err);
      }
    }
  }

  /**
   * Clear all subscribers for a given event or all events.
   */
  public clear(event?: keyof EventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const eventBus = EventBus.getInstance();
