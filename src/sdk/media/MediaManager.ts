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
      readClipboardText?: () => Promise<string>;
      writeClipboardText?: (text: string) => void;
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

import { IMediaProvider } from '../session/media/IMediaProvider';

export class MediaManager implements IMediaProvider {
  private activeLocalStream?: MediaStream;
  private logger: Logger = new Logger('MediaManager');

  public getLocalStream(): MediaStream | null {
    return this.activeLocalStream || null;
  }

  public getRemoteStream(): MediaStream | null {
    return null;
  }

  public getTrack(kind: 'video' | 'audio'): MediaStreamTrack | null {
    if (!this.activeLocalStream) return null;
    const tracks = kind === 'video' ? this.activeLocalStream.getVideoTracks() : this.activeLocalStream.getAudioTracks();
    return tracks.length > 0 ? tracks[0] : null;
  }

  public async publishScreen(options: ScreenCaptureOptions): Promise<MediaStream> {
    return this.captureScreen(options);
  }

  public stop(): void {
    this.stopLocalStream();
  }

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

      // If microphone is requested, capture mic track with Acoustic Echo Cancellation
      if (includeMicrophone) {
        try {
          const micTrack = await this.captureMicrophone({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
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
          echoCancellation: { exact: true },
          noiseSuppression: { exact: true },
          autoGainControl: { exact: true },
          deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        } as any,
        video: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        // Fallback ideal echo cancellation
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      }

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

  public getCombinedAudioStream(remoteStream?: MediaStream | null): MediaStream | null {
    const audioTracks: MediaStreamTrack[] = [];

    if (this.activeLocalStream) {
      audioTracks.push(...this.activeLocalStream.getAudioTracks());
    }
    if (remoteStream) {
      audioTracks.push(...remoteStream.getAudioTracks());
    }

    if (audioTracks.length === 0) return null;
    if (audioTracks.length === 1) return new MediaStream([audioTracks[0]]);

    try {
      const mixedTrack = this.mixAudioTracks(audioTracks);
      return new MediaStream([mixedTrack]);
    } catch (err) {
      this.logger.warn('Failed to mix audio tracks, returning fallback stream', err);
      return new MediaStream(audioTracks);
    }
  }

  public async takeScreenshot(
    stream?: MediaStream | null,
    options: { format?: 'png' | 'jpeg'; quality?: number } = {}
  ): Promise<{ base64: string; timestamp: number }> {
    const targetStream = stream || this.activeLocalStream;
    if (!targetStream) {
      throw new MediaError('No active video stream available for screenshot');
    }

    const videoTrack = targetStream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new MediaError('No video track found in target stream');
    }

    const videoElement = document.createElement('video');
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.srcObject = new MediaStream([videoTrack]);
    
    await videoElement.play().catch(() => {});

    await new Promise((res) => setTimeout(res, 60));

    const width = videoElement.videoWidth || 1920;
    const height = videoElement.videoHeight || 1080;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new MediaError('Failed to get 2D canvas context');

    ctx.drawImage(videoElement, 0, 0, width, height);

    const format = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const base64 = canvas.toDataURL(format, options.quality || 0.92);

    videoElement.pause();
    videoElement.srcObject = null;
    videoElement.remove();

    return {
      base64,
      timestamp: Date.now(),
    };
  }
}
