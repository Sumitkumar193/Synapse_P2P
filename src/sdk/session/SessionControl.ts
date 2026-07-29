import { SessionData } from './SessionData';
import {
  MouseButton,
  ControlMessage,
  MouseMovePayload,
  MouseClickPayload,
  MouseScrollPayload,
  MouseDragPayload,
  KeyboardPressPayload,
  KeyboardTypePayload,
  ClipboardPayload,
  FileTransferHeader,
} from '../types';

export class SessionControl {
  private data: SessionData;

  constructor(data: SessionData) {
    this.data = data;
  }

  private sendControlMessage(category: 'mouse' | 'keyboard' | 'clipboard' | 'file', action: string, payload: any): void {
    const msg: ControlMessage = { category, action, payload };
    this.data.sendJSON({ __control__: msg });
  }

  public get mouse() {
    return {
      move: (x: number, y: number) => {
        const payload: MouseMovePayload = { x, y };
        this.sendControlMessage('mouse', 'move', payload);
      },
      click: (button: MouseButton = 'left', x?: number, y?: number, double: boolean = false) => {
        const payload: MouseClickPayload = { button, x, y, double };
        this.sendControlMessage('mouse', 'click', payload);
      },
      scroll: (deltaX: number, deltaY: number) => {
        const payload: MouseScrollPayload = { deltaX, deltaY };
        this.sendControlMessage('mouse', 'scroll', payload);
      },
      drag: (startX: number, startY: number, endX: number, endY: number) => {
        const payload: MouseDragPayload = { startX, startY, endX, endY };
        this.sendControlMessage('mouse', 'drag', payload);
      },
    };
  }

  public get keyboard() {
    return {
      keyPress: (key: string, modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[]) => {
        const payload: KeyboardPressPayload = { key, modifiers };
        this.sendControlMessage('keyboard', 'keyPress', payload);
      },
      type: (text: string) => {
        const payload: KeyboardTypePayload = { text };
        this.sendControlMessage('keyboard', 'type', payload);
      },
    };
  }

  public get clipboard() {
    return {
      writeText: (text: string) => {
        const payload: ClipboardPayload = { text };
        this.sendControlMessage('clipboard', 'writeText', payload);
      },
      onClipboard: (handler: (text: string) => void): (() => void) => {
        return this.data.onMessage((msg) => {
          try {
            const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
            if (parsed?.__control__?.category === 'clipboard' && parsed.__control__.action === 'writeText') {
              handler(parsed.__control__.payload.text);
            }
          } catch {
            // Ignore non-control messages
          }
        });
      },
    };
  }

  public get files() {
    return {
      sendFile: async (data: File | Blob | ArrayBuffer, name: string) => {
        let buffer: ArrayBuffer;
        if (data instanceof ArrayBuffer) {
          buffer = data;
        } else if ((typeof Blob !== 'undefined' && data instanceof Blob) || (typeof File !== 'undefined' && data instanceof (File as any))) {
          buffer = await data.arrayBuffer();
        } else {
          throw new Error('Unsupported file data type');
        }

        const header: FileTransferHeader = {
          id: Math.random().toString(36).substring(2, 9),
          name,
          size: buffer.byteLength,
        };

        this.sendControlMessage('file', 'start', header);
        this.data.sendBinary(buffer);
        this.sendControlMessage('file', 'complete', { id: header.id });
      },
      onFileReceived: (handler: (file: { name: string; data: ArrayBuffer; size: number }) => void): (() => void) => {
        let currentHeader: FileTransferHeader | null = null;

        const unsubscribeData = this.data.onMessage((msg) => {
          try {
            const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
            if (parsed?.__control__?.category === 'file') {
              if (parsed.__control__.action === 'start') {
                currentHeader = parsed.__control__.payload;
              }
            }
          } catch {
            // Ignore non-control messages
          }
        });

        const unsubscribeBinary = this.data.onBinary((buffer) => {
          if (currentHeader) {
            handler({
              name: currentHeader.name,
              data: buffer,
              size: buffer.byteLength,
            });
            currentHeader = null;
          }
        });

        return () => {
          unsubscribeData();
          unsubscribeBinary();
        };
      },
    };
  }
}
