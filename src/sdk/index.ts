import { SDKConfig, DesktopSource, ScreenCaptureOptions } from './types';
import { TypedEventEmitter } from './events/EventEmitter';
import { SDKEventMap } from './events/events';
import { MediaManager } from './media/MediaManager';
import { WebRTCTransport } from './transport/WebRTCTransport';
import { ISignalingProvider, IPCSignalingProvider, WebTorrentSignalingProvider } from './signaling';
import { Logger } from './utils/Logger';

export * from './types';
export * from './events/events';
export * from './utils/Errors';
export { MediaManager } from './media/MediaManager';
export { WebRTCTransport } from './transport/WebRTCTransport';
export * from './signaling';

export class P2PMediaSDK {
  public readonly events: TypedEventEmitter<SDKEventMap>;
  private mediaManager: MediaManager;
  private transport?: WebRTCTransport;
  private signalingProvider: ISignalingProvider;
  private config: SDKConfig;
  private logger: Logger;
  private peerId: string;
  private currentRoomId?: string;

  constructor(config: SDKConfig = {}) {
    this.config = {
      autoConnect: true,
      iceServers: [
        // Cloudflare STUN Server (Ultra-fast Global Anycast IP Discovery)
        { urls: 'stun:stun.cloudflare.com:3478' },

        // Google STUN Servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },

        // Metered STUN Server
        { urls: 'stun:openrelay.metered.ca:80' },

        // Free OpenRelay TURN Fallback Relays (UDP & TCP for Firewalls)
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelay',
          credential: 'openrelay',
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelay',
          credential: 'openrelay',
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelay',
          credential: 'openrelay',
        },
      ],
      ...config,
    };

    this.events = new TypedEventEmitter<SDKEventMap>();
    this.mediaManager = new MediaManager();
    this.logger = new Logger('P2PMediaSDK');
    this.peerId = this.generatePeerId();

    // Default to Electron IPC signaling provider if in Electron environment, else WebTorrent
    if (typeof window !== 'undefined' && window.electronAPI?.signaling) {
      this.signalingProvider = new IPCSignalingProvider();
    } else {
      this.signalingProvider = new WebTorrentSignalingProvider();
    }
  }

  public async getDesktopSources(types: ('screen' | 'window')[] = ['screen', 'window']): Promise<DesktopSource[]> {
    return this.mediaManager.getDesktopSources(types);
  }

  public async startScreenShare(options: ScreenCaptureOptions): Promise<MediaStream> {
    const stream = await this.mediaManager.captureScreen(options);
    if (this.transport) {
      this.transport.addStream(stream);
    }
    return stream;
  }

  public async connect(roomId: string): Promise<void> {
    this.currentRoomId = roomId;
    this.logger.info(`Connecting to room ${roomId} with peerId ${this.peerId}...`);

    await this.signalingProvider.connect(roomId);
    await this.signalingProvider.joinRoom(roomId, this.peerId);

    this.transport = new WebRTCTransport({
      peerId: this.peerId,
      roomId: roomId,
      iceServers: this.config.iceServers,
      signalingProvider: this.signalingProvider,
      eventEmitter: this.events,
    });

    await this.transport.initialize();

    // Attach active stream if already captured
    const activeStream = this.mediaManager.getActiveStream();
    if (activeStream) {
      this.transport.addStream(activeStream);
    }
  }

  public getActiveTrackerUrl(): string {
    if (this.signalingProvider && (this.signalingProvider as any).getActiveTrackerUrl) {
      return (this.signalingProvider as any).getActiveTrackerUrl();
    }
    return 'Electron IPC Bus';
  }

  public async getConnectionStats() {
    const stats = this.transport ? await this.transport.getConnectionStats() : null;
    return {
      ...stats,
      activeTrackerUrl: this.getActiveTrackerUrl(),
    };
  }

  public async disconnect(): Promise<void> {
    this.mediaManager.stopLocalStream();
    if (this.transport) {
      this.transport.close();
      this.transport = undefined;
    }
    if (this.currentRoomId) {
      await this.signalingProvider.disconnect();
      this.currentRoomId = undefined;
    }
    this.logger.info('Disconnected session');
  }

  public generateSessionCode(): string {
    const part1 = Math.floor(100 + Math.random() * 900);
    const part2 = Math.floor(100 + Math.random() * 900);
    return `${part1}-${part2}`;
  }

  private generatePeerId(): string {
    return `peer_${Math.random().toString(36).substring(2, 9)}`;
  }
}
