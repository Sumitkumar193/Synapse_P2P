import { OpenAIAudioTranscriptionProvider, OpenAIAudioProviderConfig } from './OpenAIAudioTranscriptionProvider';

/**
 * Ultra-fast Groq Cloud Whisper STT Provider (Sub-100ms LPU acceleration).
 * Fully modular implementation extending ITranscriptionProvider.
 */
export class GroqAudioTranscriptionProvider extends OpenAIAudioTranscriptionProvider {
  constructor(config: Partial<OpenAIAudioProviderConfig> = {}) {
    super({
      ...config,
      apiKey: config.apiKey || process.env.GROQ_API_KEY,
      baseUrl: 'https://api.groq.com/openai/v1',
      model: config.model || 'whisper-large-v3',
    });
  }
}
