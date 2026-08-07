import { ModelDownloadProgressPayload } from '../../main/whisperDownloader';

export class WhisperDownloadModalComponent {
  private containerEl: HTMLElement | null = null;
  private isVisible = false;
  private currentProgress: ModelDownloadProgressPayload | null = null;
  private unsubscribeProgress: (() => void) | null = null;

  public mount(container: HTMLElement): void {
    this.containerEl = container;
    if (typeof window !== 'undefined') {
      (window as any).whisperDownloadModalInstance = this;
    }

    if (typeof window !== 'undefined' && (window as any).electronAPI?.onModelDownloadProgress) {
      this.unsubscribeProgress = (window as any).electronAPI.onModelDownloadProgress((progress: ModelDownloadProgressPayload) => {
        this.updateProgress(progress);
      });
    }
  }

  public unmount(): void {
    if (this.unsubscribeProgress) {
      this.unsubscribeProgress();
      this.unsubscribeProgress = null;
    }
    this.hide();
  }

  public show(modelName: string = 'tiny', fileName: string = 'ggml-tiny.bin'): void {
    this.isVisible = true;
    this.currentProgress = {
      modelName,
      fileName,
      progressPct: 0,
      downloadedMB: 0,
      totalMB: 0,
      status: 'downloading',
    };
    this.render();
  }

  public updateProgress(progress: ModelDownloadProgressPayload): void {
    this.currentProgress = progress;
    if (progress.status === 'downloading' || progress.status === 'error') {
      this.isVisible = true;
      this.render();
    } else if (progress.status === 'completed') {
      this.currentProgress.progressPct = 100;
      this.render();
      setTimeout(() => {
        this.hide();
      }, 1200);
    }
  }

  public hide(): void {
    this.isVisible = false;
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
    }
  }

  public render(): void {
    if (!this.containerEl || !this.isVisible || !this.currentProgress) return;

    const { modelName, fileName, progressPct, downloadedMB, totalMB, status, error } = this.currentProgress;

    const isError = status === 'error';
    const isCompleted = status === 'completed';

    this.containerEl.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      ">
        <div style="
          background: rgba(30, 41, 59, 0.95);
          border: 1px solid rgba(99, 102, 241, 0.35);
          border-radius: 16px;
          padding: 28px 32px;
          width: 440px;
          max-width: 90vw;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(99, 102, 241, 0.2);
          color: #f8fafc;
          animation: popIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        ">
          <!-- Header -->
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <div style="
              width: 44px;
              height: 44px;
              border-radius: 12px;
              background: linear-gradient(135deg, #6366f1, #8b5cf6);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.4rem;
              box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
            ">
              🎙️
            </div>
            <div>
              <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #ffffff;">Whisper STT Model Download</h3>
              <p style="margin: 2px 0 0 0; font-size: 0.8rem; color: #94a3b8;">
                Downloading model weights for local offline speech recognition
              </p>
            </div>
          </div>

          <!-- Model Info Pill -->
          <div style="
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 10px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
          ">
            <div>
              <span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; display: block;">Active Model</span>
              <strong style="font-size: 0.95rem; color: #818cf8;">${fileName}</strong>
            </div>
            <span style="
              background: rgba(99, 102, 241, 0.15);
              color: #a5b4fc;
              font-size: 0.75rem;
              font-weight: 600;
              padding: 4px 8px;
              border-radius: 6px;
              border: 1px solid rgba(99, 102, 241, 0.3);
            ">
              ${modelName.toUpperCase()}
            </span>
          </div>

          <!-- Progress Bar Container -->
          <div style="margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 0.85rem; color: #cbd5e1; font-weight: 500;">
                ${isCompleted ? '✅ Model Ready!' : isError ? '❌ Download Failed' : 'Downloading...'}
              </span>
              <span style="font-size: 0.85rem; font-weight: 700; color: #a5b4fc;">
                ${progressPct}%
              </span>
            </div>

            <!-- Track -->
            <div style="
              height: 10px;
              width: 100%;
              background: rgba(15, 23, 42, 0.8);
              border-radius: 999px;
              overflow: hidden;
              border: 1px solid rgba(255, 255, 255, 0.05);
            ">
              <!-- Fill -->
              <div style="
                height: 100%;
                width: ${progressPct}%;
                background: ${isError ? '#ef4444' : isCompleted ? '#10b981' : 'linear-gradient(90deg, #6366f1, #3b82f6)'};
                border-radius: 999px;
                transition: width 0.2s ease-out;
                box-shadow: 0 0 10px ${isError ? 'rgba(239, 68, 68, 0.5)' : isCompleted ? 'rgba(16, 185, 129, 0.5)' : 'rgba(99, 102, 241, 0.5)'};
              "></div>
            </div>
          </div>

          <!-- Live Stats Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; color: #94a3b8; margin-bottom: 20px;">
            <span>
              ${downloadedMB > 0 || totalMB > 0 ? `${downloadedMB} MB / ${totalMB} MB` : 'Connecting to HuggingFace...'}
            </span>
            <span>
              ${isCompleted ? 'Complete' : isError ? 'Failed' : 'HuggingFace CDN'}
            </span>
          </div>

          <!-- Error details if failed -->
          ${isError ? `
            <div style="
              background: rgba(239, 68, 68, 0.1);
              border: 1px solid rgba(239, 68, 68, 0.3);
              color: #fca5a5;
              border-radius: 8px;
              padding: 10px 12px;
              font-size: 0.8rem;
              margin-bottom: 16px;
            ">
              ⚠️ ${error || 'Network error occurred while fetching model file.'}
            </div>
            <div style="display: flex; justify-content: flex-end;">
              <button 
                onclick="window.whisperDownloadModalInstance?.hide()"
                style="
                  background: rgba(148, 163, 184, 0.2);
                  border: 1px solid rgba(255, 255, 255, 0.1);
                  color: #cbd5e1;
                  padding: 8px 16px;
                  border-radius: 8px;
                  font-size: 0.85rem;
                  cursor: pointer;
                "
              >
                Dismiss
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}
