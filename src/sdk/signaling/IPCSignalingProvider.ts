import { ISignalingProvider, SignalingMessageHandler } from './ISignalingProvider';
import { SignalingMessage } from '../types';
import { SignalingError } from '../utils/Errors';

export class IPCSignalingProvider implements ISignalingProvider {
  private connected: boolean = false;
  private currentRoomId?: string;
  private currentPeerId?: string;
  private messageHandlers: Set<SignalingMessageHandler> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && window.electronAPI?.signaling) {
      window.electronAPI.signaling.onMessage((message: SignalingMessage) => {
        this.messageHandlers.forEach((handler) => handler(message));
      });
    }
  }

  public async connect(): Promise<void> {
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    if (this.currentRoomId && this.currentPeerId) {
      await this.leaveRoom(this.currentRoomId, this.currentPeerId);
    }
    this.connected = false;
  }

  public async joinRoom(roomId: string, peerId: string): Promise<void> {
    this.currentRoomId = roomId;
    this.currentPeerId = peerId;

    if (typeof window !== 'undefined' && window.electronAPI?.signaling) {
      window.electronAPI.signaling.joinRoom(roomId, peerId);
    } else {
      throw new SignalingError('IPC signaling not available');
    }
  }

  public async leaveRoom(roomId: string, peerId: string): Promise<void> {
    if (typeof window !== 'undefined' && window.electronAPI?.signaling) {
      window.electronAPI.signaling.leaveRoom(roomId, peerId);
    }
    this.currentRoomId = undefined;
  }

  public async send(message: SignalingMessage): Promise<void> {
    if (!this.connected) {
      throw new SignalingError('IPC signaling provider not connected');
    }
    if (typeof window !== 'undefined' && window.electronAPI?.signaling) {
      window.electronAPI.signaling.sendMessage(message);
    }
  }

  public onMessage(handler: SignalingMessageHandler): void {
    this.messageHandlers.add(handler);
  }

  public offMessage(handler: SignalingMessageHandler): void {
    this.messageHandlers.delete(handler);
  }

  public isConnected(): boolean {
    return this.connected;
  }
}
