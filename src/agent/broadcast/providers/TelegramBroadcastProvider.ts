import { IBroadcastProvider, BroadcastMessagePayload, BroadcastResult } from '../IBroadcastProvider';
import { AppSettings } from '../../../shared/settings';

export interface TelegramRelayConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

/**
 * Concrete Telegram Broadcast Provider implementing IBroadcastProvider.
 * Converts markdown AI responses into formatted HTML for Telegram Bot API delivery.
 */
export class TelegramBroadcastProvider implements IBroadcastProvider {
  public id = 'telegram';
  public name = 'Telegram Channel Broadcast';
  private enabled = false;
  private botToken = '';
  private chatId = '';

  constructor(config?: Partial<TelegramRelayConfig>) {
    if (config) {
      this.updateConfig(config);
    }
  }

  public isEnabled(): boolean {
    return this.enabled && Boolean(this.botToken) && Boolean(this.chatId);
  }

  public updateConfig(config: Partial<TelegramRelayConfig>): void {
    if (config.enabled !== undefined) this.enabled = config.enabled;
    if (config.botToken !== undefined) this.botToken = config.botToken.trim();
    if (config.chatId !== undefined) this.chatId = config.chatId.trim();
  }

  public updateFromSettings(settings: AppSettings): void {
    this.updateConfig({
      enabled: settings.enableTelegramRelay,
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
    });
  }

  public async broadcast(payload: BroadcastMessagePayload): Promise<BroadcastResult> {
    if (!this.botToken || !this.chatId) {
      return {
        providerId: this.id,
        success: false,
        error: 'Telegram Bot Token and Chat ID must be configured in Settings.',
      };
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const cleanText = payload.text.trim();
      const formattedText = `⚡ <b>${this.escapeHtml(payload.sender)}</b>\n\n${this.formatMarkdownToTelegramHtml(cleanText)}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: formattedText,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        console.log('[TelegramBroadcast 📲] AI message successfully broadcast to Telegram channel!');
        return { providerId: this.id, success: true };
      } else {
        console.warn('[TelegramBroadcast Warning] HTML formatting failed, trying plain text fallback:', data.description);
        // Fallback without HTML formatting if HTML parsing hit error
        const fallbackRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text: `⚡ ${payload.sender}\n\n${cleanText}`,
            disable_web_page_preview: true,
          }),
        });
        const fallbackData = await fallbackRes.json();
        if (fallbackData.ok) {
          console.log('[TelegramBroadcast 📲] Plain text fallback broadcast successfully!');
          return { providerId: this.id, success: true };
        }
        return { providerId: this.id, success: false, error: fallbackData.description || 'Telegram API rejected message' };
      }
    } catch (err: any) {
      console.error('[TelegramBroadcast Network Error]:', err.message || err);
      return { providerId: this.id, success: false, error: err.message || 'Network error reaching Telegram API' };
    }
  }

  private formatMarkdownToTelegramHtml(text: string): string {
    let result = this.escapeHtml(text);

    // Convert ```lang code ``` blocks to Telegram HTML <pre><code>
    result = result.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      const langClass = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${langClass}>${code}</code></pre>`;
    });

    // Convert inline `code` to <code>
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Convert **bold** to <b>bold</b>
    result = result.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

    return result;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
