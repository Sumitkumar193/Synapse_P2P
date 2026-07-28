export type DesktopSourceType = 'screen' | 'window' | 'tab';

export interface DesktopSource {
  id: string;
  name: string;
  thumbnail?: string; // Data URL or NativeImage format
  display_id?: string;
  appIcon?: string;
}

export interface ScreenCaptureOptions {
  sourceId: string;
  sourceType?: DesktopSourceType;
  audio?: boolean | MediaTrackConstraints;
  includeSystemAudio?: boolean;
  includeMicrophone?: boolean;
  video?: boolean | MediaTrackConstraints;
  frameRate?: number;
}

export interface AudioCaptureOptions {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  deviceId?: string;
}

export type RawVideoFrameCallback = (frameData: ArrayBuffer | Uint8Array, width: number, height: number, timestamp: number) => void;
