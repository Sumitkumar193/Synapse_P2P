/**
 * Generator utility for producing valid 16kHz 16-bit mono PCM audio buffers.
 * Generates synthetic PCM sine wave audio frames for end-to-end pipeline verification.
 */
export function generateSyntheticPcmAudio(durationSeconds: number = 1, frequencyHz: number = 440, sampleRate: number = 16000): Buffer {
  const totalSamples = sampleRate * durationSeconds;
  const buffer = Buffer.allocUnsafe(totalSamples * 2); // 16-bit = 2 bytes per sample

  for (let i = 0; i < totalSamples; i++) {
    const sample = Math.sin(2 * Math.PI * frequencyHz * (i / sampleRate));
    // Scale to signed 16-bit integer range (-32768 to 32767)
    const int16Val = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(int16Val, i * 2);
  }

  return buffer;
}

/**
 * Generates a PCM audio buffer with an embedded text header tag for STT pipeline testing.
 */
export function generateSpeechPcmAudio(textTag: string, durationSeconds: number = 0.5): Buffer {
  const pcmTone = generateSyntheticPcmAudio(durationSeconds, 440, 16000);
  const textHeader = Buffer.from(`[TXT:${textTag}]`);
  return Buffer.concat([textHeader, pcmTone]);
}
