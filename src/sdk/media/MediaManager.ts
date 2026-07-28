import { DesktopSource, ScreenCaptureOptions, AudioCaptureOptions } from '../types';
import { MediaError } from '../utils/Errors';
import { Logger } from '../utils/Logger';

declare global {
  interface Window {
    electronAPI?: {
      getDesktopSources: (options?: any) => Promise<DesktopSource[]>;
      minimizeWindow?: () => void;
      maximizeWindow?: () => void;
      closeWindow?: () => void;
      openNewWindow?: () => void;
      isDev?: boolean;
      signaling?: {
        joinRoom: (roomId: string, peerId: string) => void;
        leaveRoom: (roomId: string, peerId: string) => void;
        sendMessage: (message: any) => void;
        onMessage: (callback: (message: any) => void) => void;
      };
    };
  }
}

export class MediaManager {
  private activeLocalStream?: MediaStream;
  private logger: Logger = new Logger('MediaManager');

  public async getDesktopSources(types: ('screen' | 'window')[] = ['screen', 'window']): Promise<DesktopSource[]> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      return await window.electronAPI.getDesktopSources({ types });
    }
    this.logger.warn('electronAPI not available in current process environment');
    return [];
  }

  public async captureScreen(options: ScreenCaptureOptions): Promise<MediaStream> {
    try {
      this.logger.info(`Capturing desktop source ${options.sourceId}...`);
      
      const includeSystemAudio = options.includeSystemAudio ?? options.audio ?? true;
      const includeMicrophone = options.includeMicrophone ?? false;

      const videoConstraints: any = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: options.sourceId,
          minFrameRate: options.frameRate || 15,
          maxFrameRate: options.frameRate || 60,
        },
      };

      const constraints: MediaStreamConstraints = {
        audio: includeSystemAudio ? {
          mandatory: {
            chromeMediaSource: 'desktop',
          },
        } as any : false,
        video: videoConstraints,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (audioErr) {
        if (includeSystemAudio) {
          this.logger.warn('System audio capture failed, falling back to video-only capture', audioErr);
          constraints.audio = false;
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } else {
          throw audioErr;
        }
      }

      // If microphone is requested, capture mic track and mix/attach
      if (includeMicrophone) {
        try {
          const micTrack = await this.captureMicrophone();
          const audioTracks = stream.getAudioTracks();

          if (audioTracks.length > 0) {
            // Mix system audio + mic audio using Web Audio API
            const mixedTrack = this.mixAudioTracks([audioTracks[0], micTrack]);
            audioTracks.forEach((t) => stream.removeTrack(t));
            stream.addTrack(mixedTrack);
          } else {
            // Attach mic track directly if no system audio track present
            stream.addTrack(micTrack);
          }
        } catch (micErr) {
          this.logger.warn('Microphone capture failed:', micErr);
        }
      }

      this.activeLocalStream = stream;
      return stream;
    } catch (err: any) {
      throw new MediaError(`Failed to capture screen stream: ${err.message}`);
    }
  }

  public async captureMicrophone(options: AudioCaptureOptions = {}): Promise<MediaStreamTrack> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: options.echoCancellation ?? true,
          noiseSuppression: options.noiseSuppression ?? true,
          autoGainControl: options.autoGainControl ?? true,
          deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new MediaError('No audio track returned by getUserMedia');
      }
      return audioTrack;
    } catch (err: any) {
      throw new MediaError(`Failed to capture microphone track: ${err.message}`);
    }
  }

  private mixAudioTracks(tracks: MediaStreamTrack[]): MediaStreamTrack {
    if (tracks.length === 0) throw new Error('No tracks to mix');
    if (tracks.length === 1) return tracks[0];

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const destination = audioCtx.createMediaStreamDestination();

    tracks.forEach((track) => {
      const stream = new MediaStream([track]);
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(destination);
    });

    return destination.stream.getAudioTracks()[0];
  }

  public stopLocalStream(): void {
    if (this.activeLocalStream) {
      this.activeLocalStream.getTracks().forEach((track) => track.stop());
      this.activeLocalStream = undefined;
      this.logger.info('Stopped local media stream');
    }
  }

  public getActiveStream(): MediaStream | undefined {
    return this.activeLocalStream;
  }
}
