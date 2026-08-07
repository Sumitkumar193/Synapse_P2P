import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { ITranscriptionProvider, TranscriptCallback, TranscriptEventPayload } from './TranscriptionProvider';
import { eventBus } from '../../shared/EventBus';
import { prompts } from '../ai/promptManager';

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

  // VAD & speech accumulation buffer
  private speechChunks: Buffer[] = [];
  private speechLength = 0;
  private silenceSampleCount = 0;
  private noiseFloorRms = 40;
  private vadThreshold = 300;
  private lastVadLogTime = 0;

  // Utterance VAD Metrics
  private peakUtteranceRms = 0;
  private triggerUtteranceRms = 0;
  private utteranceNoiseFloor = 40;
  private utteranceThreshold = 300;

  constructor(private config: OpenAIAudioProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'whisper-1';
  }

  public async start(): Promise<void> {
    this.active = true;
    console.log(`[OpenAI Cloud Whisper] Started REST provider using model: ${this.model}`);
  }

  public async stop(): Promise<void> {
    this.active = false;
    this.speechChunks = [];
    this.speechLength = 0;
    this.silenceSampleCount = 0;
    this.peakUtteranceRms = 0;
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

    if (!key) {
      console.warn('[OpenAI Cloud Whisper] Missing OPENAI_API_KEY. Please set OPENAI_API_KEY in your .env or Settings panel.');
      return null;
    }

    // Voice Activity Detection (VAD) check via PCM RMS
    const rms = this.calculatePcmRms(pcmBuffer);
    const dynamicThreshold = Math.max(300, this.noiseFloorRms * 2.2);

    const now = Date.now();
    const isSpeech = rms >= dynamicThreshold;

    // Adaptively track continuous background noise floor (fan hum / mic hiss) ONLY during silence
    if (!isSpeech && rms < dynamicThreshold) {
      this.noiseFloorRms = Math.min(250, this.noiseFloorRms * 0.95 + rms * 0.05);
    }

    // Periodic VAD Diagnostic Log (every 3 seconds)
    if (now - this.lastVadLogTime >= 3000) {
      this.lastVadLogTime = now;
      console.log(
        `[VAD Diagnostic 📊] RMS: ${Math.round(rms)} | NoiseFloor: ${Math.round(this.noiseFloorRms)} | Threshold: ${Math.round(dynamicThreshold)} | Status: ${isSpeech ? '🗣️ SPEECH' : '🔇 SILENCE'}`
      );
    }

    if (isSpeech) {
      // Record VAD metrics when speech starts or peaks
      if (this.speechLength === 0) {
        this.triggerUtteranceRms = rms;
        this.utteranceNoiseFloor = this.noiseFloorRms;
        this.utteranceThreshold = dynamicThreshold;
        this.peakUtteranceRms = rms;
        console.log(
          `[VAD Diagnostic 🗣️ SPEECH DETECTED] Trigger RMS: ${Math.round(rms)} | NoiseFloor: ${Math.round(this.noiseFloorRms)} | Threshold: ${Math.round(dynamicThreshold)}`
        );
      } else {
        this.peakUtteranceRms = Math.max(this.peakUtteranceRms, rms);
      }

      // Audio speech detected - accumulate speech chunk
      this.speechChunks.push(pcmBuffer);
      this.speechLength += pcmBuffer.length;
      this.silenceSampleCount = 0;

      // Auto-flush when speech reaches 12.0 seconds (~384,000 bytes)
      if (this.speechLength >= 384000) {
        return this.flushAndTranscribe(key, speaker);
      }
      return null;
    } else {
      if (this.speechLength > 0) {
        this.silenceSampleCount++;
        // Wait for ~1.5s of continuous silence (3 consecutive silent chunks) so speaker finishes complete question/thought
        // Require at least 1.0s of continuous speech (>= 32,000 bytes) to prevent tiny mic pops / breath intakes from triggering STT
        if (this.silenceSampleCount >= 3 && this.speechLength >= 32000) {
          return this.flushAndTranscribe(key, speaker);
        } else if (this.silenceSampleCount >= 6) {
          // Discard tiny noise clicks (< 1.0s) after 3s of silence
          this.speechChunks = [];
          this.speechLength = 0;
          this.silenceSampleCount = 0;
          this.peakUtteranceRms = 0;
        }
      }
      return null;
    }
  }

  private async flushAndTranscribe(apiKey: string, speaker: 'local' | 'remote'): Promise<TranscriptEventPayload | null> {
    if (this.speechLength < 32000) {
      this.speechChunks = [];
      this.speechLength = 0;
      this.silenceSampleCount = 0;
      this.peakUtteranceRms = 0;
      return null;
    }

    const pcmToDecode = Buffer.concat(this.speechChunks, this.speechLength);
    this.speechChunks = [];
    this.speechLength = 0;
    this.silenceSampleCount = 0;
    this.peakUtteranceRms = 0;

    let rawText = '';
    try {
      rawText = await this.callOpenAiAudioApi(pcmToDecode, apiKey);
    } catch (err: any) {
      console.error('[OpenAI Cloud Whisper Error]:', err.message || err);
      return null;
    }

    if (!rawText || !rawText.trim()) {
      return null;
    }

    const cleanedText = rawText
      .replace(/\[\s*blank_audio\s*\]/gi, '')
      .replace(/\(\s*silence\s*\)/gi, '')
      .replace(/\[\s*music\s*\]/gi, '')
      .replace(/\(\s*air whooshing\s*\)/gi, '')
      .replace(/\(\s*water splashing\s*\)/gi, '')
      .trim();

    const lower = cleanedText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const exactHallucinations = new Set([
      'you', 'thank you', 'thanks', 'thanks for watching', 'thank you for watching',
      'subscribe', 'subtitles', 'subtitles by', 'amaraorg', 'amara org', 'mb', 'bye',
      'wall', 'military life we want', 'so', 'yeah', 'okay', 'reboot', 'the end', 'watching',
      'like and subscribe', 'shh', 'shhh', 'vatismultia', 'vatismultia.', 'vatismultia!',
    ]);

    const isHallucination =
      !cleanedText ||
      lower.length <= 1 ||
      exactHallucinations.has(lower) ||
      lower.includes('thank you for watching') ||
      lower.includes('thanks for watching') ||
      lower.includes('subtitles by') ||
      lower.includes('amaraorg') ||
      lower.includes('amara org') ||
      lower.includes('like and subscribe') ||
      lower.includes('subtitles created by') ||
      lower.includes('captioned by') ||
      lower.includes('translated by');

    if (isHallucination) {
      return null;
    }

    const timestamp = Date.now();
    const payload: TranscriptEventPayload = {
      text: cleanedText,
      speaker,
      isFinal: true,
      timestamp,
    };

    console.log(`[OpenAI Cloud Whisper] ✅ (${speaker}): "${cleanedText}"`);
    eventBus.emit('transcript.final', payload);
    this.notifyCallbacks(payload);

    return payload;
  }

  private notifyCallbacks(payload: TranscriptEventPayload): void {
    for (const cb of this.callbacks) {
      try {
        cb(payload);
      } catch (err) {
        console.error('[OpenAI Cloud Whisper Callback Error]:', err);
      }
    }
  }

  private calculatePcmRms(pcmBuffer: Buffer): number {
    if (pcmBuffer.length < 2) return 0;
    let sum = 0;
    const numSamples = Math.floor(pcmBuffer.length / 2);
    for (let i = 0; i < pcmBuffer.length - 1; i += 2) {
      const sample = pcmBuffer.readInt16LE(i);
      sum += sample * sample;
    }
    return Math.sqrt(sum / numSamples);
  }

  private async callOpenAiAudioApi(pcmBuffer: Buffer, apiKey: string): Promise<string> {
    console.log(
      `[OpenAI Cloud Whisper 📤] Speech detected (bytes: ${pcmBuffer.length} | Peak RMS: ${Math.round(this.peakUtteranceRms)} | Trigger RMS: ${Math.round(this.triggerUtteranceRms)} | NoiseFloor: ${Math.round(this.utteranceNoiseFloor)} | Threshold: ${Math.round(this.utteranceThreshold)}). Sending audio utterance to OpenAI API...`
    );
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

    // 3. Technical terminology hints — transcribe models use 'instructions', whisper models use 'prompt'
    const techPrompt = prompts.sttPrompts.technicalVocabularyGuide;
    const isTranscribeModel = this.model.includes('transcribe');
    if (isTranscribeModel) {
      const instructionsText = `Transcribe the spoken audio accurately into text. If the audio contains only background noise, breath, or no intelligible human speech, return an empty string. Recognized technical vocabulary: ${techPrompt}`;
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="instructions"\r\n\r\n${instructionsText}\r\n`));
    } else {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${techPrompt}\r\n`));
    }

    // 4. Language field if specified
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
              console.log(`[OpenAI Cloud Whisper 📥] HTTP ${res.statusCode} response received:`, data.trim());
              try {
                const parsed = JSON.parse(data);
                resolve(parsed.text || '');
              } catch {
                resolve(data);
              }
            } else {
              console.error(`[OpenAI Cloud Whisper ❌] HTTP ${res.statusCode} error response:`, data);
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
