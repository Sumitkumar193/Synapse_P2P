# 📺 P2P Screen Share App & Media SDK `v1.0.0-beta`

A production-grade, frameless **Electron P2P Screen Sharing Application & TypeScript SDK**. Features end-to-end encrypted WebRTC audio and video streaming, 6-digit session code handshakes, automatic STUN/TURN fallback relays, multi-window local testing, and system tray integration.

---

## 🌟 Key Features

* **🔑 Quick Session Codes (6-Digit Handshake)**: Generate simple `XXX-XXX` codes for instant 1-click remote connections.
* **🔒 End-to-End Encrypted (E2EE) WebRTC**: High-framerate video and system + microphone audio streamed directly peer-to-peer (DTLS-SRTP).
* **🛡️ Automatic STUN & TURN Relay Fallbacks**:
  * **Cloudflare STUN**: Ultra-fast global Anycast IP discovery (`stun.cloudflare.com:3478`).
  * **Google STUN**: Public IP discovery (`stun.l.google.com:19302`).
  * **TURN Relays**: OpenRelay fallbacks (`openrelay.metered.ca:80/443` over UDP & TCP) for strict corporate firewalls and VPNs.
* **📡 Dual Signaling Providers**:
  * **Electron IPC**: Fast 0ms local loopback signaling for multi-window development.
  * **WebTorrent Trackers**: Automatic failover loop across public WebTorrent WebSocket trackers (`openwebtorrent.com`, `btorrent.xyz`).
* **🖥️ Display & Application Capture**: High-performance Win32 display capturer supporting entire screen and individual application window previews.
* **📌 Minimize to System Tray on Close**: Closing the window hides the application to the Windows System Tray (notification area next to clock) so active streams remain uninterrupted.
* **🛑 Host Controls**: Dedicated `🛑 Stop Sharing` button for immediate stream teardown and session reset.
* **📊 Connection Inspection**: Live connection status badges and terminal/DevTools output detailing active candidate types (`HOST`, `STUN`, `TURN`), IP addresses, and transport protocols via `sdk.getConnectionStats()`.
* **🧪 100% Automated Test Suite**: 11-step TypeScript test runner (`npm test`).

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/your-repo/ScreenShareApp.git
cd ScreenShareApp
npm install
```

### 2. Run Application (Development / Start)
```bash
npm run start
```

### 3. Run Automated Tests
```bash
npm test
```
*Executes 11-step automated verification suite for session code generation, WebRTC ICE server fallbacks, dual-peer signaling handshakes, event listeners, and media safety nets.*

---

## 📦 Building Portable Package (.zip)

To package a clean, 100% compatible portable zip package for users:

```bash
npm run package:portable
```

### Output Package (`release/` directory):
- **`release/P2PScreenShare-Portable.zip`**

### User Usage:
1. Extract `P2PScreenShare-Portable.zip`.
2. Double-click `P2PScreenShare.exe` to run.

---

## 📁 Repository Architecture

```text
ScreenShareApp/
├── assets/                         # Application Icon assets
│   └── icon.jpg                    # Custom 3D P2P App & System Tray Icon
├── src/
│   ├── main/                       # Electron Main Process
│   │   ├── index.ts                # App initialization, System Tray & Window lifecycle
│   │   └── ipc/                    # Main IPC Handlers (Capturer, Signaling, Window Controls)
│   ├── preload/
│   │   └── index.ts                # Secure ContextBridge APIs
│   ├── renderer/                   # Front-End UI
│   │   ├── index.html              # Glassmorphic layout & media viewports
│   │   └── index.ts                # DOM handlers, SDK bindings, and connection logs
│   └── sdk/                        # Core P2P Media SDK
│       ├── index.ts                # P2PMediaSDK main entry class
│       ├── media/                  # MediaManager (getDisplayMedia, Audio mixing)
│       ├── transport/              # WebRTCTransport (RTCPeerConnection, Stats, ICE)
│       ├── signaling/              # WebTorrent & IPC Signaling Providers
│       ├── events/                 # TypedEventEmitter & SDK Event maps
│       └── utils/                  # Logger, Errors, and Helper utilities
├── test/
│   └── index.ts                    # Automated TypeScript Test Suite
└── package.json                    # Essential scripts and dependencies
```

---

## 📜 Essential Scripts Reference

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run start` | `cross-env NODE_ENV=development electron .` | Launch Electron application |
| `npm run build` | `esbuild & tsc` | Bundle main, preload, and renderer TypeScript source |
| `npm test` | `tsx test/index.ts` | Run 11-step automated test suite |
| `npm run typecheck` | `tsc --noEmit` | Check TypeScript type safety |
| `npm run package:portable` | `electron-packager & Compress-Archive` | Build portable ZIP archive (`release/P2PScreenShare-Portable.zip`) |
| `npm run clean` | `rimraf dist release` | Clean compiled output directories |

---

## 📄 License
MIT License
