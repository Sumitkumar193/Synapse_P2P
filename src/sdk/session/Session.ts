import { MediaController } from './media/MediaController';
import { DataController } from './data/DataController';
import { ControlController } from './control/ControlController';
import { ClipboardController } from './clipboard/ClipboardController';
import { FileTransferController } from './files/FileTransferController';
import { StatsController } from './stats/StatsController';

import { IMediaProvider } from './media/IMediaProvider';
import { ITransportProvider } from '../transport/interfaces/ITransportProvider';
import { ISignalingProvider } from '../signaling/ISignalingProvider';
import { TypedEventEmitter } from '../events/EventEmitter';
import { SDKEventMap } from '../events/events';
import { Logger } from '../utils/Logger';

export interface SessionOptions {
  roomId: string;
  peerId: string;
  remotePeerId?: string;
  mediaProvider: IMediaProvider;
  transportProvider: () => ITransportProvider | undefined;
  signalingProvider: ISignalingProvider;
  trackerUrlProvider: () => string;
  eventEmitter: TypedEventEmitter<SDKEventMap>;
  onDisconnectHandler?: () => Promise<void>;
}

export class Session {
  public readonly id: string;
  public readonly peerId: string;
  public remotePeerId?: string;

  public readonly media: MediaController;
  public readonly data: DataController;
  public readonly control: ControlController;
  public readonly clipboard: ClipboardController;
  public readonly files: FileTransferController;
  public readonly stats: StatsController;

  public readonly events: TypedEventEmitter<SDKEventMap>;

  private mediaProvider: IMediaProvider;
  private transportProvider: () => ITransportProvider | undefined;
  private signalingProvider: ISignalingProvider;
  private onDisconnectHandler?: () => Promise<void>;
  private logger: Logger;

  constructor(options: SessionOptions) {
    this.id = options.roomId;
    this.peerId = options.peerId;
    this.remotePeerId = options.remotePeerId;
    this.mediaProvider = options.mediaProvider;
    this.transportProvider = options.transportProvider;
    this.signalingProvider = options.signalingProvider;
    this.onDisconnectHandler = options.onDisconnectHandler;
    this.events = options.eventEmitter;
    this.logger = new Logger(`Session[${this.id}]`);

    this.media = new MediaController(this.mediaProvider, this.transportProvider);
    this.data = new DataController(this.transportProvider, this.events);
    this.control = new ControlController(this.data);
    this.clipboard = new ClipboardController(this.data);
    this.files = new FileTransferController(this.data);
    this.stats = new StatsController(this.transportProvider, options.trackerUrlProvider);
  }

  public setRemotePeerId(peerId: string): void {
    this.remotePeerId = peerId;
  }

  /**
   * Phase 12: Connection Lifecycle Methods
   */
  public async disconnect(): Promise<void> {
    this.logger.info(`Disconnecting session ${this.id}...`);
    this.media.stop();
    if (this.onDisconnectHandler) {
      await this.onDisconnectHandler();
    }
  }

  public async reconnect(): Promise<void> {
    this.logger.info(`Attempting session reconnect for ${this.id}...`);
    await this.restartIce();
  }

  public async restartIce(): Promise<void> {
    const transport = this.transportProvider();
    if (transport) {
      this.logger.info(`Restarting ICE connection for session ${this.id}...`);
      await transport.restartIce();
    }
  }

  public close(): void {
    const transport = this.transportProvider();
    if (transport) {
      transport.close();
    }
    this.media.stop();
  }
}
