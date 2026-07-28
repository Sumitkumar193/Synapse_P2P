const { app, BrowserWindow, session, desktopCapturer } = require('electron');

app.whenReady().then(async () => {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      console.log('SOURCES IN DISPLAY MEDIA HANDLER:', sources.map(s => ({ id: s.id, name: s.name })));
      if (sources.length > 0) {
        callback({ video: sources[0] });
      } else {
        callback({});
      }
    } catch(err) {
      console.error('HANDLING ERROR:', err);
      callback({});
    }
  });

  const win = new BrowserWindow({ width: 400, height: 300, show: false });
  await win.loadURL('data:text/html,<h1>Test</h1>');

  const result = await win.webContents.executeJavaScript(`
    navigator.mediaDevices.getDisplayMedia({ video: true })
      .then(s => s.getTracks()[0].label)
      .catch(e => e.message)
  `);
  console.log('DISPLAY MEDIA RESULT:', result);

  app.quit();
});
