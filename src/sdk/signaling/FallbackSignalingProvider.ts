import { ISignalingProvider, SignalingMessageHandler } from './ISignalingProvider';
import { SignalingMessage } from '../types';
import { Logger } from '../utils/Logger';

export interface NamedSignalingProvider {
  name: string;
  provider: ISignalingProvider;
}

export class FallbackSignalingProvider implements ISignalingProvider {
  private providers: NamedSignalingProvider[];
  private activeProvider?: NamedSignalingProvider;
  private messageHandlers: Set<SignalingMessageHandler> = new Set();
  private logger: Logger = new Logger('FallbackSignalingProvider');

  constructor(providers: NamedSignalingProvider[]) {
    this.providers = providers;
  }

  public async connect(roomId?: string): Promise<void> {
    this.logger.info(`Initialized signaling cascade across ${this.providers.length} providers`);
  }

  public async joinRoom(roomId: string, peerId: string, isHost: boolean = false): Promise<void> {
    if (isHost) {
      // Host Mode: Connects to the primary functional provider in priority order
      for (const item of this.providers) {
        try {
          this.logger.info(`[Host Mode] Registering room ${roomId} on signaling provider [${item.name}]...`);
          await item.provider.connect(roomId);
          await item.provider.joinRoom(roomId, peerId, true);
          this.activeProvider = item;
          this.messageHandlers.forEach((h) => item.provider.onMessage(h));
          this.logger.info(`🟢 [Host Mode] Registered room ${roomId} on signaling provider [${item.name}]`);
          return;
        } catch (err: any) {
          this.logger.warn(`Signaling provider [${item.name}] failed for Host: ${err?.message || err}`);
        }
      }
      throw new Error('All signaling providers failed for Host room creation');
    }

    // Joiner Probing Mode: Probes each provider sequentially until an active Host offer is discovered!
    this.logger.info(`🔍 [Joiner Mode] Probing room ${roomId} across ${this.providers.length} signaling providers...`);

    for (const item of this.providers) {
      try {
        this.logger.info(`🔍 Probing provider [${item.name}] for active Host in room ${roomId}...`);
        await item.provider.connect(roomId);

        let offerDiscovered = false;

        // Temporary offer listener for room probe
        const probeHandler: SignalingMessageHandler = (msg: SignalingMessage) => {
          if (msg.type === 'offer' || msg.type === 'peer-joined') {
            offerDiscovered = true;
          }
        };

        item.provider.onMessage(probeHandler);
        await item.provider.joinRoom(roomId, peerId, false);

        // Wait up to 1800ms for Host offer response on this provider
        const PROBE_TIMEOUT_MS = 1800;
        const startTime = Date.now();

        while (!offerDiscovered && Date.now() - startTime < PROBE_TIMEOUT_MS) {
          await new Promise((res) => setTimeout(res, 100));
        }

        if (offerDiscovered) {
          item.provider.offMessage(probeHandler);
          this.activeProvider = item;
          this.messageHandlers.forEach((h) => item.provider.onMessage(h));
          this.logger.info(`🟢 🎯 [Joiner Mode] Found active Host on signaling provider [${item.name}]! Locking connection.`);
          return;
        }

        // No Host response on this provider within timeout -> cleanup and probe next provider
        this.logger.info(`⏱️ No Host response on [${item.name}] after ${PROBE_TIMEOUT_MS}ms. Probing next provider...`);
        item.provider.offMessage(probeHandler);
        await item.provider.disconnect().catch(() => {});
      } catch (err: any) {
        this.logger.warn(`Probe failed on provider [${item.name}]: ${err?.message || err}`);
      }
    }

    // If no provider returned a Host offer during probe, default to first available provider
    this.logger.warn('⚠️ No active Host found during multi-provider probe. Defaulting to primary provider...');
    const defaultItem = this.providers[0];
    await defaultItem.provider.connect(roomId);
    await defaultItem.provider.joinRoom(roomId, peerId, false);
    this.activeProvider = defaultItem;
    this.messageHandlers.forEach((h) => defaultItem.provider.onMessage(h));
  }

  public async send(message: SignalingMessage): Promise<void> {
    if (this.activeProvider) {
      await this.activeProvider.provider.send(message);
    } else {
      throw new Error('FallbackSignalingProvider: No active provider connected');
    }
  }

  public async leaveRoom(roomId: string, peerId: string): Promise<void> {
    if (this.activeProvider && this.activeProvider.provider.leaveRoom) {
      await this.activeProvider.provider.leaveRoom(roomId, peerId);
    }
  }

  public onMessage(handler: SignalingMessageHandler): void {
    this.messageHandlers.add(handler);
    if (this.activeProvider) {
      this.activeProvider.provider.onMessage(handler);
    }
  }

  public offMessage(handler: SignalingMessageHandler): void {
    this.messageHandlers.delete(handler);
    if (this.activeProvider) {
      this.activeProvider.provider.offMessage(handler);
    }
  }

  public isConnected(): boolean {
    return this.activeProvider ? this.activeProvider.provider.isConnected() : false;
  }

  public getActiveProviderName(): string {
    return this.activeProvider ? this.activeProvider.name : 'Disconnected';
  }

  public async disconnect(): Promise<void> {
    if (this.activeProvider) {
      await this.activeProvider.provider.disconnect();
      this.activeProvider = undefined;
    }
  }
}
