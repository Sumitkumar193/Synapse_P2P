import { ipcMain, desktopCapturer } from 'electron';

export function setupDesktopCapturerIPC(): void {
  ipcMain.handle('GET_DESKTOP_SOURCES', async (_event, options) => {
    try {
      const types = options?.types || ['screen', 'window'];
      const thumbnailSize = options?.thumbnailSize || { width: 300, height: 200 };
      
      const sources = await desktopCapturer.getSources({
        types,
        thumbnailSize,
        fetchWindowIcons: true,
      });

      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : undefined,
        display_id: source.display_id,
        appIcon: source.appIcon && !source.appIcon.isEmpty() ? source.appIcon.toDataURL() : undefined,
      }));
    } catch (err: any) {
      console.error('Error fetching desktop capturer sources in main process:', err);
      throw err;
    }
  });
}
