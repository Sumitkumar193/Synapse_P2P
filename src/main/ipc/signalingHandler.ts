import { ipcMain, BrowserWindow } from 'electron';

interface RoomPeer {
  peerId: string;
  windowId: number;
}

const rooms: Map<string, Map<string, RoomPeer>> = new Map();

export function setupSignalingIPC(): void {
  ipcMain.on('SIGNALING_JOIN_ROOM', (event, { roomId, peerId }) => {
    const windowId = event.sender.id;
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const room = rooms.get(roomId)!;
    room.set(peerId, { peerId, windowId });

    // Notify other peers in room about peer-joined
    const message = {
      type: 'peer-joined',
      senderId: peerId,
      roomId,
      timestamp: Date.now(),
    };

    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.webContents.id !== windowId && !win.isDestroyed()) {
        win.webContents.send('SIGNALING_MESSAGE', message);
      }
    });
  });

  ipcMain.on('SIGNALING_LEAVE_ROOM', (event, { roomId, peerId }) => {
    const windowId = event.sender.id;
    const room = rooms.get(roomId);
    if (room) {
      room.delete(peerId);
      if (room.size === 0) {
        rooms.delete(roomId);
      }
    }

    const message = {
      type: 'peer-left',
      senderId: peerId,
      roomId,
      timestamp: Date.now(),
    };

    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.webContents.id !== windowId && !win.isDestroyed()) {
        win.webContents.send('SIGNALING_MESSAGE', message);
      }
    });
  });

  ipcMain.on('SIGNALING_SEND_MESSAGE', (event, message) => {
    const windowId = event.sender.id;
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.webContents.id !== windowId && !win.isDestroyed()) {
        win.webContents.send('SIGNALING_MESSAGE', message);
      }
    });
  });
}
