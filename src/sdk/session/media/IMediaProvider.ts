import { DesktopSource, ScreenCaptureOptions } from '../../types';

export interface IMediaProvider {
  getLocalStream(): MediaStream | null;
  getRemoteStream(): MediaStream | null;
  getTrack(kind: 'video' | 'audio'): MediaStreamTrack | null;
  publishScreen(options: ScreenCaptureOptions): Promise<MediaStream>;
  stop(): void;
  replaceVideoTrack?(track: MediaStreamTrack): Promise<void>;
  replaceAudioTrack?(track: MediaStreamTrack): Promise<void>;
  getDesktopSources(types?: ('screen' | 'window')[]): Promise<DesktopSource[]>;
}
