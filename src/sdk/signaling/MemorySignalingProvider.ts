import { ISignalingProvider, SignalingMessageHandler } from './ISignalingProvider';
import { SignalingMessage } from '../types';
import { SignalingError } from '../utils/Errors';

export class MemorySignalingBus {
  private static instance: MemorySignalingBus;
  private channels: Map<string, Set<MemorySignalingProvider>> = new Map();

  private constructor() {}

  public static getInstance(): MemorySignalingBus {
    if (!MemorySignalingBus.instance) {
      MemorySignalingBus.instance = new MemorySignalingBus();
    }
    return MemorySignalingBus.instance;
  }

  public join(roomId: string, provider: MemorySignalingProvider): void {
    if (!this.channels.has(roomId)) {
      this.channels.set(roomId, new Set());
    }
    this.channels.get(roomId)!.add(provider);
  }

  public leave(roomId: string, provider: MemorySignalingProvider): void {
    const room = this.channels.get(roomId);
    if (room) {
      room.delete(provider);
      if (room.size === 0) {
        this.channels.delete(roomId);
      }
    }
  }

  public broadcast(roomId: string, message: SignalingMessage, sender: MemorySignalingProvider): void {
    const room = this.channels.get(roomId);
    if (room) {
      room.forEach((provider) => {
        if (provider !== sender) {
          provider.receiveMessage(message);
        }
      });
    }
  }
}

export class MemorySignalingProvider implements ISignalingProvider {
  private connected: boolean = false;
  private currentRoomId?: string;
  private currentPeerId?: string;
  private messageHandlers: Set<SignalingMessageHandler> = new Set();
  private bus: MemorySignalingBus = MemorySignalingBus.getInstance();

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
    if (!this.connected) {
      throw new SignalingError('Cannot join room: provider not connected');
    }
    this.currentRoomId = roomId;
    this.currentPeerId = peerId;
    this.bus.join(roomId, this);

    // Broadcast peer-joined
    this.send({
      type: 'peer-joined',
      senderId: peerId,
      roomId,
      timestamp: Date.now()
    });
  }

  public async leaveRoom(roomId: string, peerId: string): Promise<void> {
    this.send({
      type: 'peer-left',
      senderId: peerId,
      roomId,
      timestamp: Date.now()
    });
    this.bus.leave(roomId, this);
    this.currentRoomId = undefined;
  }

  public async send(message: SignalingMessage): Promise<void> {
    if (!this.connected) {
      throw new SignalingError('Cannot send message: provider not connected');
    }
    const roomId = message.roomId || this.currentRoomId;
    if (roomId) {
      this.bus.broadcast(roomId, message, this);
    }
  }

  public receiveMessage(message: SignalingMessage): void {
    this.messageHandlers.forEach((handler) => handler(message));
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
