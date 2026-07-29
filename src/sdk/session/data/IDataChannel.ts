export interface IDataChannel {
  send(data: string | ArrayBuffer | Uint8Array): void;
  sendJson(data: Record<string, any>): void;
  sendBinary(data: ArrayBuffer | Uint8Array): void;
  onMessage(handler: (data: any, peerId: string) => void): () => void;
  onBinary(handler: (data: ArrayBuffer, peerId: string) => void): () => void;
}
