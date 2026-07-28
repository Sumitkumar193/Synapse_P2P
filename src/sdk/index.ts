import { SDKConfig, DesktopSource, ScreenCaptureOptions } from './types';
import { TypedEventEmitter } from './events/EventEmitter';
import { SDKEventMap } from './events/events';
import { ISignalingProvider, MemorySignalingProvider, IPCSignalingProvider } from './signaling';
import { MediaManager } from './media/MediaManager';
import { WebRTCTransport } from './transport/WebRTCTransport';
import { Logger } from './utils/Logger';

export * from './types';
export * from './events/EventEmitter';
export * from './events/events';
export * from './signaling';
export * from './media/MediaManager';
export * from './transport/WebRTCTransport';
export * from './utils/Logger';
export * from './utils/Errors';

export class P2PMediaSDK {
  public events: TypedEventEmitter<SDKEventMap> = new TypedEventEmitter();
  public mediaManager: MediaManager = new MediaManager();
  public signaling: ISignalingProvider;
  public transport?: WebRTCTransport;
  
  private config: SDKConfig;
  private logger: Logger;
  private peerId: string;
  private roomId?: string;

  constructor(config: SDKConfig = {}) {
    this.config = config;
    this.peerId = config.peerId || `peer-${Math.random().toString(36).substring(2, 9)}`;
    this.logger = new Logger(`P2PMediaSDK[${this.peerId}]`);
    
    // Default to IPCSignalingProvider in Electron environments, else MemorySignalingProvider
    if (typeof window !== 'undefined' && window.electronAPI?.signaling) {
      this.signaling = new IPCSignalingProvider();
    } else {
      this.signaling = new MemorySignalingProvider();
    }

    this.setupSignalingAutoConnect();
  }

  private setupSignalingAutoConnect(): void {
    this.signaling.onMessage(async (msg) => {
      if (msg.type === 'peer-joined' && msg.senderId !== this.peerId) {
        this.events.emit('peer-joined', msg.senderId);
        const activeStream = this.mediaManager.getActiveStream();
        if (activeStream && this.transport) {
          this.logger.info(`Auto-initiating WebRTC connection to peer ${msg.senderId}`);
          this.transport.addStream(activeStream);
          await this.connectToPeer(msg.senderId);
        }
      } else if (msg.type === 'peer-left') {
        this.events.emit('peer-left', msg.senderId);
      }
    });
  }

  public setSignalingProvider(provider: ISignalingProvider): void {
    this.signaling = provider;
    this.setupSignalingAutoConnect();
  }

  public async connect(roomId: string, signalingUrl?: string): Promise<void> {
    this.roomId = roomId;
    this.logger.info(`Connecting to room ${roomId}...`);

    if (!this.signaling.isConnected()) {
      await this.signaling.connect(signalingUrl);
    }

    this.transport = new WebRTCTransport({
      peerId: this.peerId,
      roomId: this.roomId,
      iceServers: this.config.iceServers,
      signalingProvider: this.signaling,
      eventEmitter: this.events,
    });

    await this.signaling.joinRoom(roomId, this.peerId);
  }

  public async getDesktopSources(types: ('screen' | 'window')[] = ['screen', 'window']): Promise<DesktopSource[]> {
    return await this.mediaManager.getDesktopSources(types);
  }

  public async startScreenShare(options: ScreenCaptureOptions): Promise<MediaStream> {
    const stream = await this.mediaManager.captureScreen(options);
    if (this.transport) {
      this.transport.addStream(stream);
    }
    return stream;
  }

  public async connectToPeer(targetPeerId: string): Promise<void> {
    if (!this.transport) {
      throw new Error('SDK is not connected to a room. Call connect() first.');
    }
    await this.transport.createOffer(targetPeerId);
  }

  public sendData(data: string | ArrayBuffer): void {
    if (!this.transport) {
      throw new Error('Transport not initialized');
    }
    this.transport.sendData(data);
  }

  public async disconnect(): Promise<void> {
    if (this.transport) {
      this.transport.close();
      this.transport = undefined;
    }
    if (this.roomId) {
      await this.signaling.leaveRoom(this.roomId, this.peerId);
    }
    await this.signaling.disconnect();
    this.mediaManager.stopLocalStream();
    this.logger.info('Disconnected SDK');
  }

  public getPeerId(): string {
    return this.peerId;
  }

  public generateSessionCode(): string {
    const num = Math.floor(100000 + Math.random() * 900000);
    return `${num.toString().substring(0, 3)}-${num.toString().substring(3, 6)}`;
  }
}
