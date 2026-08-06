import { ITranscriptionProvider } from './TranscriptionProvider';
import { WhisperTranscriptionProvider, WhisperProviderConfig } from './WhisperTranscriptionProvider';
import { OpenAIAudioTranscriptionProvider } from './OpenAIAudioTranscriptionProvider';

export * from './TranscriptionProvider';
export * from './WhisperTranscriptionProvider';
export * from './OpenAIAudioTranscriptionProvider';

/**
 * Factory function creating ITranscriptionProvider based on WHISPER_PROVIDER env var.
 * WHISPER_PROVIDER='local' (default) => local whisper.cpp / whisper-cli C++ binary.
 * WHISPER_PROVIDER='openai'           => Cloud OpenAI Audio REST API.
 */
export function createTranscriptionProvider(providerType?: 'local' | 'openai', config?: WhisperProviderConfig): ITranscriptionProvider {
  const selected = providerType || (process.env.WHISPER_PROVIDER as any) || 'local';
  if (selected === 'openai') {
    return new OpenAIAudioTranscriptionProvider();
  }
  return new WhisperTranscriptionProvider(config);
}
