/**
 * High-performance PCM Audio Ring Buffer with drop-oldest backpressure strategy.
 * Ensures smooth 16kHz audio streaming without memory bloat or event loop stalls.
 */
export class RingBuffer {
  private buffer: Buffer;
  private writeHead = 0;
  private readHead = 0;
  private count = 0;

  constructor(public readonly capacity: number = 1024 * 1024) {
    this.buffer = Buffer.allocUnsafe(capacity);
  }

  /**
   * Write binary PCM chunk into the ring buffer.
   * If space is insufficient, drops oldest bytes to maintain real-time low latency.
   */
  public write(data: Buffer | Uint8Array): void {
    const dataLen = data.length;
    if (dataLen === 0) return;

    // If incoming chunk exceeds total capacity, keep only the latest bytes
    const incoming = dataLen > this.capacity ? data.subarray(dataLen - this.capacity) : data;
    const len = incoming.length;

    // Check if write will overflow readable data; drop oldest bytes if needed
    const freeSpace = this.capacity - this.count;
    if (len > freeSpace) {
      const dropCount = len - freeSpace;
      this.readHead = (this.readHead + dropCount) % this.capacity;
      this.count -= dropCount;
    }

    const firstChunk = Math.min(len, this.capacity - this.writeHead);
    const buf = Buffer.isBuffer(incoming) ? incoming : Buffer.from(incoming.buffer, incoming.byteOffset, incoming.byteLength);
    buf.copy(this.buffer, this.writeHead, 0, firstChunk);

    if (firstChunk < len) {
      buf.copy(this.buffer, 0, firstChunk, len);
    }


    this.writeHead = (this.writeHead + len) % this.capacity;
    this.count += len;
  }

  /**
   * Read specified number of PCM bytes from the buffer.
   * Returns null if requested size exceeds available bytes.
   */
  public read(size: number): Buffer | null {
    if (size <= 0 || this.count < size) return null;

    const out = Buffer.allocUnsafe(size);
    const firstChunk = Math.min(size, this.capacity - this.readHead);
    this.buffer.copy(out, 0, this.readHead, this.readHead + firstChunk);

    if (firstChunk < size) {
      this.buffer.copy(out, firstChunk, 0, size - firstChunk);
    }

    this.readHead = (this.readHead + size) % this.capacity;
    this.count -= size;
    return out;
  }

  /**
   * Number of readable bytes currently stored in the buffer.
   */
  public available(): number {
    return this.count;
  }

  /**
   * Clear all stored buffer data.
   */
  public clear(): void {
    this.writeHead = 0;
    this.readHead = 0;
    this.count = 0;
  }
}
