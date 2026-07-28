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
  private sessionTimer?: any;

  constructor(config: SDKConfig = {}) {
    this.config = {
      autoConnect: true,
      iceTransportPolicy: 'all',
      sessionTimeoutMs: 120000, // 2-minute unestablished session expiration window
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

    // Cancel session timer when peer connects
    this.events.on('connection-state-change', (state) => {
      if (state === 'connected') {
        this.cancelSessionTimer();
      }
    });
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

  public async connect(roomId: string, isHost: boolean = false): Promise<void> {
    const cleanRoomId = roomId.replace(/-/g, '').toLowerCase();

    // Close any previous transport instance cleanly before starting a new connection
    if (this.transport) {
      this.transport.close();
      this.transport = undefined;
    }

    // Generate fresh peerId for each session connection
    this.peerId = this.generatePeerId();
    this.currentRoomId = cleanRoomId;
    this.logger.info(`Connecting to room ${cleanRoomId} with peerId ${this.peerId}...`);

    await this.signalingProvider.connect(cleanRoomId);
    await this.signalingProvider.joinRoom(cleanRoomId, this.peerId);

    this.transport = new WebRTCTransport({
      peerId: this.peerId,
      roomId: cleanRoomId,
      iceServers: this.config.iceServers,
      iceTransportPolicy: this.config.iceTransportPolicy,
      preferredVideoCodec: this.config.preferredVideoCodec,
      signalingProvider: this.signalingProvider,
      eventEmitter: this.events,
    });

    await this.transport.initialize();

    // If host is waiting for a viewer, start the 2-minute unestablished session timeout
    if (isHost) {
      this.startSessionTimer();
    }

    // Attach active stream if already captured
    const activeStream = this.mediaManager.getActiveStream();
    if (activeStream) {
      this.transport.addStream(activeStream);
    }
  }

  public startSessionTimer(): void {
    this.cancelSessionTimer();
    const timeout = this.config.sessionTimeoutMs || 120000;
    this.logger.info(`Starting ${timeout / 1000}s session expiration timer...`);
    this.sessionTimer = setTimeout(() => {
      this.logger.info(`Session code window expired after ${timeout / 1000}s. Emitting session-expired for auto-rotation...`);
      this.events.emit('session-expired');
    }, timeout);
  }

  public cancelSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = undefined;
      this.logger.info('Session expiration timer cancelled');
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
    this.cancelSessionTimer();
    this.mediaManager.stopLocalStream();

    if (this.currentRoomId && this.signalingProvider.isConnected()) {
      try {
        await this.signalingProvider.send({
          type: 'peer-left',
          senderId: this.peerId,
          roomId: this.currentRoomId,
        });
      } catch (e) {
        // Ignore signaling errors during disconnect teardown
      }
    }

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
    let rawStr: string;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      rawStr = crypto.randomUUID().replace(/-/g, '');
    } else {
      rawStr = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    }
    const part1 = rawStr.substring(0, 4).toLowerCase();
    const part2 = rawStr.substring(4, 8).toLowerCase();
    return `${part1}-${part2}`;
  }

  private generatePeerId(): string {
    return `peer_${Math.random().toString(36).substring(2, 9)}`;
  }
}
