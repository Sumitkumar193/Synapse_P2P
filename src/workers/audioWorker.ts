import { RealtimeBus } from '../realtime/RealtimeBus';
import { RingBuffer } from '../realtime/RingBuffer';
import { ITranscriptionProvider, createTranscriptionProvider } from '../agent/transcription';
import { WhisperProviderConfig } from '../agent/transcription/WhisperTranscriptionProvider';

export class AudioWorkerController {
  public readonly realtimeBus: RealtimeBus;
  public readonly ringBuffer: RingBuffer;
  public readonly transcriptionProvider: ITranscriptionProvider;
  private isProcessing = false;

  constructor(sessionToken?: string, providerType?: 'local' | 'openai', whisperConfig?: WhisperProviderConfig) {
    this.realtimeBus = new RealtimeBus(sessionToken);
    this.ringBuffer = new RingBuffer(1024 * 1024); // 1MB PCM ring buffer
    this.transcriptionProvider = createTranscriptionProvider(providerType, whisperConfig);
    this.transcriptionProvider.start().catch(console.error);

    // Forward transcript events to RealtimeBus /transcript channel
    this.transcriptionProvider.onTranscript((evt) => {
      if (this.realtimeBus.isActive()) {
        this.realtimeBus.broadcast('/transcript', evt);
      }
    });
  }


  public async initialize(port: number = 0): Promise<{ port: number; token: string }> {
    const activePort = await this.realtimeBus.start(port);
    const token = this.realtimeBus.getToken();
    return { port: activePort, token };
  }

  /**
   * Process raw incoming audio chunk, convert/chunk to 16kHz 16-bit mono PCM,
   * push to RingBuffer, broadcast to /audio WS subscribers, and feed to Whisper STT.
   */
  public processAudioChunk(rawPcmData: Buffer | Uint8Array, speaker: 'local' | 'remote' = 'local'): void {
    const chunk = Buffer.isBuffer(rawPcmData) ? rawPcmData : Buffer.from(rawPcmData);
    
    // Store in PCM ring buffer (drop oldest on backpressure)
    this.ringBuffer.write(chunk);

    // Broadcast to RealtimeBus /audio channel
    if (this.realtimeBus.isActive()) {
      this.realtimeBus.broadcast('/audio', chunk);
    }

    // Feed chunk to Whisper STT Engine
    this.transcriptionProvider.transcribeChunk(chunk, speaker).catch((err) => {
      console.error('[AudioWorker] Error in transcription chunk:', err);
    });
  }


  /**
   * Tap an async iterator (such as session.media.audio()) and stream audio continuously.
   */
  public async tapAudioIterator(asyncIterator: AsyncIterableIterator<any>): Promise<void> {
    this.isProcessing = true;
    try {
      for await (const audioChunk of asyncIterator) {
        if (!this.isProcessing) break;
        if (audioChunk) {
          const buffer = Buffer.isBuffer(audioChunk)
            ? audioChunk
            : audioChunk.data
            ? Buffer.from(audioChunk.data)
            : Buffer.from(audioChunk);
          this.processAudioChunk(buffer);
        }
      }
    } catch (err) {
      console.error('[AudioWorker] Error processing audio iterator:', err);
    }
  }

  public stop(): void {
    this.isProcessing = false;
    this.ringBuffer.clear();
    this.realtimeBus.stop().catch(console.error);
  }
}

// Electron utilityProcess execution entry point
if (typeof process !== 'undefined' && process.send) {
  const token = process.env.REALTIME_SESSION_TOKEN;
  const worker = new AudioWorkerController(token);

  worker.initialize(0).then(({ port, token }) => {
    if (process.send) {
      process.send({ type: 'audio-worker-ready', port, token });
    }
  }).catch((err) => {
    console.error('[AudioWorker] Startup failed:', err);
    process.exit(1);
  });

  process.on('message', (msg: any) => {
    if (msg && msg.type === 'audio-chunk' && msg.data) {
      worker.processAudioChunk(Buffer.from(msg.data));
    } else if (msg && msg.type === 'stop') {
      worker.stop();
      process.exit(0);
    }
  });
}
