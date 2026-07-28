export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface SDKConfig {
  peerId?: string;
  roomId?: string;
  iceServers?: IceServerConfig[];
  autoConnect?: boolean;
  debug?: boolean;
}
