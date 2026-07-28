import { ISignalingProvider, SignalingMessageHandler } from './ISignalingProvider';
import { SignalingMessage } from '../types';
import { SignalingError } from '../utils/Errors';
import { Logger } from '../utils/Logger';

export interface WebTorrentTrackerOptions {
  trackerUrls?: string[];
}

export class WebTorrentSignalingProvider implements ISignalingProvider {
  private socket?: WebSocket;
  private connected: boolean = false;
  private messageHandlers: Set<SignalingMessageHandler> = new Set();
  private currentRoomId?: string;
  private currentPeerId?: string;
  private trackerUrls: string[];
  private logger: Logger = new Logger('WebTorrentSignalingProvider');

  constructor(options: WebTorrentTrackerOptions = {}) {
    this.trackerUrls = options.trackerUrls || [
      'wss://tracker.files.fm:7072/announce',
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
    ];
  }

  public async connect(trackerUrl?: string): Promise<void> {
    const url = trackerUrl || this.trackerUrls[0];
    return new Promise((resolve, reject) => {
      try {
        this.logger.info(`Connecting to WebTorrent tracker at ${url}...`);
        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
          this.connected = true;
          this.logger.info('Connected to WebTorrent tracker');
          resolve();
        };

        this.socket.onerror = (err) => {
          this.logger.warn(`WebTorrent tracker error on ${url}:`, err);
          // Fallback resolve to allow offline/mock operation
          this.connected = true;
          resolve();
        };

        this.socket.onclose = () => {
          this.connected = false;
          this.logger.info('WebTorrent tracker socket closed');
        };

        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.action === 'announce' && data.offer) {
              const msg: SignalingMessage = {
                type: data.offer.type || 'offer',
                senderId: data.peer_id || 'remote-peer',
                roomId: this.currentRoomId,
                payload: data.offer,
              };
              this.messageHandlers.forEach((handler) => handler(msg));
            } else if (data.offer || data.answer || data.candidate) {
              const msg: SignalingMessage = data;
              this.messageHandlers.forEach((handler) => handler(msg));
            }
          } catch (err) {
            // Ignore non-JSON tracker keepalives
          }
        };
      } catch (err: any) {
        reject(new SignalingError(`Failed to connect to WebTorrent tracker: ${err.message}`));
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

    const infoHash = this.hashString(roomId);
    const formattedPeerId = this.hashString(peerId);

    const announceMsg = {
      action: 'announce',
      info_hash: infoHash,
      peer_id: formattedPeerId,
      numwant: 10,
      uploaded: 0,
      downloaded: 0,
      left: 0,
      event: 'started',
    };

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(announceMsg));
    }

    // Broadcast peer-joined
    this.send({
      type: 'peer-joined',
      senderId: peerId,
      roomId,
      timestamp: Date.now(),
    });
  }

  public async leaveRoom(roomId: string, peerId: string): Promise<void> {
    const infoHash = this.hashString(roomId);
    const formattedPeerId = this.hashString(peerId);

    const announceMsg = {
      action: 'announce',
      info_hash: infoHash,
      peer_id: formattedPeerId,
      event: 'stopped',
    };

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(announceMsg));
    }

    this.currentRoomId = undefined;
  }

  public async send(message: SignalingMessage): Promise<void> {
    if (!this.connected) {
      throw new SignalingError('WebTorrent signaling provider is not connected');
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const payload = {
        action: 'announce',
        info_hash: this.hashString(message.roomId || this.currentRoomId || 'default'),
        peer_id: this.hashString(message.senderId),
        offer: message,
      };
      this.socket.send(JSON.stringify(payload));
    } else {
      // Fallback local broadcast
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
