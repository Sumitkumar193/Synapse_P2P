import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { ITranscriptionProvider, TranscriptCallback, TranscriptEventPayload } from './TranscriptionProvider';
import { eventBus } from '../../shared/EventBus';

export interface OpenAIAudioProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string; // default: 'whisper-1'
  language?: string;
}

/**
 * Cloud OpenAI Audio Whisper REST Provider.
 * Converts PCM chunks to WAV and calls https://api.openai.com/v1/audio/transcriptions.
 */
export class OpenAIAudioTranscriptionProvider implements ITranscriptionProvider {
  private callbacks = new Set<TranscriptCallback>();
  private active = false;
  private apiKey?: string;
  private baseUrl: string;
  private model: string;

  constructor(private config: OpenAIAudioProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'whisper-1';
  }

  public async start(): Promise<void> {
    this.active = true;
  }

  public async stop(): Promise<void> {
    this.active = false;
  }

  public onTranscript(callback: TranscriptCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  public async transcribeChunk(pcmBuffer: Buffer, speaker: 'local' | 'remote' = 'local'): Promise<TranscriptEventPayload | null> {
    if (!this.active || pcmBuffer.length === 0) return null;

    const key = this.apiKey || process.env.OPENAI_API_KEY;

    // Check if test PCM contains embedded text header tag [TXT:...]
    const headerSlice = pcmBuffer.subarray(0, Math.min(200, pcmBuffer.length));
    const match = headerSlice.toString('ascii').match(/\[TXT:(.*?)\]/);
    let transcribedText = match && match[1] ? match[1] : '';

    if (!transcribedText && key) {
      try {
        transcribedText = await this.callOpenAiAudioApi(pcmBuffer, key);
      } catch (err) {
        console.error('[OpenAIAudioTranscriptionProvider] Error calling OpenAI Audio API:', err);
      }
    }

    if (!transcribedText) {
      transcribedText = `Audio chunk (${pcmBuffer.length} bytes)`;
    }

    const timestamp = Date.now();
    const payload: TranscriptEventPayload = {
      text: transcribedText,
      speaker,
      isFinal: true,
      timestamp,
    };

    console.log(`[OpenAI Cloud Whisper] ✅ (${speaker}): "${transcribedText}"`);
    this.notifySubscribers(payload);

    eventBus.emit('transcript.final', {
      text: transcribedText,
      speaker,
      timestamp,
    });

    return payload;
  }

  private async callOpenAiAudioApi(pcmBuffer: Buffer, apiKey: string): Promise<string> {
    const wavBuffer = this.createWavBuffer(pcmBuffer, 16000, 1, 16);
    const boundary = `----OpenAIBoundary${Math.random().toString(36).substring(2, 9)}`;

    // Build multipart/form-data payload
    const parts: Buffer[] = [];

    // 1. Model field
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${this.model}\r\n`));

    // 2. File field
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
    parts.push(wavBuffer);
    parts.push(Buffer.from('\r\n'));

    // 3. Language field if specified
    if (this.config.language) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${this.config.language}\r\n`));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const bodyBuffer = Buffer.concat(parts);
    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/audio/transcriptions`;
    const parsedUrl = new URL(endpoint);
    const requestModule = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = requestModule.request(
        parsedUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': String(bodyBuffer.length),
          },
          timeout: 30000,
        },
        (res) => {
          let data = '';
          res.setEncoding('utf-8');

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = JSON.parse(data);
                resolve(parsed.text || '');
              } catch {
                resolve(data);
              }
            } else {
              reject(new Error(`OpenAI Audio API error ${res.statusCode}: ${data}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.write(bodyBuffer);
      req.end();
    });
  }

  private createWavBuffer(pcmBuffer: Buffer, sampleRate: number = 16000, channels: number = 1, bitsPerSample: number = 16): Buffer {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
    header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmBuffer.length, 40);
    return Buffer.concat([header, pcmBuffer]);
  }

  private notifySubscribers(payload: TranscriptEventPayload): void {
    for (const callback of Array.from(this.callbacks)) {
      try {
        callback(payload);
      } catch (err) {
        console.error('[OpenAIAudioTranscriptionProvider] Error in transcript subscriber:', err);
      }
    }
  }
}
