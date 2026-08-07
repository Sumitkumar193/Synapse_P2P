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

  // VAD Architecture & Debounce Engine
  private speechChunks: Buffer[] = [];
  private speechLength = 0;
  private silenceSampleCount = 0;
  private noiseFloorRms = 40;
  private lastVadLogTime = 0;

  // 1. Debounce Trigger & Pre-Roll Buffering
  private consecutiveAboveThreshold = 0;
  private readonly CONFIRM_CHUNKS = 2; // Requires 2 consecutive frames (~100-300ms) above threshold to confirm speech
  private isSpeechActive = false;
  private preRollBuffer: Buffer[] = []; // Pre-roll ring buffer (max 3 chunks, ~300ms)

  // Utterance VAD Metrics
  private peakUtteranceRms = 0;
  private triggerUtteranceRms = 0;
  private utteranceNoiseFloor = 40;
  private utteranceThreshold = 180;

  constructor(private config: OpenAIAudioProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'whisper-1';
  }

  // 2. Adaptive Clamped Threshold
  private computeThreshold(noiseFloor: number): number {
    const MULTIPLIER = 4.5;
    const MIN_THRESHOLD = 150;
    const MAX_THRESHOLD = 600;
    return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Math.round(noiseFloor * MULTIPLIER)));
  }

  // 5. Pre-Send Sanity Gate
  private isWorthSending(speechLength: number, peakRms: number, noiseFloor: number): boolean {
    const MIN_SPEECH_BYTES = 16000; // ~0.5s minimum duration
    const MIN_ENERGY_MARGIN = 2.0; // Peak RMS must meaningfully exceed 2.0x noise floor
    return speechLength >= MIN_SPEECH_BYTES && peakRms > noiseFloor * MIN_ENERGY_MARGIN;
  }

  private pushToPreRoll(pcmBuffer: Buffer): void {
    this.preRollBuffer.push(pcmBuffer);
    if (this.preRollBuffer.length > 3) {
      this.preRollBuffer.shift();
    }
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
    this.isSpeechActive = false;
    this.consecutiveAboveThreshold = 0;
    this.preRollBuffer = [];
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
    const dynamicThreshold = this.computeThreshold(this.noiseFloorRms);

    const now = Date.now();
    const isFrameAboveThreshold = rms >= dynamicThreshold;

    // Adaptively track continuous background noise floor (fan hum / mic hiss) ONLY during true silence
    if (!isFrameAboveThreshold && !this.isSpeechActive) {
      this.noiseFloorRms = Math.min(250, this.noiseFloorRms * 0.95 + rms * 0.05);
    }

    // Periodic VAD Diagnostic Log (every 3 seconds)
    if (now - this.lastVadLogTime >= 3000) {
      this.lastVadLogTime = now;
      console.log(
        `[VAD Diagnostic 📊] RMS: ${Math.round(rms)} | NoiseFloor: ${Math.round(this.noiseFloorRms)} | Threshold: ${Math.round(dynamicThreshold)} | Status: ${this.isSpeechActive ? '🗣️ SPEECH' : '🔇 SILENCE'}`
      );
    }

    if (isFrameAboveThreshold) {
      this.consecutiveAboveThreshold++;

      // 1. Debounce Trigger: Require CONFIRM_CHUNKS consecutive frames above threshold before declaring speech onset
      if (!this.isSpeechActive && this.consecutiveAboveThreshold >= this.CONFIRM_CHUNKS) {
        this.isSpeechActive = true;
        this.triggerUtteranceRms = rms;
        this.utteranceNoiseFloor = this.noiseFloorRms;
        this.utteranceThreshold = dynamicThreshold;
        this.peakUtteranceRms = rms;

        // 4. Pre-roll Buffer: Prepend captured pre-roll buffer to speech chunks so speech onset phonemes are preserved
        this.speechChunks = [...this.preRollBuffer, pcmBuffer];
        this.speechLength = this.speechChunks.reduce((acc, buf) => acc + buf.length, 0);
        this.preRollBuffer = [];
        this.silenceSampleCount = 0;

        console.log(
          `[VAD Diagnostic 🗣️ SPEECH CONFIRMED] Trigger RMS: ${Math.round(rms)} | NoiseFloor: ${Math.round(this.noiseFloorRms)} | Threshold: ${Math.round(dynamicThreshold)} (Debounced over ${this.consecutiveAboveThreshold} chunks)`
        );
      } else if (this.isSpeechActive) {
        // Sustained active speech
        this.peakUtteranceRms = Math.max(this.peakUtteranceRms, rms);
        this.speechChunks.push(pcmBuffer);
        this.speechLength += pcmBuffer.length;
        this.silenceSampleCount = 0;

        // Auto-flush when speech reaches 12.0 seconds (~384,000 bytes)
        if (this.speechLength >= 384000) {
          return this.flushAndTranscribe(key, speaker);
        }
      } else {
        // Candidate speech chunk (unconfirmed transient) — buffer in preRollBuffer
        this.pushToPreRoll(pcmBuffer);
      }
      return null;
    } else {
      // Frame below threshold
      this.consecutiveAboveThreshold = 0;

      if (this.isSpeechActive) {
        this.silenceSampleCount++;
        this.speechChunks.push(pcmBuffer);
        this.speechLength += pcmBuffer.length;

        // 3. Hangover grace period (~1.5s silence = 3 consecutive silent chunks) before closing utterance
        if (this.silenceSampleCount >= 3) {
          return this.flushAndTranscribe(key, speaker);
        }
      } else {
        // Pure silence — keep pre-roll ring buffer updated
        this.pushToPreRoll(pcmBuffer);
      }
      return null;
    }
  }

  private async flushAndTranscribe(apiKey: string, speaker: 'local' | 'remote'): Promise<TranscriptEventPayload | null> {
    const currentLength = this.speechLength;
    const currentPeakRms = this.peakUtteranceRms;
    const currentNoiseFloor = this.utteranceNoiseFloor;

    const pcmToDecode = Buffer.concat(this.speechChunks, this.speechLength);
    this.speechChunks = [];
    this.speechLength = 0;
    this.silenceSampleCount = 0;
    this.isSpeechActive = false;
    this.consecutiveAboveThreshold = 0;
    this.peakUtteranceRms = 0;
    this.preRollBuffer = [];

    // 5. Pre-Send Sanity Gate: Skip empty or transient noise-burst API calls entirely
    if (!this.isWorthSending(currentLength, currentPeakRms, currentNoiseFloor)) {
      console.log(
        `[VAD Diagnostic 🛑 SANITY GATE DISCARDED] Skipped noise burst audio (bytes: ${currentLength}, peakRMS: ${Math.round(currentPeakRms)}, noiseFloor: ${Math.round(currentNoiseFloor)}). Saved API call.`
      );
      return null;
    }

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

    let cleanedText = rawText
      .replace(/\[\s*blank_audio\s*\]/gi, '')
      .replace(/\(\s*silence\s*\)/gi, '')
      .replace(/\[\s*music\s*\]/gi, '')
      .replace(/\(\s*air whooshing\s*\)/gi, '')
      .replace(/\(\s*water splashing\s*\)/gi, '')
      // Scrub hallucinated web URLs (e.g. http://www.hamskey.com)
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/www\.[a-z0-9\-]+\.[a-z]{2,}/gi, '')
      // Scrub YouTube video closing credits hallucinations
      .replace(/sorry,?\s*that's\s*all\s*for\s*now,?\s*i'll\s*see\s*you\s*in\s*the\s*next\s*video\.?/gi, '')
      .replace(/i'll\s*see\s*you\s*in\s*the\s*next\s*video\.?/gi, '')
      .replace(/see\s*you\s*in\s*the\s*next\s*video\.?/gi, '')
      .replace(/thank\s*you\s*for\s*watching\.?/gi, '')
      .replace(/thanks\s*for\s*watching\.?/gi, '')
      .replace(/like\s*and\s*subscribe\.?/gi, '')
      // Scrub repeating prompt repetition loops (e.g. Toolkit, C++, C++2, C++3, C++9.1, C++7.2...)
      .replace(/Toolkit,?\s*/gi, '')
      .replace(/C\+\+\d*(\.\d+)*/gi, '')
      .replace(/(,\s*)+/gi, ', ')
      .replace(/\b(\w+)(,\s*\1){2,}\b/gi, '')
      .replace(/^[.,!?;\s\-"']+$/, '')
      .trim();

    const lower = cleanedText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const exactHallucinations = new Set([
      'you', 'thank you', 'thanks', 'thanks for watching', 'thank you for watching',
      'subscribe', 'subtitles', 'subtitles by', 'amaraorg', 'amara org', 'mb', 'bye',
      'wall', 'military life we want', 'so', 'yeah', 'okay', 'reboot', 'the end', 'watching',
      'like and subscribe', 'shh', 'shhh', 'vatismultia', 'vatismultia.', 'vatismultia!',
      'sorry thats all for now ill see you in the next video', 'ill see you in the next video',
      'see you in the next video', 'toolkit c2 c3 c4', 'hamskey', 'hamskey com',
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
      lower.includes('see you in the next video') ||
      lower.includes('subtitles created by') ||
      lower.includes('captioned by') ||
      lower.includes('translated by') ||
      lower.includes('hamskey');

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

    // 3. Optional instructions field for transcribe models (omit prompt for whisper-1 to eliminate prompt injection hallucinations)
    const isTranscribeModel = this.model.includes('transcribe');
    if (isTranscribeModel) {
      const techPrompt = prompts.sttPrompts.technicalVocabularyGuide;
      const instructionsText = `Transcribe the spoken audio accurately into text. If the audio contains only background noise, breath, or no intelligible human speech, return an empty string. Recognized technical vocabulary: ${techPrompt}`;
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="instructions"\r\n\r\n${instructionsText}\r\n`));
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
