import { eventBus } from '../../shared/EventBus';
import { AppSettings } from '../../shared/settings';
import { IBroadcastProvider, BroadcastMessagePayload, BroadcastResult } from './IBroadcastProvider';
import { TelegramBroadcastProvider } from './providers/TelegramBroadcastProvider';

/**
 * Modular Broadcaster Manager (Observer / Adapter Pattern).
 * Subscribes to AI Copilot message events and fans out notifications to all registered & enabled providers
 * (Telegram, WebSockets, Push Notifications, Webhooks, etc.).
 */
export class BroadcastManager {
  private static instance: BroadcastManager;
  private providers = new Map<string, IBroadcastProvider>();
  private isListening = false;

  // Built-in Telegram provider reference
  public telegramProvider: TelegramBroadcastProvider;

  constructor() {
    this.telegramProvider = new TelegramBroadcastProvider();
    this.registerProvider(this.telegramProvider);
    this.initListeners();
  }

  public static getInstance(): BroadcastManager {
    if (!BroadcastManager.instance) {
      BroadcastManager.instance = new BroadcastManager();
    }
    return BroadcastManager.instance;
  }

  public registerProvider(provider: IBroadcastProvider): void {
    this.providers.set(provider.id, provider);
    console.log(`[BroadcastManager 🔌] Registered broadcast provider: '${provider.name}' (${provider.id})`);
  }

  public unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
  }

  public getProviders(): IBroadcastProvider[] {
    return Array.from(this.providers.values());
  }

  public getProvider<T extends IBroadcastProvider>(providerId: string): T | undefined {
    return this.providers.get(providerId) as T | undefined;
  }

  public updateFromSettings(settings: AppSettings): void {
    this.telegramProvider.updateFromSettings(settings);
  }

  private initListeners(): void {
    if (this.isListening) return;
    this.isListening = true;

    eventBus.on('chat_received', async (evt) => {
      if (!evt.isAi || !evt.text) return;

      const payload: BroadcastMessagePayload = {
        id: evt.id || `msg_${Date.now()}`,
        text: evt.text,
        sender: evt.sender || 'AI Copilot',
        timestamp: evt.timestamp || Date.now(),
      };

      await this.broadcastAll(payload);
    });
  }

  /**
   * Broadcast message payload to all active & enabled providers concurrently.
   */
  public async broadcastAll(payload: BroadcastMessagePayload): Promise<BroadcastResult[]> {
    const activeProviders = Array.from(this.providers.values()).filter((p) => p.isEnabled());
    if (activeProviders.length === 0) return [];

    console.log(`[BroadcastManager 📡] Broadcasting AI message to ${activeProviders.length} active provider(s)...`);

    const results = await Promise.all(
      activeProviders.map(async (provider) => {
        try {
          return await provider.broadcast(payload);
        } catch (err: any) {
          return {
            providerId: provider.id,
            success: false,
            error: err.message || 'Broadcast failed',
          };
        }
      })
    );

    return results;
  }
}

export const broadcastManager = BroadcastManager.getInstance();
