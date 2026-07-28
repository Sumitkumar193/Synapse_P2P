type EventHandler = (...args: any[]) => void;

export class TypedEventEmitter<EventMap extends Record<string, any>> {
  private listeners: Map<keyof EventMap, Set<EventHandler>> = new Map();

  public on<K extends keyof EventMap>(event: K, handler: EventMap[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler);
  }

  public off<K extends keyof EventMap>(event: K, handler: EventMap[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(...args);
        } catch (err) {
          console.error(`Error in event listener for event '${String(event)}':`, err);
        }
      });
    }
  }

  public removeAllListeners(event?: keyof EventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
