import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as readline from 'readline';
import { execSync } from 'child_process';
import { URL } from 'url';
import { DEFAULT_APP_SETTINGS } from '../src/shared/settings';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(PROJECT_ROOT, 'vendor', 'whisper');
const WHISPER_BIN_DIR = path.join(VENDOR_DIR, 'bin');
const WHISPER_MODELS_DIR = path.join(VENDOR_DIR, 'models');

const REPO_TINY_MODEL_PATH = path.join(PROJECT_ROOT, 'assets', 'whisper', 'ggml-tiny.en.bin');
const VENDOR_TINY_MODEL_PATH = path.join(WHISPER_MODELS_DIR, 'ggml-tiny.en.bin');

// Model definitions and HuggingFace download links
const MODEL_OPTIONS: Record<string, { name: string; file: string; url: string; sizeStr: string }> = {
  '1': {
    name: 'tiny',
    file: 'ggml-tiny.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    sizeStr: '~77 MB (Repo Template Asset)',
  },
  '2': {
    name: 'base',
    file: 'ggml-base.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    sizeStr: '~140 MB (Download on demand)',
  },
  '3': {
    name: 'small',
    file: 'ggml-small.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    sizeStr: '~460 MB (Download on demand)',
  },
  '4': {
    name: 'medium',
    file: 'ggml-medium.en.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
    sizeStr: '~1.5 GB (Download on demand)',
  },
  '5': {
    name: 'large',
    file: 'ggml-large-v3.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
    sizeStr: '~3.1 GB (Download on demand)',
  },
  '6': {
    name: 'skip',
    file: '',
    url: '',
    sizeStr: 'Skip Model Download',
  },
};

function ensureDirSync(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function downloadFile(fileUrl: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ensureDirSync(path.dirname(destPath));
    console.log(`[Whisper Setup] 📥 Downloading from ${fileUrl}...`);

    const request = (currentUrl: string) => {
      const parsedUrl = new URL(currentUrl);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      protocol
        .get(currentUrl, (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            const redirectUrl = new URL(response.headers.location, currentUrl).toString();
            request(redirectUrl);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download file. HTTP Status Code: ${response.statusCode}`));
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;
          let lastLoggedPct = -1;

          const fileStream = fs.createWriteStream(destPath);

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              const pct = Math.floor((downloadedBytes / totalBytes) * 100);
              if (pct % 10 === 0 && pct !== lastLoggedPct) {
                lastLoggedPct = pct;
                const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(1);
                const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
                console.log(`[Whisper Setup] ⏳ Progress: ${pct}% (${downloadedMB} MB / ${totalMB} MB)`);
              }
            }
          });

          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            console.log(`[Whisper Setup] ✅ Download completed: ${destPath}`);
            resolve();
          });

          fileStream.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        })
        .on('error', (err) => {
          reject(err);
        });
    };

    request(fileUrl);
  });
}

function promptUserChoice(): Promise<string> {
  const isNonInteractive =
    !process.stdout.isTTY || process.argv.includes('-y') || process.argv.includes('--default');

  if (isNonInteractive) {
    console.log('[Whisper Setup] 🤖 Non-interactive mode detected. Selecting default model: tiny');
    return Promise.resolve('1');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('\n==================================================');
    console.log('      🎙️  WHISPER STT MODEL SELECTION SETUP      ');
    console.log('==================================================');
    console.log('Please select which Whisper model variant to configure:\n');
    console.log('  1) Tiny   - ggml-tiny.en.bin   [' + MODEL_OPTIONS['1'].sizeStr + '] (RECOMMENDED)');
    console.log('  2) Base   - ggml-base.en.bin   [' + MODEL_OPTIONS['2'].sizeStr + ']');
    console.log('  3) Small  - ggml-small.en.bin  [' + MODEL_OPTIONS['3'].sizeStr + ']');
    console.log('  4) Medium - ggml-medium.en.bin [' + MODEL_OPTIONS['4'].sizeStr + ']');
    console.log('  5) Large  - ggml-large-v3.bin  [' + MODEL_OPTIONS['5'].sizeStr + ']');
    console.log('  6) Skip   - Keep existing setup without downloading');
    console.log('==================================================');

    rl.question('Enter choice [1-6] (default: 1): ', (answer) => {
      rl.close();
      const choice = answer.trim() || '1';
      resolve(MODEL_OPTIONS[choice] ? choice : '1');
    });
  });
}

function checkSystemWhisperBinary(): string | null {
  const isWin = process.platform === 'win32';
  const binNames = isWin
    ? ['whisper-cli.exe', 'whisper-server.exe', 'whisper.exe']
    : ['whisper-cli', 'whisper-server', 'whisper'];

  // Check vendor bin dir
  for (const bin of binNames) {
    const localBinPath = path.join(WHISPER_BIN_DIR, bin);
    if (fs.existsSync(localBinPath)) {
      return localBinPath;
    }
    const directBinPath = path.join(VENDOR_DIR, bin);
    if (fs.existsSync(directBinPath)) {
      return directBinPath;
    }
  }

  // Check PATH
  const cmd = isWin ? 'where' : 'which';
  for (const bin of binNames) {
    try {
      const res = execSync(`${cmd} ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
        .split(/\r?\n/)[0];
      if (res && fs.existsSync(res) && !res.endsWith('.cpl')) {
        return res;
      }
    } catch {}
  }

  return null;
}

async function setupWhisperBinary(): Promise<string> {
  const existingBin = checkSystemWhisperBinary();
  if (existingBin) {
    console.log(`[Whisper Setup] ✅ Whisper binary found: ${existingBin}`);
    return existingBin;
  }

  console.log(`[Whisper Setup] ⚙️  Whisper binary not found in PATH or vendor/whisper/bin.`);
  console.log(`[Whisper Setup] 📦 Preparing local binary directory in vendor/whisper for platform: ${process.platform} (${process.arch})...`);
  ensureDirSync(WHISPER_BIN_DIR);

  const isWin = process.platform === 'win32';
  const binName = isWin ? 'whisper-cli.exe' : 'whisper-cli';
  const targetBinPath = path.join(WHISPER_BIN_DIR, binName);

  const releaseUrls: string[] = [];
  const isArchiveTarGz = !isWin;
  if (isWin) {
    releaseUrls.push(
      'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip',
    );
  } else if (process.platform === 'darwin') {
    // macOS: No pre-built CLI in v1.9.2 releases — use setup:gpu to build from source
    console.log('[Whisper Setup] ⚠️ No pre-built macOS CLI binaries available. Run `npm run setup:gpu` to build from source.');
    return targetBinPath;
  } else {
    // Linux
    const isArm = process.arch === 'arm64';
    releaseUrls.push(
      isArm
        ? 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-ubuntu-arm64.tar.gz'
        : 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-ubuntu-x64.tar.gz',
    );
  }

  const archiveExt = isArchiveTarGz ? '.tar.gz' : '.zip';
  const archivePath = path.join(WHISPER_BIN_DIR, `whisper-bin${archiveExt}`);
  let downloaded = false;

  try {
    for (const url of releaseUrls) {
      try {
        await downloadFile(url, archivePath);
        downloaded = true;
        break;
      } catch {
        // try next candidate
      }
    }

    if (downloaded) {
      // Clean old binaries before extracting new ones
      try {
        const oldFiles = fs.readdirSync(WHISPER_BIN_DIR);
        for (const file of oldFiles) {
          const filePath = path.join(WHISPER_BIN_DIR, file);
          if (fs.statSync(filePath).isFile()) {
            fs.unlinkSync(filePath);
          }
        }
        console.log('[Whisper Setup] 🧹 Cleaned old binaries from vendor/whisper/bin/');
      } catch {}

      console.log('[Whisper Setup] 📦 Extracting binary package...');
      
      if (isArchiveTarGz) {
        execSync(`tar -xzf "${archivePath}" -C "${WHISPER_BIN_DIR}"`);
      } else {
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(archivePath);
          zip.extractAllTo(WHISPER_BIN_DIR, true);
        } catch {
          execSync(`powershell Expand-Archive -Path "${archivePath}" -DestinationPath "${WHISPER_BIN_DIR}" -Force`);
        }
      }

      // Flatten nested subdirectories (e.g. Release/) into bin/ directly
      const nestedDirs = ['Release', 'bin'];
      for (const sub of nestedDirs) {
        const nested = path.join(WHISPER_BIN_DIR, sub);
        if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
          const files = fs.readdirSync(nested);
          for (const file of files) {
            const src = path.join(nested, file);
            const dest = path.join(WHISPER_BIN_DIR, file);
            if (!fs.statSync(src).isDirectory()) {
              fs.copyFileSync(src, dest);
            }
          }
          fs.rmSync(nested, { recursive: true, force: true });
          console.log(`[Whisper Setup] 📂 Flattened ${sub}/ subdirectory into vendor/whisper/bin/`);
        }
      }

      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }


      if (process.platform !== 'win32' && fs.existsSync(targetBinPath)) {
        fs.chmodSync(targetBinPath, 0o755);
      }

      console.log(`[Whisper Setup] ✅ Local Whisper binary setup successfully in vendor: ${targetBinPath}`);
      return targetBinPath;
    }
  } catch (err: any) {
    console.warn(`[Whisper Setup] ⚠️ Could not download pre-built binary package: ${err.message}`);
    console.warn(`[Whisper Setup] ℹ️ System will attempt PATH lookup for whisper-cli or whisper server at runtime.`);
    return targetBinPath;
  }

  return targetBinPath;
}

async function setupWhisperModel(choice: string): Promise<string> {
  ensureDirSync(VENDOR_DIR);
  ensureDirSync(WHISPER_MODELS_DIR);
  const selected = MODEL_OPTIONS[choice];

  // Clean up legacy loose tiny model at vendor/whisper root if present
  const legacyLooseTinyPath = path.join(VENDOR_DIR, 'ggml-tiny.en.bin');
  if (fs.existsSync(legacyLooseTinyPath)) {
    fs.unlinkSync(legacyLooseTinyPath);
  }

  if (choice === '6' || !selected || !selected.file) {
    console.log('[Whisper Setup] ⏩ Skipping model download.');
    return VENDOR_TINY_MODEL_PATH;
  }

  const targetPath = path.join(WHISPER_MODELS_DIR, selected.file);

  // Tiny model handling: Copy template from assets/whisper/ggml-tiny.en.bin to vendor/whisper/models/
  if (selected.name === 'tiny') {
    if (fs.existsSync(targetPath)) {
      console.log(`[Whisper Setup] ✅ Tiny model present in vendor/whisper/models: ${targetPath}`);
      return targetPath;
    }

    if (fs.existsSync(REPO_TINY_MODEL_PATH)) {
      console.log(`[Whisper Setup] 🚚 Copying tiny model template from assets/whisper to vendor/whisper/models...`);
      fs.copyFileSync(REPO_TINY_MODEL_PATH, targetPath);
      console.log(`[Whisper Setup] ✅ Model ready in vendor/whisper/models: ${targetPath}`);
      return targetPath;
    }
  }

  if (fs.existsSync(targetPath)) {
    console.log(`[Whisper Setup] ✅ Selected model already exists in vendor/whisper/models: ${targetPath}`);
    return targetPath;
  }

  console.log(`[Whisper Setup] 🚀 Fetching model '${selected.name}' (${selected.sizeStr}) into vendor/whisper/models...`);
  await downloadFile(selected.url, targetPath);
  return targetPath;
}

async function main() {
  try {
    ensureDirSync(VENDOR_DIR);

    const choice = await promptUserChoice();
    const modelPath = await setupWhisperModel(choice);
    const binPath = await setupWhisperBinary();

    // Persist selected model into app_preferences.json
    const selected = MODEL_OPTIONS[choice];
    if (selected && selected.name !== 'skip') {
      const prefsPath = path.join(PROJECT_ROOT, 'app_preferences.json');
      try {
        let prefs: Record<string, any> = fs.existsSync(prefsPath)
          ? JSON.parse(fs.readFileSync(prefsPath, 'utf-8'))
          : { ...DEFAULT_APP_SETTINGS };
        prefs.localWhisperModel = selected.name;
        fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), 'utf-8');
        console.log(`[Whisper Setup] ⚙️  Updated app_preferences.json → localWhisperModel: "${selected.name}"`);
      } catch (err: any) {
        console.warn(`[Whisper Setup] ⚠️ Could not update app_preferences.json: ${err.message}`);
      }
    }

    console.log(`[Whisper Setup] 📍 Model ready: ${modelPath}`);
    console.log(`[Whisper Setup] 📍 Binary ready: ${binPath}`);

    console.log('\n==================================================');
    console.log('  🎉 WHISPER VENDOR SETUP COMPLETE!  ');
    console.log('==================================================\n');
  } catch (err) {
    console.error('[Whisper Setup] ❌ Error setting up Whisper:', err);
    process.exit(1);
  }
}

main();
