import { ISignalingProvider, SignalingMessageHandler } from './ISignalingProvider';
import { SignalingMessage } from '../types';
import { SignalingError } from '../utils/Errors';

export class WebSocketSignalingProvider implements ISignalingProvider {
  private socket?: WebSocket;
  private connected: boolean = false;
  private messageHandlers: Set<SignalingMessageHandler> = new Set();
  private currentRoomId?: string;
  private currentPeerId?: string;

  public async connect(url: string = 'ws://localhost:8080'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(url);
        this.socket.onopen = () => {
          this.connected = true;
          resolve();
        };
        this.socket.onerror = (evt) => {
          reject(new SignalingError(`WebSocket connection error to ${url}`));
        };
        this.socket.onclose = () => {
          this.connected = false;
        };
        this.socket.onmessage = (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data);
            this.messageHandlers.forEach((handler) => handler(message));
          } catch (err) {
            console.error('Failed to parse signaling message JSON:', err);
          }
        };
      } catch (err: any) {
        reject(new SignalingError(`Failed to initialize WebSocket: ${err.message}`));
      }
    });
  }

  public async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
    this.connected = false;
  }

  public async joinRoom(roomId: string, peerId: string): Promise<void> {
    this.currentRoomId = roomId;
    this.currentPeerId = peerId;
    await this.send({
      type: 'join',
      senderId: peerId,
      roomId,
      timestamp: Date.now(),
    });
  }

  public async leaveRoom(roomId: string, peerId: string): Promise<void> {
    await this.send({
      type: 'leave',
      senderId: peerId,
      roomId,
      timestamp: Date.now(),
    });
    this.currentRoomId = undefined;
  }

  public async send(message: SignalingMessage): Promise<void> {
    if (!this.connected || !this.socket) {
      throw new SignalingError('WebSocket signaling provider is not connected');
    }
    this.socket.send(JSON.stringify(message));
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
