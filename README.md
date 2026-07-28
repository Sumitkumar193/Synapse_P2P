# 📺 P2P Screen Share App & Media SDK `v1.0.0`

A production-grade, frameless **Electron P2P Screen Sharing Application & TypeScript SDK** built with **React 18** and **Zustand**. Features end-to-end encrypted WebRTC audio and video streaming, 8-character Base36 session code handshakes (`a7k9-x2p4`), STUN/TURN fallback relays, dark mode glassmorphism UI, multi-window local testing, and a zero-installation portable release package.

---

## 🌟 Key Features

* **⚛️ React 18 + Zustand Architecture**: Ultra-modern, responsive front-end powered by React 18 and centralized Zustand (`useAppStore`) state management.
* **🔑 8-Character Base36 Session Codes**: Generate 8-character codes (`a7k9-x2p4`) with **2.82 Trillion combinations ($36^8$)** for high-entropy security.
* **🔒 End-to-End Encrypted (E2EE) WebRTC**: High-framerate video and system + microphone audio streamed directly peer-to-peer (DTLS-SRTP).
* **🛡️ STUN & TURN Relay Pipeline**:
  * **Cloudflare STUN**: Ultra-fast global Anycast IP discovery (`stun.cloudflare.com:3478`).
  * **Google STUN**: Public IP discovery (`stun.l.google.com:19302`).
  * **Metered STUN & TURN Relays**: Pre-configured with OpenRelay (UDP & TCP port 443) for firewalls.
* **📡 Dual Signaling Providers**:
  * **Electron IPC**: Fast 0ms local loopback signaling for multi-window development.
  * **WebTorrent Trackers**: Automatic failover loop across public WebTorrent WebSocket trackers (`openwebtorrent.com`, `btorrent.xyz`).
* **🧊 ICE Candidate Queueing**: Safely queues network candidates arriving before SDP description settlement to prevent connection drops on restricted networks.
* **🔒 Source & Settings Locking**: Automatically locks display source cards, audio checkboxes, and rescan controls during active screen sharing sessions.
* **🛑 Clean Teardown & Custom Modals**: Native dark-mode glassmorphic `<NotificationModal />` dialogs (replacing browser alerts) and direct status badge updates (`🟢 Ready`).
* **🎛️ Ultra-Modern Floating Controls**: Compact glassmorphic pill bar with mute, fullscreen toggle with `Esc` key sync, and end session controls.
* **🤖 AI Agent Exposure API (`sdk.ai`)**: Built-in exposure for raw video, mic, speaker tracks, WebAudio combined audio mixing (for Whisper STT), and on-demand `takeScreenshot()` for Vision LLMs.
* **📊 Connection Inspection**: Live connection status badges detailing active candidate types (`HOST`, `STUN`, `TURN`), IP addresses, and transport protocols via `sdk.getConnectionStats()`.
* **🧪 100% Automated Test Suite**: 17-step TypeScript test runner (`npm test`).

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.org/your-repo/ScreenShareApp.git
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
*Executes 11-step automated verification suite for session code generation, WebRTC ICE server fallbacks, dual-peer signaling handshakes, typed event emitters, and media safety nets.*

---

## 📦 Building Standalone Portable Package (.zip)

To build a standalone Windows portable ZIP package:

```bash
npm run package:portable
```

### Output Artifacts (`release/` directory):
- **`release/P2PScreenShare-Portable.zip`**
- **`release/P2PScreenShare-win32-x64/P2PScreenShare.exe`**

### User Usage:
1. Extract `P2PScreenShare-Portable.zip`.
2. Double-click `P2PScreenShare.exe` to run (no installation required).

---

## 📁 Repository Architecture

```text
ScreenShareApp/
├── assets/                         # Application Icon assets
│   └── icon.jpg                    # Custom 3D P2P App Icon
├── release/                        # Packaged Standalone Portable Output
│   └── P2PScreenShare-Portable.zip # Standalone Portable Executable Zip
├── src/
│   ├── main/                       # Electron Main Process
│   │   ├── index.ts                # Window lifecycle, Frameless Titlebar & IPC Setup
│   │   └── ipc/                    # Main IPC Handlers (Capturer, Signaling)
│   ├── preload/
│   │   └── index.ts                # ContextBridge IPC APIs
│   ├── renderer/                   # Front-End UI (React 18 + Zustand)
│   │   ├── index.html              # Glassmorphic layout & responsive CSS styling
│   │   ├── index.tsx               # React 18 DOM mount script
│   │   ├── App.tsx                 # Root React container & SDK event handling
│   │   ├── store/
│   │   │   └── useAppStore.ts      # Zustand global state store
│   │   └── components/             # Componentized UI
│   │       ├── TitleBar.tsx        # Integrated frameless window title bar
│   │       ├── SourceCard.tsx      # Display source thumbnail cards
│   │       ├── HostCard.tsx        # Screen share setup & session code display
│   │       ├── ViewerCard.tsx      # Code entry & join controls
│   │       ├── StreamView.tsx      # WebRTC stream viewport & floating control bar
│   │       └── NotificationModal.tsx # Dark mode glassmorphic modal dialogs
│   └── sdk/                        # Core P2P Media SDK
│       ├── index.ts                # P2PMediaSDK main entry class
│       ├── media/                  # MediaManager (getDisplayMedia, Audio mixing)
│       ├── transport/              # WebRTCTransport (RTCPeerConnection, Stats, ICE Queueing)
│       ├── signaling/              # WebTorrent & IPC Signaling Providers
│       ├── events/                 # TypedEventEmitter & SDK Event maps
│       └── utils/                  # Logger, Errors, and Helper utilities
├── test/
│   └── index.ts                    # Automated TypeScript Test Suite
└── package.json                    # Scripts and dependencies
```

---

## 📜 Essential Scripts Reference

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run start` | `npm run build && electron .` | Launch Electron desktop app |
| `npm run build` | `esbuild & tsc` | Bundle main, preload, and renderer React TSX source |
| `npm test` | `tsx test/index.ts` | Run 11-step automated test suite |
| `npm run typecheck` | `tsc --noEmit` | Check TypeScript type safety |
| `npm run package:portable` | `electron-packager & Compress-Archive` | Build portable ZIP archive (`release/P2PScreenShare-Portable.zip`) |
| `npm run clean` | `rimraf dist release` | Clean compiled output directories |

---

## 📄 License
MIT License
