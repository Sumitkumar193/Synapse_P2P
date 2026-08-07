import { app, ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { WHISPER_MODELS, WhisperModelMetadata } from '../shared/whisperModels';

export interface ModelDownloadProgressPayload {
  modelName: string;
  fileName: string;
  progressPct: number;
  downloadedMB: number;
  totalMB: number;
  status: 'idle' | 'downloading' | 'completed' | 'error';
  error?: string;
}

export function getModelsDirectory(): string {
  const userDataDir = typeof app !== 'undefined' && app ? app.getPath('userData') : process.cwd();
  const modelsDir = path.join(userDataDir, 'models');
  if (!fs.existsSync(modelsDir)) {
    try {
      fs.mkdirSync(modelsDir, { recursive: true });
    } catch {}
  }
  return modelsDir;
}

export function getModelFileName(modelName: string, isMultilingual: boolean = true): string {
  const meta = WHISPER_MODELS[modelName] || WHISPER_MODELS['tiny'];
  return isMultilingual ? meta.multilingualFile : meta.englishFile;
}

export function getModelUrl(modelName: string, isMultilingual: boolean = true): string {
  const meta = WHISPER_MODELS[modelName] || WHISPER_MODELS['tiny'];
  return isMultilingual ? meta.multilingualUrl : meta.englishUrl;
}

export function checkModelExists(modelName: string, isMultilingual: boolean = true): { exists: boolean; filePath?: string; fileName: string } {
  const fileName = getModelFileName(modelName, isMultilingual);
  const modelsDir = getModelsDirectory();
  const userDataPath = path.join(modelsDir, fileName);

  if (fs.existsSync(userDataPath)) {
    return { exists: true, filePath: userDataPath, fileName };
  }

  // Check vendor models dir
  const vendorPath = path.join(process.cwd(), 'vendor', 'whisper', 'models', fileName);
  if (fs.existsSync(vendorPath)) {
    return { exists: true, filePath: vendorPath, fileName };
  }

  // Check assets dir
  const assetPath = path.join(process.cwd(), 'assets', 'whisper', fileName);
  if (fs.existsSync(assetPath)) {
    return { exists: true, filePath: assetPath, fileName };
  }

  // Also check if any model of that size exists (e.g., .en variant fallback)
  const altFileName = isMultilingual ? WHISPER_MODELS[modelName]?.englishFile : WHISPER_MODELS[modelName]?.multilingualFile;
  if (altFileName) {
    const altUserData = path.join(modelsDir, altFileName);
    if (fs.existsSync(altUserData)) return { exists: true, filePath: altUserData, fileName: altFileName };
    const altVendor = path.join(process.cwd(), 'vendor', 'whisper', 'models', altFileName);
    if (fs.existsSync(altVendor)) return { exists: true, filePath: altVendor, fileName: altFileName };
    const altAsset = path.join(process.cwd(), 'assets', 'whisper', altFileName);
    if (fs.existsSync(altAsset)) return { exists: true, filePath: altAsset, fileName: altFileName };
  }

  return { exists: false, fileName };
}

let activeDownloadReq: http.ClientRequest | null = null;

export function downloadWhisperModel(
  modelName: string,
  isMultilingual: boolean = true,
  webContents?: Electron.WebContents | null
): Promise<{ success: boolean; filePath: string; error?: string }> {
  return new Promise((resolve) => {
    const fileName = getModelFileName(modelName, isMultilingual);
    const downloadUrl = getModelUrl(modelName, isMultilingual);
    const destDir = getModelsDirectory();
    const destPath = path.join(destDir, fileName);
    const tempPath = path.join(destDir, `${fileName}.tmp`);

    const notifyProgress = (payload: ModelDownloadProgressPayload) => {
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('WHISPER_MODEL_DOWNLOAD_PROGRESS', payload);
      }
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed() && win.webContents !== webContents) {
          win.webContents.send('WHISPER_MODEL_DOWNLOAD_PROGRESS', payload);
        }
      });
    };

    notifyProgress({
      modelName,
      fileName,
      progressPct: 0,
      downloadedMB: 0,
      totalMB: WHISPER_MODELS[modelName]?.sizeMB || 100,
      status: 'downloading',
    });

    console.log(`[WhisperDownloader] 🚀 Starting download: ${fileName} from ${downloadUrl}`);

    const requestFile = (currentUrl: string) => {
      const parsedUrl = new URL(currentUrl);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      activeDownloadReq = protocol.get(currentUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, currentUrl).toString();
          requestFile(redirectUrl);
          return;
        }

        if (res.statusCode !== 200) {
          const err = `HTTP Status Code ${res.statusCode}`;
          notifyProgress({
            modelName,
            fileName,
            progressPct: 0,
            downloadedMB: 0,
            totalMB: 0,
            status: 'error',
            error: err,
          });
          resolve({ success: false, filePath: '', error: err });
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastProgressPct = -1;

        const fileStream = fs.createWriteStream(tempPath);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const total = totalBytes > 0 ? totalBytes : (WHISPER_MODELS[modelName]?.sizeMB || 100) * 1024 * 1024;
          const pct = Math.min(100, Math.floor((downloadedBytes / total) * 100));

          if (pct !== lastProgressPct) {
            lastProgressPct = pct;
            notifyProgress({
              modelName,
              fileName,
              progressPct: pct,
              downloadedMB: parseFloat((downloadedBytes / (1024 * 1024)).toFixed(1)),
              totalMB: parseFloat((total / (1024 * 1024)).toFixed(1)),
              status: 'downloading',
            });
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath);
              }
              fs.renameSync(tempPath, destPath);
              console.log(`[WhisperDownloader] ✅ Download completed successfully: ${destPath}`);

              notifyProgress({
                modelName,
                fileName,
                progressPct: 100,
                downloadedMB: parseFloat((downloadedBytes / (1024 * 1024)).toFixed(1)),
                totalMB: parseFloat((downloadedBytes / (1024 * 1024)).toFixed(1)),
                status: 'completed',
              });

              resolve({ success: true, filePath: destPath });
            } catch (err: any) {
              notifyProgress({
                modelName,
                fileName,
                progressPct: 0,
                downloadedMB: 0,
                totalMB: 0,
                status: 'error',
                error: err.message,
              });
              resolve({ success: false, filePath: '', error: err.message });
            }
          });
        });

        fileStream.on('error', (err) => {
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
          notifyProgress({
            modelName,
            fileName,
            progressPct: 0,
            downloadedMB: 0,
            totalMB: 0,
            status: 'error',
            error: err.message,
          });
          resolve({ success: false, filePath: '', error: err.message });
        });
      });

      activeDownloadReq.on('error', (err) => {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
        notifyProgress({
          modelName,
          fileName,
          progressPct: 0,
          downloadedMB: 0,
          totalMB: 0,
          status: 'error',
          error: err.message,
        });
        resolve({ success: false, filePath: '', error: err.message });
      });
    };

    requestFile(downloadUrl);
  });
}

export function setupWhisperDownloaderIPC(): void {
  ipcMain.handle('CHECK_MODEL_EXISTS', (_event, { modelName, isMultilingual }: { modelName: string; isMultilingual?: boolean }) => {
    return checkModelExists(modelName, isMultilingual !== false);
  });

  ipcMain.handle('DOWNLOAD_WHISPER_MODEL', async (event, { modelName, isMultilingual }: { modelName: string; isMultilingual?: boolean }) => {
    return await downloadWhisperModel(modelName, isMultilingual !== false, event.sender);
  });
}
