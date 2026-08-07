import { eventBus } from '../../shared/EventBus';

/**
 * AudioStreamer: Captures audio from a MediaStream (local microphone OR remote speaker output),
 * resamples to 16kHz Int16 PCM, sends chunks over IPC to main process Whisper STT engine,
 * and handles transcript results for live Closed Caption (CC) integration.
 */
export class AudioStreamer {
  private audioCtx: AudioContext | null = null;
  private activeSources: MediaStreamAudioSourceNode[] = [];
  private workletNode: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;
  private static transcriptListenerAttached = false;

  public async start(stream: MediaStream | MediaStream[], speaker: 'local' | 'remote' = 'local'): Promise<void> {
    this.stop();

    try {
      const streams = Array.isArray(stream) ? stream : [stream];
      const audioTracks: MediaStreamTrack[] = [];
      streams.forEach((s) => {
        if (s && s.getAudioTracks) {
          s.getAudioTracks().forEach((track) => audioTracks.push(track));
        }
      });

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

      // Disconnect previous MediaStreamSource nodes if present to avoid ghost track listening
      this.disconnectActiveSources();

      // Modern AudioWorklet Node (runs off main thread in real-time audio thread)
      if (this.audioCtx.audioWorklet) {
        if (!this.workletNode) {
          const workletCode = `
            class PcmProcessor extends AudioWorkletProcessor {
              constructor() {
                super();
                this.ringBuffer = new Int16Array(4096);
                this.writeIdx = 0;
              }
              process(inputs) {
                const input = inputs[0];
                if (input && input.length > 0) {
                  const numChannels = input.length;
                  const frameCount = input[0].length;
                  const step = Math.max(1, sampleRate / 16000);
                  
                  // Measure frame RMS energy for real-time WebAudio noise gate (-48dB)
                  let frameSumSquare = 0;
                  let totalSamples = 0;
                  for (let ch = 0; ch < numChannels; ch++) {
                    const chData = input[ch];
                    if (chData) {
                      for (let i = 0; i < frameCount; i++) {
                        frameSumSquare += chData[i] * chData[i];
                        totalSamples++;
                      }
                    }
                  }
                  const frameRms = totalSamples > 0 ? Math.sqrt(frameSumSquare / totalSamples) : 0;
                  const isNoiseOrSilence = frameRms < 0.004;

                  for (let i = 0; i < frameCount; i += step) {
                    let sum = 0;
                    let count = 0;
                    const startIdx = Math.floor(i);
                    const endIdx = Math.min(frameCount, Math.max(startIdx + 1, Math.floor(i + step)));
                    
                    for (let ch = 0; ch < numChannels; ch++) {
                      const channelData = input[ch];
                      if (channelData) {
                        for (let j = startIdx; j < endIdx; j++) {
                          sum += channelData[j];
                          count++;
                        }
                      }
                    }
                    
                    const avgSample = (count > 0 && !isNoiseOrSilence) ? sum / count : 0;
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

        // Connect EVERY audio track via individual MediaStreamAudioSourceNode & Highpass Filter Node
        audioTracks.forEach((track) => {
          if (this.audioCtx && this.workletNode) {
            const singleTrackStream = new MediaStream([track]);
            const sourceNode = this.audioCtx.createMediaStreamSource(singleTrackStream);

            if (speaker === 'local') {
              // High-pass BiquadFilter at 85Hz to strip electrical power hum (50Hz/60Hz) & AC/rumble noise
              const highpass = this.audioCtx.createBiquadFilter();
              highpass.type = 'highpass';
              highpass.frequency.value = 85;

              sourceNode.connect(highpass);
              highpass.connect(this.workletNode);
            } else {
              sourceNode.connect(this.workletNode);
            }

            this.activeSources.push(sourceNode);
          }
        });

        if (this.audioCtx.state === 'suspended') {
          await this.audioCtx.resume();
        }
        console.log(`[AudioStreamer] 🎙️ ${speaker.toUpperCase()} AudioWorklet connected (${audioTracks.length} tracks, Hardware SR: ${this.audioCtx.sampleRate}Hz) → 16kHz PCM → IPC → Whisper STT`);
        return;
      }

    } catch (err) {
      console.warn(`[AudioStreamer] Failed to initialize ${speaker} audio streamer:`, err);
    }
  }

  private disconnectActiveSources(): void {
    this.activeSources.forEach((src) => {
      try {
        src.disconnect();
      } catch {}
    });
    this.activeSources = [];
  }

  private static lastPartialEmitTime = 0;
  private static partialDebounceTimer: any = null;

  /**
   * Global IPC transcript listener receiving Whisper STT events from main process
   */
  private static attachTranscriptListener(): void {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.onTranscript) return;

    if ((window as any).electronAPI?.onChatMessage) {
      (window as any).electronAPI.onChatMessage((msg: any) => {
        console.log('[Renderer IPC 📥] Received CHAT_MESSAGE_RECEIVED over IPC:', msg.text?.substring(0, 60));
        eventBus.emit('chat_received', msg);
      });
    }


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

        console.log(`[AudioStreamer] ✅ Whisper Final (${speaker}): "${evt.text}"`);
      } else {
        // Emit partial transcript immediately for real-time live captions UI
        const now = Date.now();
        if (now - AudioStreamer.lastPartialEmitTime >= 100) {
          AudioStreamer.lastPartialEmitTime = now;
          if (AudioStreamer.partialDebounceTimer) {
            clearTimeout(AudioStreamer.partialDebounceTimer);
            AudioStreamer.partialDebounceTimer = null;
          }
          eventBus.emit('transcript.partial', {
            text: evt.text,
            speaker,
            timestamp,
          });
        } else {
          if (AudioStreamer.partialDebounceTimer) {
            clearTimeout(AudioStreamer.partialDebounceTimer);
          }
          AudioStreamer.partialDebounceTimer = setTimeout(() => {
            AudioStreamer.lastPartialEmitTime = Date.now();
            AudioStreamer.partialDebounceTimer = null;
            eventBus.emit('transcript.partial', {
              text: evt.text,
              speaker,
              timestamp,
            });
          }, 100 - (now - AudioStreamer.lastPartialEmitTime));
        }
      }
    });

    AudioStreamer.transcriptListenerAttached = true;
    console.log('[AudioStreamer] 📡 Attached IPC transcript listener for Whisper STT results');
  }

  public stop(): void {
    this.disconnectActiveSources();
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
