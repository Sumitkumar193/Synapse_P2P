/**
 * Lightweight, strongly-typed Service Container for Dependency Injection.
 * Maps interface/token names to service instances without external decorator dependencies.
 */
export class ServiceContainer {
  private static instance: ServiceContainer;
  private services = new Map<string, any>();

  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  /**
   * Register a service instance under a token string.
   */
  public register<T>(token: string, instance: T): void {
    this.services.set(token, instance);
  }

  /**
   * Resolve a registered service instance by token string.
   * Throws an error if the service has not been registered.
   */
  public resolve<T>(token: string): T {
    if (!this.services.has(token)) {
      throw new Error(`[ServiceContainer] Service not registered for token: '${token}'`);
    }
    return this.services.get(token) as T;
  }

  /**
   * Check whether a service token has been registered.
   */
  public has(token: string): boolean {
    return this.services.has(token);
  }

  /**
   * Unregister a service token.
   */
  public unregister(token: string): void {
    this.services.delete(token);
  }

  /**
   * Clear all registered services.
   */
  public clear(): void {
    this.services.clear();
  }
}

export const container = ServiceContainer.getInstance();
