export type MouseButton = 'left' | 'right' | 'middle';

export interface MouseMovePayload {
  x: number;
  y: number;
}

export interface MouseClickPayload {
  button: MouseButton;
  x?: number;
  y?: number;
  double?: boolean;
}

export interface MouseScrollPayload {
  deltaX: number;
  deltaY: number;
}

export interface MouseDragPayload {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface KeyboardPressPayload {
  key: string;
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
}

export interface KeyboardTypePayload {
  text: string;
}

export interface ClipboardPayload {
  text: string;
}

export interface FileTransferHeader {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
}

export interface ControlMessage {
  category: 'mouse' | 'keyboard' | 'clipboard' | 'file';
  action: string;
  payload: any;
}

export interface SessionStatsReport {
  rttMs?: number;
  inboundBitrateKbps?: number;
  outboundBitrateKbps?: number;
  packetLossRate?: number;
  candidateType: 'host' | 'srflx' | 'prflx' | 'relay' | string;
  connectionType: 'direct' | 'relay' | string;
  connectionTypeDescription: string;
  activeStunTurnUrl: string;
  activeTrackerUrl?: string;
  localIp?: string;
  remoteIp?: string;
  protocol?: string;
  videoCodec?: string;
  audioCodec?: string;
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
}
