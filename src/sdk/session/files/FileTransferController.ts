import { IDataChannel } from '../data/IDataChannel';
import { FileTransferHeader } from '../../types';
import { TypedEventEmitter } from '../../events/EventEmitter';

export interface FileProgressPayload {
  fileId: string;
  bytesSent: number;
  totalBytes: number;
  percentage: number;
}

export class FileTransferController {
  private dataChannel: IDataChannel;
  private isCancelled: boolean = false;
  private progressListeners: Set<(progress: FileProgressPayload) => void> = new Set();

  constructor(dataChannel: IDataChannel) {
    this.dataChannel = dataChannel;
  }

  public async send(fileData: File | Blob | ArrayBuffer, name: string): Promise<string> {
    this.isCancelled = false;
    let buffer: ArrayBuffer;
    if (fileData instanceof ArrayBuffer) {
      buffer = fileData;
    } else if (typeof Blob !== 'undefined' && fileData instanceof Blob) {
      buffer = await fileData.arrayBuffer();
    } else if (typeof File !== 'undefined' && fileData instanceof (File as any)) {
      buffer = await fileData.arrayBuffer();
    } else {
      throw new Error('Unsupported file data payload');
    }

    const fileId = Math.random().toString(36).substring(2, 9);
    const header: FileTransferHeader = {
      id: fileId,
      name,
      size: buffer.byteLength,
    };

    this.dataChannel.sendJson({
      __control__: {
        category: 'file',
        action: 'start',
        payload: header,
      },
    });

    const chunkSize = 16384; // 16KB WebRTC DataChannel chunking
    let offset = 0;

    while (offset < buffer.byteLength) {
      if (this.isCancelled) {
        this.dataChannel.sendJson({
          __control__: { category: 'file', action: 'cancel', payload: { id: fileId } },
        });
        throw new Error('File transfer cancelled by user');
      }

      const chunk = buffer.slice(offset, offset + chunkSize);
      this.dataChannel.sendBinary(chunk);
      offset += chunk.byteLength;

      const percentage = Math.min(100, Math.round((offset / buffer.byteLength) * 100));
      const progressPayload: FileProgressPayload = {
        fileId,
        bytesSent: offset,
        totalBytes: buffer.byteLength,
        percentage,
      };

      this.progressListeners.forEach((fn) => fn(progressPayload));
    }

    this.dataChannel.sendJson({
      __control__: {
        category: 'file',
        action: 'complete',
        payload: { id: fileId },
      },
    });

    return fileId;
  }

  public cancel(): void {
    this.isCancelled = true;
  }

  public onProgress(handler: (progress: FileProgressPayload) => void): () => void {
    this.progressListeners.add(handler);
    return () => {
      this.progressListeners.delete(handler);
    };
  }

  public onReceive(handler: (file: { name: string; data: ArrayBuffer; size: number }) => void): () => void {
    let currentHeader: FileTransferHeader | null = null;
    let accumulatedChunks: Uint8Array[] = [];
    let receivedBytes = 0;

    const unsubscribeMsg = this.dataChannel.onMessage((msg) => {
      try {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : msg;
        if (parsed?.__control__?.category === 'file') {
          const action = parsed.__control__.action;
          if (action === 'start') {
            currentHeader = parsed.__control__.payload;
            accumulatedChunks = [];
            receivedBytes = 0;
          } else if (action === 'complete' && currentHeader) {
            const finalBuffer = new Uint8Array(receivedBytes);
            let pos = 0;
            for (const chunk of accumulatedChunks) {
              finalBuffer.set(chunk, pos);
              pos += chunk.byteLength;
            }
            handler({
              name: currentHeader.name,
              data: finalBuffer.buffer,
              size: currentHeader.size,
            });
            currentHeader = null;
            accumulatedChunks = [];
          } else if (action === 'cancel') {
            currentHeader = null;
            accumulatedChunks = [];
          }
        }
      } catch {
        // Ignore non-control messages
      }
    });

    const unsubscribeBin = this.dataChannel.onBinary((buffer) => {
      if (currentHeader) {
        const chunk = new Uint8Array(buffer);
        accumulatedChunks.push(chunk);
        receivedBytes += chunk.byteLength;
      }
    });

    return () => {
      unsubscribeMsg();
      unsubscribeBin();
    };
  }
}
