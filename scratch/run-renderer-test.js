const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  win.loadFile(path.join(__dirname, 'test-renderer-capture.html'));

  setTimeout(async () => {
    const text = await win.webContents.executeJavaScript('document.getElementById("output").innerText');
    console.log('RENDERER RESULT:', text);
    app.quit();
  }, 3000);
});
