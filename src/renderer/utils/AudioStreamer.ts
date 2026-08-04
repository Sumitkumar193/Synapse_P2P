import { eventBus } from '../../shared/EventBus';

/**
 * AudioStreamer: Captures audio from a MediaStream (local microphone OR remote speaker output),
 * resamples to 16kHz Int16 PCM, sends chunks over IPC to main process Whisper STT engine,
 * and handles transcript results for live Closed Caption (CC) integration.
 */
export class AudioStreamer {
  private audioCtx: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;
  private static transcriptListenerAttached = false;

  public async start(stream: MediaStream, speaker: 'local' | 'remote' = 'local'): Promise<void> {
    this.stop();

    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.warn(`[AudioStreamer] No audio tracks found for ${speaker} stream.`);
        return;
      }

      // Attach IPC transcript listener ONCE globally for Whisper STT events
      if (!AudioStreamer.transcriptListenerAttached) {
        AudioStreamer.attachTranscriptListener();
      }

      // Initialize AudioContext ONCE if not created yet (use native hardware sample rate to prevent Windows audio driver failure)
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Disconnect previous MediaStreamSource if present to avoid ghost track listening
      if (this.mediaStreamSource) {
        try {
          this.mediaStreamSource.disconnect();
        } catch {}
        this.mediaStreamSource = null;
      }

      // Create new MediaStreamSource for the passed MediaStream (mixes all mic & system speaker tracks)
      this.mediaStreamSource = this.audioCtx.createMediaStreamSource(stream);

      // Modern AudioWorklet Node (runs off main thread in real-time audio thread)
      if (this.audioCtx.audioWorklet) {
        if (!this.workletNode) {
          const workletCode = `
            class PcmProcessor extends AudioWorkletProcessor {
              constructor() {
                super();
                this.ringBuffer = new Int16Array(4096);
                this.writeIdx = 0;
                this.step = Math.max(1, sampleRate / 16000);
              }
              process(inputs) {
                const input = inputs[0];
                if (input && input.length > 0) {
                  const channelData = input[0];
                  const stepSize = Math.max(1, Math.round(this.step));
                  for (let i = 0; i < channelData.length; i += this.step) {
                    let sum = 0;
                    let count = 0;
                    const startIdx = Math.floor(i);
                    const endIdx = Math.min(channelData.length, startIdx + stepSize);
                    for (let j = startIdx; j < endIdx; j++) {
                      sum += channelData[j];
                      count++;
                    }
                    const avgSample = count > 0 ? sum / count : (channelData[startIdx] || 0);
                    const s = Math.max(-1, Math.min(1, avgSample));
                    this.ringBuffer[this.writeIdx++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

                    if (this.writeIdx >= 4096) {
                      this.port.postMessage(this.ringBuffer.buffer, [this.ringBuffer.buffer]);
                      this.ringBuffer = new Int16Array(4096);
                      this.writeIdx = 0;
                    }
                  }
                }
                return true;
              }
            }
            registerProcessor('pcm-processor', PcmProcessor);
          `;

          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await this.audioCtx.audioWorklet.addModule(workletUrl);
          URL.revokeObjectURL(workletUrl);

          this.workletNode = new AudioWorkletNode(this.audioCtx, 'pcm-processor');
          this.workletNode.port.onmessage = (e) => {
            const pcmArrayBuffer = e.data;
            if (typeof window !== 'undefined' && (window as any).electronAPI?.sendAudioChunk) {
              (window as any).electronAPI.sendAudioChunk(pcmArrayBuffer, speaker);
            }
          };

          if (speaker === 'local') {
            if (!this.silentGain) {
              this.silentGain = this.audioCtx.createGain();
              this.silentGain.gain.value = 0;
              this.silentGain.connect(this.audioCtx.destination);
            }
            this.workletNode.connect(this.silentGain);
          } else {
            this.workletNode.connect(this.audioCtx.destination);
          }
        }

        this.mediaStreamSource.connect(this.workletNode);
        if (this.audioCtx.state === 'suspended') {
          await this.audioCtx.resume();
        }
        console.log(`[AudioStreamer] 🎙️ ${speaker.toUpperCase()} AudioWorklet connected (Hardware SR: ${this.audioCtx.sampleRate}Hz) → 16kHz PCM → IPC → Whisper STT`);
        return;
      }

    } catch (err) {
      console.warn(`[AudioStreamer] Failed to initialize ${speaker} audio streamer:`, err);
    }
  }

  private static lastPartialEmitTime = 0;
  private static partialDebounceTimer: any = null;

  /**
   * Global IPC transcript listener receiving Whisper STT events from main process
   */
  private static attachTranscriptListener(): void {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.onTranscript) return;

    (window as any).electronAPI.onTranscript((evt: any) => {
      const timestamp = evt.timestamp || Date.now();
      const speaker = evt.speaker || 'local';

      if (evt.isFinal) {
        if (AudioStreamer.partialDebounceTimer) {
          clearTimeout(AudioStreamer.partialDebounceTimer);
          AudioStreamer.partialDebounceTimer = null;
        }

        // Emit final transcript immediately for Closed Caption overlay & EventBus consumers
        eventBus.emit('transcript.final', {
          text: evt.text,
          speaker,
          timestamp,
        });

        // Also populate into Chat Drawer
        if (speaker === 'remote') {
          eventBus.emit('cc.chat.remote', {
            text: `🎙️ [CC - Received]: "${evt.text}"`,
            tag: 'received',
            timestamp,
          });
        } else {
          eventBus.emit('cc.chat.local', {
            text: `🎙️ [CC - Me]: "${evt.text}"`,
            tag: 'me',
            timestamp,
          });
        }
        console.log(`[AudioStreamer] ✅ Whisper Final (${speaker}): "${evt.text}"`);
      } else {
        const now = Date.now();
        const payload = { text: evt.text, speaker, timestamp };

        if (now - AudioStreamer.lastPartialEmitTime >= 100) {
          AudioStreamer.lastPartialEmitTime = now;
          if (AudioStreamer.partialDebounceTimer) {
            clearTimeout(AudioStreamer.partialDebounceTimer);
            AudioStreamer.partialDebounceTimer = null;
          }
          eventBus.emit('transcript.partial', payload);
        } else {
          // Trailing-edge debounce: Guarantee the latest partial is ALWAYS delivered before a pause!
          if (AudioStreamer.partialDebounceTimer) {
            clearTimeout(AudioStreamer.partialDebounceTimer);
          }
          AudioStreamer.partialDebounceTimer = setTimeout(() => {
            AudioStreamer.lastPartialEmitTime = Date.now();
            AudioStreamer.partialDebounceTimer = null;
            eventBus.emit('transcript.partial', payload);
          }, 100 - (now - AudioStreamer.lastPartialEmitTime));
        }
      }
    });



    AudioStreamer.transcriptListenerAttached = true;
    console.log('[AudioStreamer] 📡 Attached IPC transcript listener for Whisper STT results');
  }

  public stop(): void {
    if (this.audioCtx && this.audioCtx.state === 'running') {
      this.audioCtx.suspend().catch(() => {});
    }
  }

  public destroy(): void {
    this.stop();
    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.silentGain) {
      try {
        this.silentGain.disconnect();
      } catch {}
      this.silentGain = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}

export const localAudioStreamer = new AudioStreamer();
export const remoteAudioStreamer = new AudioStreamer();
export const audioStreamer = localAudioStreamer; // Backwards-compatible default export
