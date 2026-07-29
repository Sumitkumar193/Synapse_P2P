import { ConnectionStats } from '../WebRTCTransport';

export interface ITransportProvider {
  initialize(): Promise<void>;
  addStream(stream: MediaStream): void;
  sendData(data: string | ArrayBuffer | Uint8Array): void;
  getRemoteStream(): MediaStream | null;
  getConnectionStats(): Promise<ConnectionStats | null>;
  restartIce(): Promise<void>;
  close(): void;
}
