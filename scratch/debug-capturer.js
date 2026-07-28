const { app, desktopCapturer, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  console.log('--- TEST WITH THUMBNAIL SIZE { width: 150, height: 150 } ---');
  const win = new BrowserWindow({ width: 600, height: 400 });

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 },
    });
    console.log(`FOUND ${sources.length} SOURCES:`);
    sources.forEach((s, idx) => {
      console.log(`  [${idx + 1}] ID: ${s.id} | Name: "${s.name}" | Thumbnail Empty: ${s.thumbnail.isEmpty()} | DataURL Length: ${s.thumbnail.toDataURL().length}`);
    });
  } catch (err) {
    console.error('ERROR:', err);
  }

  console.log('--- END TEST ---');
  setTimeout(() => app.quit(), 1000);
});
