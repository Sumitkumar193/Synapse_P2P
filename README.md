# 📺 P2P Screen Share App & Media SDK `v1.0.0`

A production-grade, frameless **Electron P2P Screen Sharing Application & TypeScript SDK** built with **React 18** and **Zustand**. Features end-to-end encrypted WebRTC audio and video streaming, 8-character Base36 session code handshakes (`a7k9-x2p4`), STUN/TURN fallback relays, dark mode glassmorphism UI, multi-window local testing, and a zero-installation portable release package.

---

## 🌟 Key Features

* **⚛️ React 18 + Zustand Architecture**: Ultra-modern, responsive front-end powered by React 18 and centralized Zustand (`useAppStore`) state management.
* **🔑 8-Character Base36 Session Codes**: Generate 8-character codes (`a7k9-x2p4`) with **2.82 Trillion combinations ($36^8$)** for high-entropy security.
* **🔒 End-to-End Encrypted (E2EE) WebRTC**: High-framerate video and system + microphone audio streamed directly peer-to-peer (DTLS-SRTP).
* **🎛️ Dynamic Signaling Provider & Live Health Check Dropdown**:
  * **Real-time Startup Health Probing (`sdk.checkSignalingHealth()`)**: Automatically tests provider connectivity on startup and displays `🟢 Active` vs `🔴 Offline` badges in the header dropdown.
  * ⚡ **Auto Priority Cascade** (Multi-Provider Room Probing across Firebase > WebSockets > WebTorrents > Electron IPC > Memory).
  * 🔥 **Firebase Realtime DB** (Serverless HTTPS / SSE Port 443 — `synapse-p2p`).
  * 🌐 **WebSocket Server** (Custom WSS Port 443).
  * 🌀 **WebTorrent Tracker Mesh** (Simultaneous multi-tracker WebSocket mesh broadcasting across `openwebtorrent.com`, `btorrent.xyz`, `files.fm`).
  * 💻 **Electron IPC** (Direct 0ms local loopback).
  * 🧠 **In-Memory Safety Net** (Local testing).
* **🔍 Multi-Provider Room Probing**: When a Joiner connects using **⚡ Auto Cascade**, the SDK probes each signaling provider sequentially to discover where the Host registered the session code.
* **🌐 WebRTC ICE & NAT Traversal Pipeline**:
  * **Host Candidates (LAN)**: Direct zero-latency local network / loopback connection.
  * **STUN Candidates (WAN)**: Public IP NAT Hole Punching (`stun.cloudflare.com:3478`, `stun.l.google.com:19302`).
  * **TURN Relay Candidates**: Metered OpenRelay (UDP & TCP port 443) for strict corporate firewalls.
* **⚖️ WebRTC Perfect Negotiation & Glare Prevention**: Host (`isHost: true`) acts as the impolite offerer while Viewer (`isHost: false`) acts as polite answerer with rollback support, eliminating `INVALID_STATE` dual-offer race conditions.
* **🧊 ICE Candidate Queueing & Staleness Filter**: Queues early candidates arriving before SDP settlement and filters out stale snapshot messages (>30s) from previous sessions.
* **🔒 Source & Settings Locking**: Automatically locks display source cards, audio checkboxes, and rescan controls during active screen sharing sessions.
* **🚀 Transport-First Session Architecture (`sdk.connect()`)**: Decoupled, interface-driven SDK designed for desktop automation, remote support, collaboration software, and AI agents (LangGraph, OpenAI Agents SDK, AutoGen, CrewAI). Exposes pure transport primitives:
  * **`session.media`**: Raw `MediaStreamTrack` access, track replacement, screen publishing, and **Async Iterators** (`session.media.frames()`, `session.media.audio()`).
  * **`session.control`**: Low-level remote interaction APIs over DataChannel (`mouse.move`, `mouse.click`, `keyboard.type`).
  * **`session.clipboard`**: Remote clipboard read, write, and sync (`session.clipboard.write()`).
  * **`session.files`**: Chunked file transfers with progress monitoring (`session.files.send()`).
  * **`session.data`**: Direct DataChannel messaging (`send()`, `sendJson()`, `sendBinary()`).
  * **`session.stats`**: Real-time WebRTC telemetry (`rttMs`, `inboundBitrateKbps`, `packetLossRate`, selected ICE candidates, connection type, codecs, resolution/FPS).
* **📊 Live Telemetry Status**: Real-time status badges distinguishing `Hosting` vs `Viewing` sessions and displaying candidate transport types (`Host LAN`, `STUN WAN`, `TURN Relay`).
* **🧪 100% Automated Test Suite**: 37-step dual-SDK TypeScript test runner (`npm test`).

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
*Executes automated verification suite testing dual-SDK session connections, multi-provider priority signaling cascades (Firebase > WebSockets > WebTorrents > IPC > Memory), media safety nets, and Session transport controllers.*

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
│   │       ├── TitleBar.tsx        # Frameless titlebar with signaling selector & health badges
│   │       ├── SourceCard.tsx      # Display source thumbnail cards
│   │       ├── HostCard.tsx        # Screen share setup & session code display
│   │       ├── ViewerCard.tsx      # Code entry & join controls
│   │       ├── StreamView.tsx      # WebRTC stream viewport & floating control bar
│   │       └── NotificationModal.tsx # Dark mode glassmorphic modal dialogs
│   └── sdk/                        # Core P2P Media SDK
│       ├── index.ts                # P2PMediaSDK main entry class & checkSignalingHealth()
│       ├── session/                # Session Transport Abstraction
│       │   ├── Session.ts          # Aggregate Root (media, control, data, clipboard, files, stats)
│       │   ├── media/              # MediaController & IMediaProvider interface
│       │   ├── control/            # Mouse & Keyboard automation controller
│       │   ├── clipboard/          # Remote clipboard read/write controller
│       │   ├── files/              # Chunked file transfer controller
│       │   ├── data/               # Raw JSON/Binary DataChannel controller & IDataChannel interface
│       │   └── stats/              # Telemetry controller & IStatsProvider interface
│       ├── transport/              # Transport Layer
│       │   ├── interfaces/         # ITransportProvider interface
│       │   └── webrtc/             # WebRTCTransport implementation (Perfect Negotiation & Glare Prevention)
│       ├── media/                  # MediaManager (IMediaProvider implementation)
│       ├── signaling/              # Priority Signaling Providers (Firebase, Fallback, WebTorrent, WSS, IPC, Memory)
│       ├── events/                 # TypedEventEmitter & SDK Event maps
│       └── utils/                  # Logger, Errors, and Helper utilities
├── test/
│   └── index.ts                    # Automated Dual-SDK TypeScript Test Suite
└── package.json                    # Scripts and dependencies
```

---

## 💻 SDK Usage Example (Transport-First Session API)

```typescript
import { P2PMediaSDK, FirebaseSignalingProvider } from 'electron-p2p-media-sdk';

// 1. Instantiate SDK (Uses automatic priority signaling cascade: Firebase > WebSockets > WebTorrents > IPC > Memory)
const sdk = new P2PMediaSDK();

// 2. Check real-time signaling provider health
const health = await sdk.checkSignalingHealth();
console.log('Signaling Health:', health);

// 3. Connect to room as Host (true) or Viewer (false)
const session = await sdk.connect('room-1234', true);

// 4. Media Primitives & Async Iterators for AI Frameworks
await session.media.publishScreen({ sourceId: 'screen:0:0' });

for await (const frame of session.media.frames({ fps: 2 })) {
  console.log(`Processing frame ${frame.width}x${frame.height} at ${frame.timestamp}`);
  break;
}

// 5. Data Channel Messaging & Automation
session.data.sendJson({ action: 'ping', timestamp: Date.now() });
session.control.mouse.click('left', 400, 300);
session.control.keyboard.type('Hello P2P!');

// 6. File Transfers & Remote Clipboard
session.clipboard.write('P2P Clipboard Synchronized');
await session.files.send(buffer, 'document.pdf');

// 7. Real-time Telemetry & Lifecycle Teardown
const telemetry = await session.stats.getStats();
console.log(`RTT: ${telemetry.rttMs}ms | Connection: ${telemetry.connectionTypeDescription}`);

await session.disconnect();
```

---

## 📜 Essential Scripts Reference

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run start` | `npm run build && electron .` | Launch Electron desktop app |
| `npm run build` | `esbuild & tsc` | Bundle main, preload, and renderer React TSX source |
| `npm test` | `tsx test/index.ts` | Run automated test suite |
| `npm run typecheck` | `tsc --noEmit` | Check TypeScript type safety |
| `npm run package:portable` | `electron-packager & Compress-Archive` | Build portable ZIP archive (`release/P2PScreenShare-Portable.zip`) |
| `npm run clean` | `rimraf dist release` | Clean compiled output directories |

---

## 📄 License
MIT License
