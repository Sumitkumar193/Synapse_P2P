import { IDataChannel } from './IDataChannel';
import { ITransportProvider } from '../../transport/interfaces/ITransportProvider';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { SDKEventMap } from '../../events/events';

export class DataController implements IDataChannel {
  private transportProvider: () => ITransportProvider | undefined;
  private eventEmitter: TypedEventEmitter<SDKEventMap>;

  constructor(transportProvider: () => ITransportProvider | undefined, eventEmitter: TypedEventEmitter<SDKEventMap>) {
    this.transportProvider = transportProvider;
    this.eventEmitter = eventEmitter;
  }

  public send(data: string | ArrayBuffer | Uint8Array): void {
    const transport = this.transportProvider();
    if (!transport) {
      throw new Error('DataChannel unavailable: Transport disconnected');
    }
    const buffer = data instanceof Uint8Array ? data.buffer : data;
    transport.sendData(buffer as any);
  }

  public sendJson(data: Record<string, any>): void {
    this.send(JSON.stringify(data));
  }

  public sendBinary(data: ArrayBuffer | Uint8Array): void {
    this.send(data);
  }

  public onMessage(handler: (data: any, peerId: string) => void): () => void {
    const wrapper = (raw: string | ArrayBuffer, peerId: string) => {
      handler(raw, peerId);
    };
    this.eventEmitter.on('data-message', wrapper);
    return () => {
      this.eventEmitter.off('data-message', wrapper);
    };
  }

  public onBinary(handler: (data: ArrayBuffer, peerId: string) => void): () => void {
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
