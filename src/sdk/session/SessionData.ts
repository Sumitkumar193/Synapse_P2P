import { TypedEventEmitter } from '../events/EventEmitter';
import { SDKEventMap } from '../events/events';
import { WebRTCTransport } from '../transport/WebRTCTransport';

export type DataMessageHandler = (data: any, senderId: string) => void;
export type BinaryMessageHandler = (data: ArrayBuffer, senderId: string) => void;

export class SessionData {
  private transportProvider: () => WebRTCTransport | undefined;
  private eventEmitter: TypedEventEmitter<SDKEventMap>;

  constructor(transportProvider: () => WebRTCTransport | undefined, eventEmitter: TypedEventEmitter<SDKEventMap>) {
    this.transportProvider = transportProvider;
    this.eventEmitter = eventEmitter;
  }

  public send(data: string | ArrayBuffer | Uint8Array): void {
    const transport = this.transportProvider();
    if (!transport) {
      throw new Error('Cannot send data: Transport not connected');
    }
    const buffer = data instanceof Uint8Array ? data.buffer : data;
    transport.sendData(buffer as any);
  }

  public sendJSON(data: Record<string, any>): void {
    this.send(JSON.stringify(data));
  }

  public sendBinary(data: ArrayBuffer | Uint8Array): void {
    this.send(data);
  }

  public onMessage(handler: DataMessageHandler): () => void {
    const wrapper = (raw: string | ArrayBuffer, peerId: string) => {
      handler(raw, peerId);
    };
    this.eventEmitter.on('data-message', wrapper);
    return () => {
      this.eventEmitter.off('data-message', wrapper);
    };
  }

  public onBinary(handler: BinaryMessageHandler): () => void {
    const wrapper = (raw: string | ArrayBuffer, peerId: string) => {
      if (raw instanceof ArrayBuffer) {
        handler(raw, peerId);
      }
    };
    this.eventEmitter.on('data-message', wrapper);
    return () => {
      this.eventEmitter.off('data-message', wrapper);
    };
  }
}
