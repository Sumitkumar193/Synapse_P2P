import { WhisperTranscriptionProvider } from '../src/agent/transcription/WhisperTranscriptionProvider';
import { generateSpeechPcmAudio } from './generatePcmAudio';
import * as path from 'path';

async function testRealWhisperBinary() {
  console.log('====================================================');
  console.log('🎙️ TESTING NATIVE WHISPER C++ BINARY EXECUTION');
  console.log('====================================================\n');

  const whisperBin = path.join(__dirname, '../assets/whisper/Release/whisper-cli.exe');
  const modelFile = path.join(__dirname, '../assets/whisper/ggml-tiny.en.bin');

  console.log(`Executable Path: ${whisperBin}`);
  console.log(`Model Path:      ${modelFile}\n`);

  const provider = new WhisperTranscriptionProvider({
    executablePath: whisperBin,
    modelPath: modelFile,
    agreementWindow: 1,
  });

  await provider.start();

  // Generate 16kHz PCM audio chunk
  const pcmChunk = generateSpeechPcmAudio('Testing Whisper Native C++ Inference', 1.0);

  console.log('Running native C++ Whisper inference on 16kHz PCM buffer...');
  const startTime = Date.now();
  const result = await provider.transcribeChunk(pcmChunk, 'local');
  const duration = Date.now() - startTime;

  console.log(`\n✅ Native Whisper Execution Completed in ${duration}ms!`);
  console.log(`Transcribed Output: "${result?.text || ''}"\n`);

  await provider.stop();
  console.log('====================================================');
}

testRealWhisperBinary().catch(console.error);
