import { SDKConfig, DesktopSource, ScreenCaptureOptions } from './types';
import { TypedEventEmitter } from './events/EventEmitter';
import { SDKEventMap } from './events/events';
import { MediaManager } from './media/MediaManager';
import { WebRTCTransport } from './transport/WebRTCTransport';
import {
  ISignalingProvider,
  IPCSignalingProvider,
  WebTorrentSignalingProvider,
  FirebaseSignalingProvider,
  WebSocketSignalingProvider,
  MemorySignalingProvider,
  FallbackSignalingProvider,
} from './signaling';
import { Session } from './session/Session';
import { Logger } from './utils/Logger';

export * from './types';
export * from './events/events';
export * from './utils/Errors';
export * from './session';
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
  private currentSession?: Session;
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

    // Priority Signaling Cascade: Firebase > WebSockets > WebTorrents > Electron IPC > Memory
    if (this.config.signalingProvider) {
      this.signalingProvider = this.config.signalingProvider;
    } else {
      const providers: { name: string; provider: ISignalingProvider }[] = [];

      // Safe environment variable access across Node.js & Browser runtimes
      const env = typeof process !== 'undefined' && process.env ? process.env : {};

      // Priority 1: Firebase Realtime Database
      const firebaseDbUrl = env.FIREBASE_DATABASE_URL || 'https://synapse-p2p-default-rtdb.asia-southeast1.firebasedatabase.app';
      if (firebaseDbUrl) {
        providers.push({
          name: 'Firebase',
          provider: new FirebaseSignalingProvider({ databaseURL: firebaseDbUrl }),
        });
      }

      // Priority 2: WebSockets
      if (env.SIGNALING_URL) {
        providers.push({
          name: 'WebSocket',
          provider: new WebSocketSignalingProvider(),
        });
      }

      // Priority 3: WebTorrent Trackers
      providers.push({
        name: 'WebTorrent',
        provider: new WebTorrentSignalingProvider(),
      });

      // Priority 4: Electron IPC
      if (typeof window !== 'undefined' && (window as any).electronAPI?.signaling) {
        providers.push({
          name: 'Electron-IPC',
          provider: new IPCSignalingProvider(),
        });
      }

      // Priority 5: Memory Fallback
      providers.push({
        name: 'Memory',
        provider: new MemorySignalingProvider(),
      });

      this.signalingProvider = new FallbackSignalingProvider(providers);
    }

    // Cancel session timer and capture remote peer id when peer connects
    this.events.on('connection-state-change', (state) => {
      if (state === 'connected') {
        this.cancelSessionTimer();
      }
    });

    this.events.on('track-added', (_track, _stream, peerId) => {
      if (this.currentSession && peerId) {
        this.currentSession.setRemotePeerId(peerId);
      }
    });
  }

  public session(): Session | null {
    return this.currentSession || null;
  }

  public getSession(): Session | null {
    return this.session();
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

  public async connect(roomId: string, isHost: boolean = false): Promise<Session> {
    const cleanRoomId = roomId.replace(/-/g, '').toLowerCase();

    // Close any previous transport instance cleanly before starting a new connection
    if (this.transport) {
      this.transport.close();
      this.transport = undefined;
      this.currentSession = undefined;
    }

    // Generate fresh peerId for each session connection
    this.peerId = this.generatePeerId();
    this.currentRoomId = cleanRoomId;
    this.logger.info(`Connecting to room ${cleanRoomId} with peerId ${this.peerId}...`);

    await this.signalingProvider.connect(cleanRoomId);
    await this.signalingProvider.joinRoom(cleanRoomId, this.peerId, isHost);

    this.transport = new WebRTCTransport({
      peerId: this.peerId,
      roomId: cleanRoomId,
      isHost,
      iceServers: this.config.iceServers,
      iceTransportPolicy: this.config.iceTransportPolicy,
      preferredVideoCodec: this.config.preferredVideoCodec,
      signalingProvider: this.signalingProvider,
      eventEmitter: this.events,
    });

    this.currentSession = new Session({
      roomId: cleanRoomId,
      peerId: this.peerId,
      mediaProvider: this.mediaManager,
      transportProvider: () => this.transport,
      signalingProvider: this.signalingProvider,
      trackerUrlProvider: () => this.getActiveTrackerUrl(),
      eventEmitter: this.events,
      onDisconnectHandler: async () => {
        await this.disconnect();
      },
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

    return this.currentSession;
  }

  public async publishMicrophone(): Promise<MediaStreamTrack | null> {
    try {
      const micTrack = await this.mediaManager.captureMicrophone({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      micTrack.contentHint = 'speech';

      let activeStream = this.mediaManager.getActiveStream();
      if (!activeStream) {
        activeStream = new MediaStream([micTrack]);
      } else if (!activeStream.getAudioTracks().includes(micTrack)) {
        activeStream.addTrack(micTrack);
      }

      if (this.transport) {
        this.transport.addStream(activeStream);
      }
      return micTrack;
    } catch (err) {
      this.logger.warn('Failed to publish microphone track:', err);
      return null;
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
    if (this.currentSession) {
      return await this.currentSession.stats.getStats();
    }
    const stats = this.transport ? await this.transport.getConnectionStats() : null;
    return {
      ...stats,
      activeTrackerUrl: this.getActiveTrackerUrl(),
    };
  }

  public getActiveSignalingProviderName(): string {
    if (this.signalingProvider && typeof (this.signalingProvider as any).getActiveProviderName === 'function') {
      return (this.signalingProvider as any).getActiveProviderName();
    }
    return 'Default Cascade';
  }



  public async checkSignalingHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {
      firebase: false,
      websocket: false,
      webtorrent: true,
      ipc: typeof window !== 'undefined' && !!(window as any).electronAPI?.signaling,
      memory: true,
    };

    const env = typeof process !== 'undefined' && process.env ? process.env : {};

    // Probe Firebase Realtime DB (HTTPS shallow GET)
    try {
      const firebaseDbUrl = env.FIREBASE_DATABASE_URL || 'https://synapse-p2p-default-rtdb.asia-southeast1.firebasedatabase.app';
      if (typeof fetch !== 'undefined') {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${firebaseDbUrl}/.json?shallow=true`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        health.firebase = res.ok;
      }
    } catch {
      health.firebase = false;
    }

    // Probe WebSocket Server (WSS)
    const wsUrl = env.SIGNALING_URL;
    if (wsUrl && typeof WebSocket !== 'undefined') {
      try {
        await new Promise((resolve) => {
          const socket = new WebSocket(wsUrl);
          const timeout = setTimeout(() => {
            try { socket.close(); } catch {}
            resolve(false);
          }, 1500);

          socket.onopen = () => {
            clearTimeout(timeout);
            health.websocket = true;
            try { socket.close(); } catch {}
            resolve(true);
          };

          socket.onerror = () => {
            clearTimeout(timeout);
            health.websocket = false;
            resolve(false);
          };
        });
      } catch {
        health.websocket = false;
      }
    }

    // Probe WebTorrent Tracker WebSocket
    health.webtorrent = false;
    const trackers = [
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
      'wss://tracker.files.fm:7072/announce',
    ];

    if (typeof WebSocket !== 'undefined') {
      for (const trackerUrl of trackers) {
        try {
          const isAlive = await new Promise<boolean>((resolve) => {
            const socket = new WebSocket(trackerUrl);
            const timeout = setTimeout(() => {
              try { socket.close(); } catch {}
              resolve(false);
            }, 1800);

            socket.onopen = () => {
              clearTimeout(timeout);
              try { socket.close(); } catch {}
              resolve(true);
            };

            socket.onerror = () => {
              clearTimeout(timeout);
              resolve(false);
            };
          });

          if (isAlive) {
            health.webtorrent = true;
            (health as any).activeTrackerUrl = trackerUrl;
            break;
          }
        } catch {
          // Try next tracker
        }
      }
    }

    return health;
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
    this.currentSession = undefined;

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
