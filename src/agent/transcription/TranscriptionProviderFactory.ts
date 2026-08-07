import { ITranscriptionProvider } from './TranscriptionProvider';
import { OpenAIAudioTranscriptionProvider } from './OpenAIAudioTranscriptionProvider';
import { WhisperTranscriptionProvider } from './WhisperTranscriptionProvider';
import { GroqAudioTranscriptionProvider } from './GroqAudioTranscriptionProvider';

/**
 * Extensible Factory and Registry for Speech-to-Text Transcription Engines.
 * Allows adding new STT providers (e.g. Deepgram, AssemblyAI, Groq) by implementing ITranscriptionProvider.
 */
export class TranscriptionProviderFactory {
  private static registry = new Map<string, (config?: any) => ITranscriptionProvider>();

  static {
    // Register default built-in STT providers
    this.register('openai-cloud', (config) => new OpenAIAudioTranscriptionProvider(config));
    this.register('groq-cloud', (config) => new GroqAudioTranscriptionProvider(config));
    this.register('local-whisper', (config) => new WhisperTranscriptionProvider(config));
  }

  /**
   * Register a new Speech-to-Text provider implementation.
   */
  public static register(id: string, factoryFn: (config?: any) => ITranscriptionProvider): void {
    this.registry.set(id.toLowerCase(), factoryFn);
  }

  /**
   * Create a Transcription Provider instance by ID.
   */
  public static create(id: string, config?: any): ITranscriptionProvider {
    const factory = this.registry.get(id.toLowerCase());
    if (!factory) {
      throw new Error(`[TranscriptionProviderFactory] STT Provider '${id}' is not registered. Available: ${Array.from(this.registry.keys()).join(', ')}`);
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
