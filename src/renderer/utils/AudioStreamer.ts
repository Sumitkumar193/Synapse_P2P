import { eventBus } from '../../shared/EventBus';

/**
 * AudioStreamer: Captures audio from a MediaStream (local microphone OR remote speaker output),
 * resamples to 16kHz Int16 PCM, sends chunks over IPC to main process Whisper STT engine,
 * and handles transcript results for live Closed Caption (CC) integration.
 */
export class AudioStreamer {
  private audioCtx: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private pcmBuffer: number[] = [];
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

      const audioStream = new MediaStream([audioTracks[0]]);
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.mediaStreamSource = this.audioCtx.createMediaStreamSource(audioStream);
      this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);

      if (speaker === 'local') {
        // LOCAL MIC: Route processor to SILENT gain node (gain=0) to eliminate self-monitoring echo
        const silentGain = this.audioCtx.createGain();
        silentGain.gain.value = 0;
        this.processor.connect(silentGain);
        silentGain.connect(this.audioCtx.destination);
      } else {
        // REMOTE SPEAKER: Connect to destination so user CAN hear remote peer speaker audio normally
        this.processor.connect(this.audioCtx.destination);
      }

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 → Int16 PCM
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          this.pcmBuffer.push(s < 0 ? s * 0x8000 : s * 0x7FFF);
        }

        // Batch into 0.25s buffers (4,096 samples = 256ms at 16kHz) for ultra-fast low-latency streaming over IPC
        if (this.pcmBuffer.length >= 4096) {
          const samplesToSend = this.pcmBuffer.splice(0, 4096);

          const int16Array = new Int16Array(samplesToSend);
          if (typeof window !== 'undefined' && (window as any).electronAPI?.sendAudioChunk) {
            (window as any).electronAPI.sendAudioChunk(int16Array.buffer, speaker);
          }
        }
      };

      this.mediaStreamSource.connect(this.processor);

      console.log(`[AudioStreamer] 🎙️ ${speaker.toUpperCase()} audio capture started (resumed) → 16kHz PCM → IPC → Whisper STT`);

    } catch (err) {
      console.warn(`[AudioStreamer] Failed to initialize ${speaker} audio streamer:`, err);
    }
  }

  /**
   * Global IPC transcript listener receiving Whisper STT events from main process
   */
  private static attachTranscriptListener(): void {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.onTranscript) return;

    (window as any).electronAPI.onTranscript((evt: any) => {
      const timestamp = evt.timestamp || Date.now();
      const speaker = evt.speaker || 'local';

      if (evt.isFinal) {
        // Emit final transcript for Closed Caption overlay & EventBus consumers
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
        // Emit partial transcript for live preview
        eventBus.emit('transcript.partial', {
          text: evt.text,
          speaker,
          timestamp,
        });
      }
    });



    AudioStreamer.transcriptListenerAttached = true;
    console.log('[AudioStreamer] 📡 Attached IPC transcript listener for Whisper STT results');
  }

  public stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.pcmBuffer = [];
  }
}

export const localAudioStreamer = new AudioStreamer();
export const remoteAudioStreamer = new AudioStreamer();
export const audioStreamer = localAudioStreamer; // Backwards-compatible default export
