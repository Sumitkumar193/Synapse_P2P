export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface SDKConfig {
  peerId?: string;
  roomId?: string;
  iceServers?: IceServerConfig[];
  iceTransportPolicy?: 'all' | 'relay';
  preferredVideoCodec?: 'H264' | 'VP8' | 'VP9' | 'AV1';
  sessionTimeoutMs?: number; // Expiration window for unestablished host sessions (default: 120000ms = 2 mins)
  autoConnect?: boolean;
  debug?: boolean;
}
