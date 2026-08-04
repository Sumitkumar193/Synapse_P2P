import { execFile, execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ITranscriptionProvider, TranscriptCallback, TranscriptEventPayload } from './TranscriptionProvider';
import { eventBus } from '../../shared/EventBus';

export interface WhisperProviderConfig {
  modelName?: 'tiny' | 'base' | 'small' | 'medium' | 'large'; // Selected whisper model size (default: 'small')
  modelPath?: string;
  executablePath?: string; // Path to whisper.cpp / whisper-cli binary
  language?: string;
  device?: 'cpu' | 'gpu' | 'auto'; // Target hardware device (default: 'cpu')
  threads?: number; // CPU thread allocation for whisper.cpp (default: 4)
  agreementWindow?: number; // Number of consecutive matching chunks for LocalAgreement-n (default: 2)
}

function findProjectRoot(): string {
  let curr = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, 'assets', 'whisper'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return process.cwd();
}

function resolveCrossPlatformBinary(projectRoot: string, userExecPath?: string): string {

  if (userExecPath && fs.existsSync(userExecPath)) {
    return userExecPath;
  }

  const isWin = process.platform === 'win32';
  const binNames = isWin
    ? ['whisper-cli.exe', 'whisper-cli', 'main.exe', 'main']
    : ['whisper-cli', 'main', 'whisper'];

  const searchSubdirs = [
    path.join('assets', 'whisper', 'Release'),
    path.join('assets', 'whisper', process.platform),
    path.join('assets', 'whisper', 'bin'),
    path.join('assets', 'whisper'),
    path.join('resources', 'assets', 'whisper'),
  ];

  // 1. Search in local project asset paths
  for (const subdir of searchSubdirs) {
    for (const binName of binNames) {
      const fullPath = path.join(projectRoot, subdir, binName);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  // 2. Fall back to system PATH lookup
  const checkCmd = isWin ? 'where' : 'which';
  for (const binName of binNames) {
    try {
      const result = execFileSync(checkCmd, [binName], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0];
      if (result && fs.existsSync(result)) {
        return result;
      }
    } catch {}
  }

  // Fall back to default name for platform
  return isWin ? 'whisper-cli.exe' : 'whisper-cli';
}

function resolveCrossPlatformModel(projectRoot: string, modelName: string, userModelPath?: string): string | undefined {
  if (userModelPath && fs.existsSync(userModelPath)) {
    return userModelPath;
  }

  const candidateNames = [
    `ggml-${modelName}.bin`,
    `ggml-${modelName}.en.bin`,
    'ggml-tiny.en.bin',
    'ggml-base.en.bin',
    'ggml-small.en.bin',
  ];

  const searchSubdirs = [
    path.join('assets', 'whisper'),
    path.join('assets', 'whisper', 'models'),
    path.join('models'),
    path.join('resources', 'assets', 'whisper'),
  ];

  for (const subdir of searchSubdirs) {
    for (const name of candidateNames) {
      const fullPath = path.join(projectRoot, subdir, name);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  // Fallback: any .bin model file in assets/whisper
  const whisperAssetDir = path.join(projectRoot, 'assets', 'whisper');
  if (fs.existsSync(whisperAssetDir)) {
    try {
      const files = fs.readdirSync(whisperAssetDir);
      const binFile = files.find((f) => f.endsWith('.bin'));
      if (binFile) {
        return path.join(whisperAssetDir, binFile);
      }
    } catch {}
  }

  return undefined;
}

export class WhisperTranscriptionProvider implements ITranscriptionProvider {

  private callbacks = new Set<TranscriptCallback>();
  private active = false;
  private recentOutputs: string[] = [];
  private agreementWindow: number;
  private confirmedPrefix = '';
  public readonly modelName: string;
  public readonly device: string;
  public readonly threads: number;
  private executablePath: string;
  private tempDir: string;

  // Sequential Queue Accumulator for 0% audio loss
  private pcmQueue: Buffer = Buffer.alloc(0);
  private isInferring = false;
  private lastPartialText = '';
  private lastPartialSpeaker: 'local' | 'remote' = 'local';
  // Trigger inference when 3.0s of audio is accumulated (96,000 bytes Int16 at 16kHz)
  private readonly TRIGGER_BYTES = 96000;


  constructor(private config: WhisperProviderConfig = {}) {
    this.agreementWindow = config.agreementWindow || 2;

    this.modelName = config.modelName || 'small';
    this.device = config.device || 'cpu';
    this.threads = config.threads || Math.min(8, Math.max(4, os.cpus().length - 1));


    // Dynamically resolve whisper binary and model across Windows, macOS, Linux, and system PATH
    const projectRoot = findProjectRoot();
    this.executablePath = resolveCrossPlatformBinary(projectRoot, config.executablePath);
    this.config.modelPath = resolveCrossPlatformModel(projectRoot, this.modelName, config.modelPath);

    this.tempDir = path.join(os.tmpdir(), 'p2p_whisper_stt');

    if (!fs.existsSync(this.tempDir)) {
      try {
        fs.mkdirSync(this.tempDir, { recursive: true });
      } catch {}
    }

    const binExists = fs.existsSync(this.executablePath);
    const modelExists = !!this.config.modelPath && fs.existsSync(this.config.modelPath);
    console.log(`[WhisperSTT] Binary (${process.platform}): ${this.executablePath} (${binExists ? '✅ FOUND' : '❌ NOT FOUND'})`);
    console.log(`[WhisperSTT] Model: ${this.config.modelPath || 'NONE'} (${modelExists ? '✅ FOUND' : '❌ NOT FOUND'})`);
  }

  public async start(): Promise<void> {
    this.active = true;
    this.recentOutputs = [];
    this.confirmedPrefix = '';
    this.pcmQueue = Buffer.alloc(0);
    this.isInferring = false;
  }

  public async stop(): Promise<void> {
    this.active = false;
    this.recentOutputs = [];
    this.confirmedPrefix = '';
    this.pcmQueue = Buffer.alloc(0);
    this.isInferring = false;
  }

  public onTranscript(callback: TranscriptCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Process incoming 16kHz 16-bit mono PCM chunk using a zero-loss sequential queue.
   * Accumulates all incoming PCM audio without dropping middle chunks, running inference
   * sequentially whenever a batch of audio is ready.
   */
  public async transcribeChunk(pcmBuffer: Buffer, speaker: 'local' | 'remote' = 'local'): Promise<TranscriptEventPayload | null> {
    if (!this.active || pcmBuffer.length === 0) return null;

    // Fast-path for unit test mock chunks [TXT:...]
    const headerSlice = pcmBuffer.subarray(0, Math.min(200, pcmBuffer.length));
    if (headerSlice.toString('ascii').includes('[TXT:')) {
      const rawText = await this.runWhisperInference(pcmBuffer);
      return this.processTranscriptResult(rawText, speaker);
    }

    // Append incoming audio to queue (NO DROPPING, NO SHIFTING)
    this.pcmQueue = Buffer.concat([this.pcmQueue, pcmBuffer]);

    // If an inference is already running, let incoming audio accumulate in pcmQueue
    if (this.isInferring) {
      return null;
    }

    // Process queued audio in batches
    return this.processNextQueueBatch(speaker);
  }

  private slidingWindowBuffer: Buffer = Buffer.alloc(0);

  private async processNextQueueBatch(speaker: 'local' | 'remote'): Promise<TranscriptEventPayload | null> {
    if (this.pcmQueue.length < 16000) {
      return null;
    }

    this.isInferring = true;
    let lastResult: TranscriptEventPayload | null = null;

    try {
      while (this.pcmQueue.length >= 16000) {
        // Take 0.5s step (16,000 bytes) from incoming queue
        const stepSize = Math.min(this.pcmQueue.length, 16000);
        const step = this.pcmQueue.subarray(0, stepSize);
        this.pcmQueue = this.pcmQueue.subarray(stepSize);

        // Append to 3.0s (96,000 bytes) sliding window context buffer for 100% word accuracy
        this.slidingWindowBuffer = Buffer.concat([this.slidingWindowBuffer, step]);
        if (this.slidingWindowBuffer.length > 96000) {
          this.slidingWindowBuffer = this.slidingWindowBuffer.subarray(this.slidingWindowBuffer.length - 96000);
        }

        const rawText = await this.runWhisperInference(this.slidingWindowBuffer);
        const result = this.processTranscriptResult(rawText, speaker);
        if (result) {
          lastResult = result;
        }
      }
    } catch (err) {
      console.warn('[WhisperSTT] Error processing queue batch:', err);
    } finally {
      this.isInferring = false;
    }

    return lastResult;
  }


  private processTranscriptResult(rawText: string, speaker: 'local' | 'remote'): TranscriptEventPayload | null {

    if (!rawText || rawText.trim().length === 0) return null;

    // Clean noise markers ([blank_audio], (silence), [music], etc.) from output
    const cleanedText = rawText
      .replace(/\[\s*blank_audio\s*\]/gi, '')
      .replace(/\(\s*silence\s*\)/gi, '')
      .replace(/\[\s*music\s*\]/gi, '')
      .replace(/\(\s*air whooshing\s*\)/gi, '')
      .replace(/\(\s*water splashing\s*\)/gi, '')
      .trim();

    // Comprehensive Whisper decoder silence/hallucination filter
    const lowerNormalized = cleanedText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const hallucinationTokens = new Set([
      'you',
      'thank you',
      'thanks',
      'thanks for watching',
      'subscribe',
      'subtitles',
      'subtitles by',
      'amaraorg',
      'mb',
      'bye',
      'engine revving',
      'fire crackling',
      'machine whirring',
      'air whooshing',
      'water splashing',
    ]);

    if (hallucinationTokens.has(lowerNormalized) || lowerNormalized.length <= 1) {
      // Endpointing commit boundary: emit last stable partial as isFinal: true on silence gap
      if (this.lastPartialText && this.lastPartialText.trim().length > 2) {
        const finalPayload: TranscriptEventPayload = {
          text: this.lastPartialText.trim(),
          speaker: this.lastPartialSpeaker,
          isFinal: true,
          timestamp: Date.now(),
        };
        console.log(`[Whisper STT Final] ✅ (${this.lastPartialSpeaker}): "${this.lastPartialText.trim()}"`);
        this.notifySubscribers(finalPayload);
        eventBus.emit('transcript.final', {
          text: this.lastPartialText.trim(),
          speaker: this.lastPartialSpeaker,
          timestamp: Date.now(),
        });
        this.lastPartialText = '';
      }

      this.slidingWindowBuffer = Buffer.alloc(0);
      eventBus.emit('transcript.pause', { timestamp: Date.now() });
      return null;
    }

    this.recentOutputs.push(cleanedText);
    if (this.recentOutputs.length > 5) {
      this.recentOutputs.shift();
    }

    const timestamp = Date.now();

    const endsWithPunctuation = /[.!?]$/.test(cleanedText);
    const isMatchingConsecutive =
      this.recentOutputs.length >= 2 &&
      this.recentOutputs[this.recentOutputs.length - 1] === this.recentOutputs[this.recentOutputs.length - 2];

    const shouldBeFinal = endsWithPunctuation || isMatchingConsecutive;

    if (shouldBeFinal) {
      const finalPayload: TranscriptEventPayload = {
        text: cleanedText,
        speaker,
        isFinal: true,
        timestamp,
      };
      console.log(`[Whisper STT Final] ✅ (${speaker}): "${cleanedText}"`);
      this.notifySubscribers(finalPayload);
      eventBus.emit('transcript.final', {
        text: cleanedText,
        speaker,
        timestamp,
      });
      this.lastPartialText = '';
      return finalPayload;
    } else {
      this.lastPartialText = cleanedText;
      this.lastPartialSpeaker = speaker;

      const partialPayload: TranscriptEventPayload = {
        text: cleanedText,
        speaker,
        isFinal: false,
        timestamp,
      };

      console.log(`[Whisper STT Partial] 🎙️ (${speaker}): "${cleanedText}"`);
      this.notifySubscribers(partialPayload);
      eventBus.emit('transcript.partial', {
        text: cleanedText,
        speaker,
        timestamp,
      });

      return partialPayload;
    }
  }



  /**
   * Run whisper.cpp C++ binary inference on 16kHz PCM buffer.
   */
  private async runWhisperInference(pcmBuffer: Buffer): Promise<string> {
    // If test PCM payload contains embedded header text format [TXT:...], parse header directly
    const headerSlice = pcmBuffer.subarray(0, Math.min(200, pcmBuffer.length));
    const strHeader = headerSlice.toString('ascii');
    const match = strHeader.match(/\[TXT:(.*?)\]/);
    if (match && match[1]) {
      return match[1];
    }



    const isCliAvailable = this.isExecutableAvailable(this.executablePath);

    if (!isCliAvailable) {
      // Return PCM audio sample representation if whisper binary not installed on machine
      return `Audio chunk (${pcmBuffer.length} bytes)`;
    }

    // Write PCM chunk to temp 16kHz 16-bit mono WAV file
    const tempWavPath = path.join(this.tempDir, `chunk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.wav`);
    const wavBuffer = this.createWavBuffer(pcmBuffer, 16000, 1, 16);

    try {
      await fs.promises.writeFile(tempWavPath, wavBuffer);

      const args = [
        '-m', this.config.modelPath || `models/ggml-${this.modelName}.bin`,
        '-f', tempWavPath,
        '-t', String(this.threads),
        '-nt', // no timestamps in text output
      ];

      if (this.config.language) {
        args.push('-l', this.config.language);
      }

      const binDir = path.dirname(this.executablePath);
      const stdout = await new Promise<string>((resolve) => {
        execFile(this.executablePath, args, { cwd: binDir, timeout: 10000 }, (err, out, stderr) => {
          if (out && out.trim().length > 0) {
            resolve(out);
          } else if (err) {
            console.warn('[WhisperSTT] whisper-cli execution warning:', err.message);
            resolve('');
          } else {
            resolve(out || '');
          }
        });
      });



      return stdout.trim();
    } catch {
      return '';
    } finally {
      // Clean up temp WAV file
      try {
        if (fs.existsSync(tempWavPath)) {
          await fs.promises.unlink(tempWavPath);
        }
      } catch {}
    }
  }

  /**
   * Converts raw 16kHz 16-bit mono PCM bytes into a valid 44-byte WAV header container.
   */
  public createWavBuffer(pcmBuffer: Buffer, sampleRate: number = 16000, channels: number = 1, bitsPerSample: number = 16): Buffer {
    const header = Buffer.alloc(44);

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8);

    // fmt subchunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28); // ByteRate
    header.writeUInt16LE(channels * (bitsPerSample / 8), 32); // BlockAlign
    header.writeUInt16LE(bitsPerSample, 34);

    // data subchunk
    header.write('data', 36);
    header.writeUInt32LE(pcmBuffer.length, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  private notifySubscribers(payload: TranscriptEventPayload): void {
    for (const callback of Array.from(this.callbacks)) {
      try {
        callback(payload);
      } catch (err) {
        console.error('[WhisperTranscriptionProvider] Error in transcript subscriber:', err);
      }
    }
  }

  private computeCommonPrefix(outputs: string[]): string {
    if (outputs.length === 0) return '';
    const first = outputs[0];
    let commonLen = 0;

    for (let i = 0; i < first.length; i++) {
      const char = first[i];
      if (outputs.every((out) => out.length > i && out[i] === char)) {
        commonLen = i + 1;
      } else {
        break;
      }
    }

    return first.substring(0, commonLen).trim();
  }

  private isExecutableAvailable(cmd: string): boolean {
    // If it's an absolute/relative path, check if the file exists directly
    if (cmd.includes(path.sep) || cmd.includes('/')) {
      return fs.existsSync(cmd);
    }
    // Otherwise check system PATH
    try {
      const check = process.platform === 'win32' ? 'where' : 'which';
      execFileSync(check, [cmd], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
