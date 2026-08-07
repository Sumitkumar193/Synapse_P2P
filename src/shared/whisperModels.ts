export interface WhisperModelMetadata {
  name: string;
  sizeLabel: string;
  sizeMB: number;
  englishFile: string;
  multilingualFile: string;
  englishUrl: string;
  multilingualUrl: string;
}

export const WHISPER_MODELS: Record<string, WhisperModelMetadata> = {
  tiny: {
    name: 'tiny',
    sizeLabel: '~77 MB',
    sizeMB: 77,
    englishFile: 'ggml-tiny.en.bin',
    multilingualFile: 'ggml-tiny.bin',
    englishUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    multilingualUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  },
  base: {
    name: 'base',
    sizeLabel: '~148 MB',
    sizeMB: 148,
    englishFile: 'ggml-base.en.bin',
    multilingualFile: 'ggml-base.bin',
    englishUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    multilingualUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  },
  small: {
    name: 'small',
    sizeLabel: '~488 MB',
    sizeMB: 488,
    englishFile: 'ggml-small.en.bin',
    multilingualFile: 'ggml-small.bin',
    englishUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    multilingualUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  },
  medium: {
    name: 'medium',
    sizeLabel: '~1.5 GB',
    sizeMB: 1500,
    englishFile: 'ggml-medium.en.bin',
    multilingualFile: 'ggml-medium.bin',
    englishUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
    multilingualUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  },
  large: {
    name: 'large',
    sizeLabel: '~3.1 GB',
    sizeMB: 3100,
    englishFile: 'ggml-large-v3.bin',
    multilingualFile: 'ggml-large-v3.bin',
    englishUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
    multilingualUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
  },
};

export const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: '🌐 Auto-Detect Language' },
  { code: 'en', name: '🇺🇸 English' },
  { code: 'hi', name: '🇮🇳 Hindi' },
  { code: 'es', name: '🇪🇸 Spanish' },
  { code: 'fr', name: '🇫🇷 French' },
  { code: 'de', name: '🇩🇪 German' },
  { code: 'zh', name: '🇨🇳 Chinese' },
  { code: 'ja', name: '🇯🇵 Japanese' },
  { code: 'ru', name: '🇷🇺 Russian' },
  { code: 'pt', name: '🇵🇹 Portuguese' },
  { code: 'it', name: '🇮🇹 Italian' },
];
