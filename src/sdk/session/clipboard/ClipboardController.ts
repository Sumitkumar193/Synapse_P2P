import { IDataChannel } from '../data/IDataChannel';

export class ClipboardController {
  private dataChannel: IDataChannel;
  private lastClipboardText: string = '';

  constructor(dataChannel: IDataChannel) {
    this.dataChannel = dataChannel;
  }

  public write(text: string): void {
    this.lastClipboardText = text;
    this.dataChannel.sendJson({
      __control__: {
        category: 'clipboard',
        action: 'write',
        payload: { text },
      },
    });
  }

  public async read(): Promise<string> {
    return this.lastClipboardText;
  }

  public onClipboard(handler: (text: string) => void): () => void {
    return this.dataChannel.onMessage((msg) => {
      try {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
        if (parsed?.__control__?.category === 'clipboard' && parsed.__control__.action === 'write') {
          const text = parsed.__control__.payload.text;
          this.lastClipboardText = text;
          handler(text);
        }
      } catch {
        // Ignore non-control messages
      }
    });
  }
}
