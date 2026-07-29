import { ISignalingProvider, SignalingMessageHandler } from './ISignalingProvider';
import { SignalingMessage } from '../types';
import { Logger } from '../utils/Logger';

export interface WebTorrentTrackerOptions {
  trackerUrls?: string[];
}

export class WebTorrentSignalingProvider implements ISignalingProvider {
  private sockets: Map<string, WebSocket> = new Map();
  private connected: boolean = false;
  private messageHandlers: Set<SignalingMessageHandler> = new Set();
  private processedMessageKeys: Set<string> = new Set();
  private currentRoomId?: string;
  private currentPeerId?: string;
  private trackerUrls: string[];
  private activeTrackerUrl: string = 'Multi-Tracker Mesh';
  private logger: Logger = new Logger('WebTorrentSignalingProvider');

  constructor(options: WebTorrentTrackerOptions = {}) {
    this.trackerUrls = options.trackerUrls || [
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
      'wss://tracker.files.fm:7072/announce',
    ];
  }

  public async connect(trackerUrl?: string): Promise<void> {
    const urlsToTry = trackerUrl ? [trackerUrl, ...this.trackerUrls] : this.trackerUrls;
    let connectedCount = 0;

    // Connect to ALL available WebTorrent tracker WebSockets simultaneously to form a multi-tracker mesh
    await Promise.all(
      urlsToTry.map(async (url) => {
        try {
          await this.connectToUrl(url);
          connectedCount++;
        } catch (err: any) {
          this.logger.warn(`Tracker ${url} connection failed: ${err?.message || err}`);
        }
      })
    );

    if (connectedCount > 0) {
      this.connected = true;
      this.activeTrackerUrl = `WebTorrent Multi-Tracker Mesh (${connectedCount} Active)`;
      this.logger.info(`🟢 Connected to ${connectedCount}/${urlsToTry.length} WebTorrent trackers simultaneously`);
    } else {
      this.logger.warn('All WebTorrent trackers unreachable. Operating in local loopback mode.');
      this.activeTrackerUrl = 'Local Loopback';
      this.connected = true;
    }
  }

  private connectToUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        const timeout = setTimeout(() => {
          try { ws.close(); } catch {}
          reject(new Error(`Timeout connecting to ${url}`));
        }, 3000);

        ws.onopen = () => {
          clearTimeout(timeout);
          this.sockets.set(url, ws);
          this.setupSocketListeners(url, ws);
          resolve();
        };

        ws.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public getActiveTrackerUrl(): string {
    return this.activeTrackerUrl;
  }

  private setupSocketListeners(url: string, socket: WebSocket): void {
    socket.onclose = () => {
      this.sockets.delete(url);
      if (this.sockets.size === 0) {
        this.connected = false;
      }
      this.logger.info(`WebTorrent tracker socket [${url}] closed`);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        let msg: SignalingMessage | null = null;

        if (data.action === 'announce' && data.offer) {
          msg = {
            type: data.offer.type || 'offer',
            senderId: data.peer_id || 'remote-peer',
            roomId: this.currentRoomId,
            payload: data.offer,
            timestamp: data.offer.timestamp,
          };
        } else if (data.offer || data.answer || data.candidate || data.type) {
          msg = data as SignalingMessage;
        }

        if (msg && msg.senderId && msg.type) {
          const msgKey = `${msg.type}_${msg.senderId}_${msg.timestamp || 0}`;
          if (msg.senderId !== this.currentPeerId && !this.processedMessageKeys.has(msgKey)) {
            this.processedMessageKeys.add(msgKey);
            this.logger.info(`📩 Received WebTorrent message [type=${msg.type}] via tracker [${url}]`);
            this.messageHandlers.forEach((handler) => handler(msg!));
          }
        }
      } catch (err) {
        // Ignore non-JSON tracker keepalive signals
      }
    };
  }

  public async disconnect(): Promise<void> {
    this.sockets.forEach((socket) => {
      try { socket.close(); } catch {}
    });
    this.sockets.clear();
    this.connected = false;
  }

  public async joinRoom(roomId: string, peerId: string): Promise<void> {
    this.currentRoomId = roomId;
    this.currentPeerId = peerId;

    const infoHash = this.hashString(roomId);
    const formattedPeerId = this.hashString(peerId);

    const announceMsg = JSON.stringify({
      action: 'announce',
      info_hash: infoHash,
      peer_id: formattedPeerId,
      numwant: 10,
      uploaded: 0,
      downloaded: 0,
      left: 0,
      event: 'started',
    });

    // Broadcast announce across ALL open tracker sockets simultaneously
    this.sockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(announceMsg);
      }
    });

    // Broadcast peer-joined across all open tracker sockets
    await this.send({
      type: 'peer-joined',
      senderId: peerId,
      roomId,
      timestamp: Date.now(),
    });
  }

  public async leaveRoom(roomId: string, peerId: string): Promise<void> {
    const infoHash = this.hashString(roomId);
    const formattedPeerId = this.hashString(peerId);

    const announceMsg = JSON.stringify({
      action: 'announce',
      info_hash: infoHash,
      peer_id: formattedPeerId,
      event: 'stopped',
    });

    this.sockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(announceMsg);
      }
    });

    this.currentRoomId = undefined;
  }

  public async send(message: SignalingMessage): Promise<void> {
    const payload = JSON.stringify({
      action: 'announce',
      info_hash: this.hashString(message.roomId || this.currentRoomId || 'default'),
      peer_id: this.hashString(message.senderId),
      offer: message,
    });

    let sent = false;
    this.sockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
        sent = true;
      }
    });

    if (!sent) {
      // Fallback local broadcast if no sockets are open
      this.messageHandlers.forEach((handler) => handler(message));
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

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return (hex + hex + hex + hex + hex).substring(0, 40);
  }
}
