const { app, BrowserWindow, desktopCapturer } = require('electron');

// Enable Windows Graphics Capture (WGC) for WebRTC on Windows 10/11
app.commandLine.appendSwitch('enable-features', 'WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer');

app.whenReady().then(async () => {
  console.log('--- WGC TEST START ---');
  const win = new BrowserWindow({ width: 400, height: 300, show: false });

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 200, height: 130 },
      fetchWindowIcons: true,
    });

    console.log(`TOTAL SOURCES FOUND (${sources.length}):`);
    sources.forEach((s, idx) => {
      console.log(`  [${idx + 1}] ID: ${s.id} | Name: "${s.name}"`);
    });
  } catch (err) {
    console.error('WGC TEST ERROR:', err);
  }

  console.log('--- WGC TEST END ---');
  app.quit();
});
