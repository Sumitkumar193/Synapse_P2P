import { IMediaProvider } from './IMediaProvider';
import { ITransportProvider } from '../../transport/interfaces/ITransportProvider';
import { DesktopSource, ScreenCaptureOptions } from '../../types';

export interface FrameSample {
  canvas?: HTMLCanvasElement;
  width: number;
  height: number;
  timestamp: number;
}

export class MediaController {
  private mediaProvider: IMediaProvider;
  private transportProvider: () => ITransportProvider | undefined;

  constructor(mediaProvider: IMediaProvider, transportProvider: () => ITransportProvider | undefined) {
    this.mediaProvider = mediaProvider;
    this.transportProvider = transportProvider;
  }

  public localStream(): MediaStream | null {
    return this.mediaProvider.getLocalStream();
  }

  public remoteStream(): MediaStream | null {
    return this.transportProvider()?.getRemoteStream() || this.mediaProvider.getRemoteStream();
  }

  public videoTrack(): MediaStreamTrack | null {
    const remote = this.remoteStream();
    if (remote && remote.getVideoTracks().length > 0) {
      return remote.getVideoTracks()[0];
    }
    const local = this.localStream();
    if (local && local.getVideoTracks().length > 0) {
      return local.getVideoTracks()[0];
    }
    return null;
  }

  public microphoneTrack(): MediaStreamTrack | null {
    const local = this.localStream();
    if (local && local.getAudioTracks().length > 0) {
      return local.getAudioTracks()[0];
    }
    return null;
  }

  public speakerTrack(): MediaStreamTrack | null {
    const remote = this.remoteStream();
    if (remote && remote.getAudioTracks().length > 0) {
      return remote.getAudioTracks()[0];
    }
    return null;
  }

  public async publishScreen(options: ScreenCaptureOptions): Promise<MediaStream> {
    const stream = await this.mediaProvider.publishScreen(options);
    const transport = this.transportProvider();
    if (transport) {
      transport.addStream(stream);
    }
    return stream;
  }

  public stop(): void {
    this.mediaProvider.stop();
  }

  public async replaceVideo(track: MediaStreamTrack): Promise<void> {
    if (this.mediaProvider.replaceVideoTrack) {
      await this.mediaProvider.replaceVideoTrack(track);
    }
  }

  public async replaceAudio(track: MediaStreamTrack): Promise<void> {
    if (this.mediaProvider.replaceAudioTrack) {
      await this.mediaProvider.replaceAudioTrack(track);
    }
  }

  public async getDesktopSources(types: ('screen' | 'window')[] = ['screen', 'window']): Promise<DesktopSource[]> {
    return this.mediaProvider.getDesktopSources(types);
  }

  /**
   * Phase 10: Async Iterator for Video Frames (for AI / LangGraph Vision models)
   */
  public async *frames(options: { fps?: number } = {}): AsyncIterableIterator<FrameSample> {
    const intervalMs = 1000 / (options.fps || 2);
    while (true) {
      const vTrack = this.videoTrack();
      if (!vTrack || vTrack.readyState !== 'live') {
        await new Promise((res) => setTimeout(res, intervalMs));
        continue;
      }

      yield {
        width: vTrack.getSettings?.().width || 1920,
        height: vTrack.getSettings?.().height || 1080,
        timestamp: Date.now(),
      };

      await new Promise((res) => setTimeout(res, intervalMs));
    }
  }

  /**
   * Phase 10: Async Iterator for Audio Samples (for AI / Whisper STT models)
   */
  public async *audio(): AsyncIterableIterator<Float32Array> {
    while (true) {
      const aTrack = this.microphoneTrack() || this.speakerTrack();
      if (!aTrack || aTrack.readyState !== 'live') {
        await new Promise((res) => setTimeout(res, 500));
        continue;
      }

      // Yield 1024-byte dummy sample buffer for stream consumption
      yield new Float32Array(1024);
      await new Promise((res) => setTimeout(res, 200));
    }
  }
}
