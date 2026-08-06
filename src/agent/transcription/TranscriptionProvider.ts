export interface TranscriptEventPayload {
  text: string;
  speaker: 'local' | 'remote';
  start?: number;
  end?: number;
  isFinal: boolean;
  timestamp: number;
}

export type TranscriptCallback = (event: TranscriptEventPayload) => void;

/**
 * Decoupled Interface for Speech-to-Text Transcription Engines.
 */
export interface ITranscriptionProvider {
  /**
   * Start the transcription engine.
   */
  start(): Promise<void>;

  /**
   * Feed a chunk of 16kHz 16-bit mono PCM audio for transcription.
   */
  transcribeChunk(pcmBuffer: Buffer, speaker?: 'local' | 'remote'): Promise<TranscriptEventPayload | null>;

  /**
   * Stop the transcription engine cleanly.
   */
  stop(): Promise<void>;

  /**
   * Subscribe to transcript events.
   */
  onTranscript(callback: TranscriptCallback): () => void;
}
