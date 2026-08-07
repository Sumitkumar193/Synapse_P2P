import { ILLMProvider } from './LLMInterface';
import { GeminiDirectProvider } from './providers/GeminiDirectProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { AntigravityProvider } from './providers/AntigravityProvider';

/**
 * Extensible Factory and Registry for AI LLM Providers.
 * Allows adding new providers dynamically by implementing ILLMProvider.
 */
export class LLMProviderFactory {
  private static registry = new Map<string, (config?: any) => ILLMProvider>();

  static {
    // Register default built-in LLM providers
    this.register('gemini-direct', (config) => new GeminiDirectProvider(config?.apiKey));
    this.register('openai', (config) => new OpenAIProvider(config?.apiKey, config?.baseUrl));
    this.register('ollama', (config) => new OllamaProvider(config));
    this.register('antigravity', () => new AntigravityProvider());
  }

  /**
   * Register a new LLM provider implementation.
   */
  public static register(id: string, factoryFn: (config?: any) => ILLMProvider): void {
    this.registry.set(id.toLowerCase(), factoryFn);
  }

  /**
   * Create an LLM Provider instance by ID.
   */
  public static create(id: string, config?: any): ILLMProvider {
    const factory = this.registry.get(id.toLowerCase());
    if (!factory) {
      throw new Error(`[LLMProviderFactory] LLM Provider '${id}' is not registered. Available: ${Array.from(this.registry.keys()).join(', ')}`);
    }
    return factory(config);
  }

  /**
   * Get all registered provider IDs.
   */
  public static getAvailableProviders(): string[] {
    return Array.from(this.registry.keys());
  }
}
