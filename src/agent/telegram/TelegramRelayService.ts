import { broadcastManager } from '../broadcast/BroadcastManager';
import { TelegramBroadcastProvider, TelegramRelayConfig } from '../broadcast/providers/TelegramBroadcastProvider';
import { AppSettings } from '../../shared/settings';

/**
 * Backward-compatible wrapper delegating to the modular BroadcastManager.
 */
export class TelegramRelayService {
  private static instance: TelegramRelayService;

  public static getInstance(): TelegramRelayService {
    if (!TelegramRelayService.instance) {
      TelegramRelayService.instance = new TelegramRelayService();
    }
    return TelegramRelayService.instance;
  }

  public updateConfig(config: Partial<TelegramRelayConfig>): void {
    broadcastManager.telegramProvider.updateConfig(config);
  }

  public updateFromSettings(settings: AppSettings): void {
    broadcastManager.telegramProvider.updateFromSettings(settings);
  }

  public async sendTelegramMessage(text: string, senderName: string = 'AI Interview Copilot'): Promise<{ success: boolean; error?: string }> {
    const res = await broadcastManager.telegramProvider.broadcast({
      text,
      sender: senderName,
      timestamp: Date.now(),
    });
    return { success: res.success, error: res.error };
  }
}

export const telegramRelayService = TelegramRelayService.getInstance();
