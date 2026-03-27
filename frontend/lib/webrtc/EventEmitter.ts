// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener<T extends any[]> = (...args: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventEmitter<Events extends Record<string, any[]>> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(listener);
    
    // Return an unsubscribe function
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>) {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]) {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
    }
  }

  removeAllListeners() {
    this.listeners = {};
  }
}
