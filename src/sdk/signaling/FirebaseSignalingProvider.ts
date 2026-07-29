import { ISignalingProvider, SignalingMessageHandler } from './ISignalingProvider';
import { SignalingMessage } from '../types';
import { Logger } from '../utils/Logger';

export interface FirebaseSignalingConfig {
  databaseURL: string;
  apiKey?: string;
}

export class FirebaseSignalingProvider implements ISignalingProvider {
  private databaseURL: string;
  private currentRoomId?: string;
  private currentPeerId?: string;
  private connected: boolean = false;
  private messageHandlers: Set<SignalingMessageHandler> = new Set();
  private eventSource?: any;
  private pollInterval?: any;
  private processedMessageKeys: Set<string> = new Set();
  private logger: Logger = new Logger('FirebaseSignalingProvider');

  constructor(config: FirebaseSignalingConfig) {
    this.databaseURL = config.databaseURL.replace(/\/$/, '');
  }

  public async connect(roomId?: string): Promise<void> {
    this.connected = true;
    this.logger.info(`Connected to Firebase Realtime Database signaling (${this.databaseURL})`);
  }

  public async joinRoom(roomId: string, peerId: string): Promise<void> {
    this.currentRoomId = roomId;
    this.currentPeerId = peerId;
    this.connected = true;

    const streamUrl = `${this.databaseURL}/rooms/${roomId}/messages.json`;

    const handleFirebaseEvent = (eventData: string) => {
      try {
        const payload = JSON.parse(eventData);
        if (!payload || payload.data === undefined || payload.data === null) return;

        const data = payload.data;

        const STALE_TTL_MS = 30000;

        // Case A: Single POSTed message child (Firebase 'put' event on path '/-NyZ...')
        if (data.type && data.senderId) {
          const msg = data as SignalingMessage;
          const isStale = msg.timestamp && (Date.now() - msg.timestamp > STALE_TTL_MS);
          const msgKey = `${msg.type}_${msg.senderId}_${msg.timestamp}`;
          if (!isStale && msg.senderId !== this.currentPeerId && !this.processedMessageKeys.has(msgKey)) {
            this.processedMessageKeys.add(msgKey);
            this.logger.info(`📩 Received Firebase SSE message [type=${msg.type}] from peer ${msg.senderId}`);
            this.messageHandlers.forEach((handler) => handler(msg));
          }
        }
        // Case B: Full room dictionary on initial SSE connect (path '/')
        else if (typeof data === 'object') {
          Object.entries(data).forEach(([key, item]: [string, any]) => {
            if (item && item.type && item.senderId) {
              const msg = item as SignalingMessage;
              const isStale = msg.timestamp && (Date.now() - msg.timestamp > STALE_TTL_MS);
              const msgKey = `${msg.type}_${msg.senderId}_${msg.timestamp}`;
              if (!isStale && msg.senderId !== this.currentPeerId && !this.processedMessageKeys.has(msgKey)) {
                this.processedMessageKeys.add(msgKey);
                this.logger.info(`📩 Received Firebase snapshot message [type=${msg.type}] from peer ${msg.senderId}`);
                this.messageHandlers.forEach((handler) => handler(msg));
              }
            }
          });
        }
      } catch (err: any) {
        this.logger.debug('Non-critical SSE parse notice:', err?.message || err);
      }
    };

    if (typeof EventSource !== 'undefined') {
      try {
        this.eventSource = new EventSource(streamUrl);
        
        // Listen to Firebase SSE 'put', 'patch', and 'message' events
        this.eventSource.addEventListener('put', (evt: any) => handleFirebaseEvent(evt.data));
        this.eventSource.addEventListener('patch', (evt: any) => handleFirebaseEvent(evt.data));
        this.eventSource.onmessage = (evt: any) => handleFirebaseEvent(evt.data);

        this.eventSource.onerror = (err: any) => {
          this.logger.warn('Firebase EventSource SSE stream notice, fallback active', err);
        };
      } catch (e) {
        this.logger.warn('EventSource SSE stream failed to initialize', e);
      }
    }

    // Polling backup (runs every 1.5s to ensure zero message loss even behind strict proxies)
    this.startPollingBackup(roomId);

    // Notify room that peer joined
    await this.send({
      type: 'peer-joined',
      senderId: peerId,
      roomId,
      timestamp: Date.now(),
    });
  }

  private startPollingBackup(roomId: string): void {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(async () => {
      if (!this.connected || !this.currentRoomId) return;
      const url = `${this.databaseURL}/rooms/${roomId}/messages.json`;

      try {
        if (typeof fetch !== 'undefined') {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data === 'object') {
              Object.values(data).forEach((item: any) => {
                if (item && item.type && item.senderId) {
                  const msg = item as SignalingMessage;
                  const isStale = msg.timestamp && (Date.now() - msg.timestamp > 30000);
                  const msgKey = `${msg.type}_${msg.senderId}_${msg.timestamp}`;
                  if (!isStale && msg.senderId !== this.currentPeerId && !this.processedMessageKeys.has(msgKey)) {
                    this.processedMessageKeys.add(msgKey);
                    this.logger.info(`📩 Received Firebase polled message [type=${msg.type}] from peer ${msg.senderId}`);
                    this.messageHandlers.forEach((handler) => handler(msg));
                  }
                }
              });
            }
          }
        }
      } catch {
        // Silent polling catch
      }
    }, 1500);
  }

  public async send(message: SignalingMessage): Promise<void> {
    if (!this.currentRoomId) return;
    const url = `${this.databaseURL}/rooms/${this.currentRoomId}/messages.json`;

    try {
      this.logger.info(`📤 Posting Firebase message [type=${message.type}] from ${message.senderId}`);
      if (typeof fetch !== 'undefined') {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
      }
    } catch (err: any) {
      this.logger.error('Failed to post Firebase signaling message:', err?.message || err);
    }
  }

  public async leaveRoom(roomId: string, peerId: string): Promise<void> {
    await this.send({
      type: 'peer-left',
      senderId: peerId,
      roomId,
      timestamp: Date.now(),
    });
    await this.disconnect();
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

  public async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
    this.connected = false;
    this.currentRoomId = undefined;
    this.currentPeerId = undefined;
    this.processedMessageKeys.clear();
    this.logger.info('Disconnected from Firebase signaling');
  }
}
