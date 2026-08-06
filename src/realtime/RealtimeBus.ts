import * as http from 'http';
import * as crypto from 'crypto';
import { URL } from 'url';

export interface ChannelClient {
  id: string;
  channel: string;
  socket: any;
}

/**
 * Embedded Multi-Protocol Realtime Bus.
 * Bound strictly to 127.0.0.1 with session token authentication.
 * Multi-channel endpoints: /audio (binary PCM), /transcript (JSON), /events (JSON), /chat (JSON).
 */
export class RealtimeBus {
  private server?: http.Server;
  private clients = new Map<string, ChannelClient>();
  private sessionToken: string;
  private port: number = 0;
  private isRunning: boolean = false;

  constructor(sessionToken?: string) {
    this.sessionToken = sessionToken || this.generateToken();
  }

  public getToken(): string {
    return this.sessionToken;
  }

  public getPort(): number {
    return this.port;
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Start the Realtime Bus listening strictly on 127.0.0.1.
   */
  public async start(preferredPort: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        this.server = http.createServer((req, res) => {
          // HTTP health endpoint
          if (req.url?.startsWith('/health')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', channels: ['/audio', '/transcript', '/events', '/chat'] }));
            return;
          }
          res.writeHead(404);
          res.end('Not Found');
        });

        // Handle WebSocket Upgrades
        this.server.on('upgrade', (req, socket, head) => {
          this.handleUpgrade(req, socket, head);
        });

        this.server.listen(preferredPort, '127.0.0.1', () => {
          const addr = this.server?.address();
          if (addr && typeof addr === 'object') {
            this.port = addr.port;
          } else {
            this.port = preferredPort;
          }
          this.isRunning = true;
          resolve(this.port);
        });

        this.server.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Stop the Realtime Bus and close all client connections.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    for (const [id, client] of this.clients.entries()) {
      try {
        client.socket.destroy();
      } catch {}
    }
    this.clients.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = undefined;
      } else {
        resolve();
      }
    });
  }

  /**
   * Broadcast binary payload or JSON payload to all clients subscribed to a channel.
   */
  public broadcast(channel: string, payload: Buffer | string | object): void {
    if (!this.isRunning) return;

    let frame: Buffer;
    if (Buffer.isBuffer(payload)) {
      frame = this.createFrame(payload, 0x02); // Binary frame
    } else {
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
      frame = this.createFrame(Buffer.from(text, 'utf-8'), 0x01); // Text frame
    }

    const targetChannel = channel.startsWith('/') ? channel : `/${channel}`;

    for (const client of Array.from(this.clients.values())) {
      if (client.channel === targetChannel) {
        try {
          client.socket.write(frame);
        } catch {
          this.clients.delete(client.id);
        }
      }
    }
  }

  /**
   * Get active subscriber count per channel.
   */
  public getSubscriberCount(channel?: string): number {
    if (!channel) return this.clients.size;
    const targetChannel = channel.startsWith('/') ? channel : `/${channel}`;
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.channel === targetChannel) count++;
    }
    return count;
  }

  private handleUpgrade(req: http.IncomingMessage, socket: any, head: Buffer): void {
    const reqUrl = req.url || '/';
    const parsedUrl = new URL(reqUrl, 'http://127.0.0.1');

    // Token Authorization Verification
    const token = parsedUrl.searchParams.get('token') || req.headers['authorization']?.replace('Bearer ', '');
    if (token !== this.sessionToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const channel = parsedUrl.pathname || '/events';
    const key = req.headers['sec-websocket-key'];

    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    // Standard WebSocket Handshake Digest Calculation
    const acceptKey = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ].join('\r\n');

    socket.write(responseHeaders);

    const clientId = `client_${Math.random().toString(36).substring(2, 9)}`;
    const client: ChannelClient = { id: clientId, channel, socket };
    this.clients.set(clientId, client);

    socket.on('close', () => {
      this.clients.delete(clientId);
    });

    socket.on('error', () => {
      this.clients.delete(clientId);
    });
  }

  /**
   * Helper to construct unmasked WebSocket server data frames.
   */
  private createFrame(buffer: Buffer, opcode: number): Buffer {
    const length = buffer.length;
    let header: Buffer;

    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    return Buffer.concat([header, buffer]);
  }

  private generateToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}
