import { ConnectionState, DesktopSource } from '../types';

export interface SDKEventMap {
  'connection-state-change': (state: ConnectionState) => void;
  'peer-joined': (peerId: string) => void;
  'peer-left': (peerId: string) => void;
  'track-added': (track: MediaStreamTrack, stream: MediaStream, peerId: string) => void;
  'track-removed': (track: MediaStreamTrack, peerId: string) => void;
  'sources-updated': (sources: DesktopSource[]) => void;
  'error': (error: Error) => void;
  'data-message': (data: string | ArrayBuffer, peerId: string) => void;
}
