import { MediaManager } from '../media/MediaManager';
import { WebRTCTransport } from '../transport/WebRTCTransport';
import { DesktopSource, ScreenCaptureOptions } from '../types';

export class SessionMedia {
  private mediaManager: MediaManager;
  private transportProvider: () => WebRTCTransport | undefined;

  constructor(mediaManager: MediaManager, transportProvider: () => WebRTCTransport | undefined) {
    this.mediaManager = mediaManager;
    this.transportProvider = transportProvider;
  }

  public get localStream(): MediaStream | null {
    return this.mediaManager.getActiveStream() || null;
  }

  public get remoteStream(): MediaStream | null {
    return this.transportProvider()?.getRemoteStream() || null;
  }

  public videoTrack(): MediaStreamTrack | null {
    const remote = this.remoteStream;
    if (remote && remote.getVideoTracks().length > 0) {
      return remote.getVideoTracks()[0];
    }
    const local = this.localStream;
    if (local && local.getVideoTracks().length > 0) {
      return local.getVideoTracks()[0];
    }
    return null;
  }

  public microphoneTrack(): MediaStreamTrack | null {
    const local = this.localStream;
    if (local && local.getAudioTracks().length > 0) {
      return local.getAudioTracks()[0];
    }
    return null;
  }

  public speakerTrack(): MediaStreamTrack | null {
    const remote = this.remoteStream;
    if (remote && remote.getAudioTracks().length > 0) {
      return remote.getAudioTracks()[0];
    }
    return null;
  }

  public combinedAudioStream(): MediaStream | null {
    return this.mediaManager.getCombinedAudioStream(this.remoteStream);
  }

  public async getDesktopSources(types: ('screen' | 'window')[] = ['screen', 'window']): Promise<DesktopSource[]> {
    return this.mediaManager.getDesktopSources(types);
  }

  public async captureScreen(options: ScreenCaptureOptions): Promise<MediaStream> {
    const stream = await this.mediaManager.captureScreen(options);
    const transport = this.transportProvider();
    if (transport) {
      transport.addStream(stream);
    }
    return stream;
  }

  public stopLocalStream(): void {
    this.mediaManager.stopLocalStream();
  }
}
