import { SignalingMessage } from '../types';

export type SignalingMessageHandler = (message: SignalingMessage) => void;

export interface ISignalingProvider {
  connect(url?: string): Promise<void>;
  disconnect(): Promise<void>;
  joinRoom(roomId: string, peerId: string): Promise<void>;
  leaveRoom(roomId: string, peerId: string): Promise<void>;
  send(message: SignalingMessage): Promise<void>;
  onMessage(handler: SignalingMessageHandler): void;
  offMessage(handler: SignalingMessageHandler): void;
  isConnected(): boolean;
}
