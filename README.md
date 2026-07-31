# 📺 P2P Screen Share App & Live AI Interview Copilot Platform `v1.0.0`

A production-grade, frameless **Electron P2P Screen Sharing Application, Media SDK & Live AI Interview Copilot Platform** built with **TypeScript**, **React 18**, and **Zustand**. Features end-to-end encrypted WebRTC audio and video streaming, local/cloud Whisper Speech-to-Text transcription, decoupled LLM engines (OpenAI, Ollama, Claude CLI), declarative workflow automation, an in-memory Model Context Protocol (MCP) tool adapter, isolated Node.js VM plugin sandboxing, and a persistent glassmorphic Settings Panel.

---

## 🌟 Key Features

### 📺 P2P Media & WebRTC SDK
* **⚛️ React 18 + Zustand Architecture**: Ultra-modern, responsive front-end powered by React 18 and centralized Zustand (`useAppStore`) state management.
* **🔑 8-Character Base36 Session Codes**: Generate 8-character codes (`a7k9-x2p4`) with **2.82 Trillion combinations ($36^8$)** for high-entropy security.
* **🔒 End-to-End Encrypted (E2EE) WebRTC**: High-framerate video and system + microphone audio streamed directly peer-to-peer (DTLS-SRTP).
* **🎛️ Dynamic Signaling Provider & Auto Cascade**:
  * ⚡ **Auto Priority Cascade** (Multi-Provider Room Probing across Firebase > WebSockets > WebTorrents > Electron IPC > Memory).
  * 🔥 **Firebase Realtime DB** (Serverless HTTPS / SSE Port 443 — `synapse-p2p`).
  * 🌐 **WebSocket Server** (Custom WSS Port 443).
  * 🌀 **WebTorrent Tracker Mesh** (Simultaneous multi-tracker WebSocket mesh broadcasting).
  * 💻 **Electron IPC** (Direct 0ms local loopback).
* **🌐 WebRTC ICE & NAT Traversal Pipeline**: Direct Host LAN, STUN Public WAN NAT Hole Punching (`stun.cloudflare.com:3478`), and metered TURN Relay fallback.

---

### 🤖 Live AI Copilot & Workflow Engine Architecture
* **🎙️ Speech-To-Text (Whisper) Engine**:
  * **Local STT**: Native C++ `whisper-cli.exe` integration running bundled `ggml-tiny.en.bin` model files (~2ms inference execution time).
  * **Cloud STT**: OpenAI Cloud Audio Whisper API integration.
  * **LocalAgreement-n Filter**: Real-time transcript stabilization filter emitting instant `transcript.partial` and verified `transcript.final` events.
* **🧠 Decoupled LLM Engine (`ILLMProvider`)**:
  * **OpenAI REST API** (`gpt-4o-mini`, `gpt-4o`).
  * **Ollama Local LLM** (`http://localhost:11434` — `llama3.2`, `mistral`).
  * **Claude System CLI** (`claude` command execution).
* **⚡ Declarative Workflow Engine**: Matches event triggers against rules and routes sensitive tool actions to the Pending Approval Queue.
* **🔌 Embedded In-Memory MCP Adapter**:
  * JSON-RPC 2.0 implementation (`initialize`, `tools/list`, `tools/call`) managing 12 MCP tools.
  * **Category A (Worker-Local)**: `send_chat`, `chat_history`, `participants`, `summarize_session`.
  * **Category B (IPC-Proxied OS Tools)**: `capture_screen`, `capture_window`, `clipboard_read`, `clipboard_write`, `recording_start`, `recording_stop`.
* **🛡️ Plugin Sandbox Architecture**:
  * Isolated Node.js `node:vm` sandbox hiding dangerous host modules (`fs`, `net`, `child_process`).
  * **Per-Plugin Crash Shielding** (`try/catch` wrapper) preventing faulty plugin code from crashing host windows or media feeds.
  * **Strict Timeout Enforcement** (100ms infinite loop protection).
  * Capability-Scoped API Bridge (`api.registerTool`, `api.onEvent`, `api.emitEvent`, `api.log`).
* **⚙️ Dynamic Settings Panel & Preferences Store**:
  * Persistent storage (`app_preferences.json`) in Electron `userData` directory.
  * Glassmorphism Settings modal UI for configuring STT models, LLM providers, API keys, CPU threads, and MCP servers without hardcoded environment variables.
  * Streamlined **Navbar Dropdown Menu (`⚙️ Menu ▾`)** in top titlebar.

---

## 🏗️ Platform Architecture Diagram

```text
                                    +-------------------------------------------------------+
                                    |                 P2P MEDIA SDK                         |
                                    |       (session.media.audio, session.media.frames)     |
                                    +---------------------------+---------------------------+
                                                                | PCM Audio Taps
                                                                v
+-----------------------------------------------------------------------------------------------------------------------+
|                                                   MAIN PROCESS (Node.js)                                               |
|                                                                                                                       |
|  +-----------------------+    +---------------------------+    +-----------------------+    +-----------------------+ |
|  | AudioWorkerController |    |     RealtimeBus Server    |    | MainIPCProxyHandler   |    |   SettingsManager     | |
|  | (16kHz PCM Buffer)    |--->|    (127.0.0.1 HTTP/WS)    |    | (Category B OS Tools) |    | (app_preferences.json)| |
|  +-----------+-----------+    +-------------+-------------+    +-----------------------+    +-----------------------+ |
+--------------|------------------------------|-------------------------------------------------------------------------+
               |                              | WS Events
               v                              v
+-----------------------------------------------------------------------------------------------------------------------+
|                                                WORKER & ENGINE LAYER                                                  |
|                                                                                                                       |
|  +-----------------------+    +---------------------------+    +-----------------------+    +-----------------------+ |
|  | Whisper STT Engine    |    |      WorkflowEngine       |    |  AgentWorker / LLM    |    |  PluginSandbox (VM)   | |
|  | (LocalAgreement-n)    |--->|   (Trigger->Rule->Action) |--->| (OpenAI/Ollama/Claude) |    | (Crash Shield & T/O)  | |
|  +-----------------------+    +-------------+-------------+    +-----------------------+    +-----------------------+ |
|                                             |                                                                         |
|                               +-------------v-------------+                                                           |
|                               |    In-Memory MCP Adapter  |                                                           |
|                               | (Pending Approval Queue)  |                                                           |
|                               +-------------+-------------+                                                           |
+---------------------------------------------|-------------------------------------------------------------------------+
                                              | Chat & Approval Cards
                                              v
+-----------------------------------------------------------------------------------------------------------------------+
|                                            RENDERER / IN-APP CHAT BAR                                                 |
|                                [ChatStreamComponent & Inline Approval Cards]                                          |
+-----------------------------------------------------------------------------------------------------------------------+
```

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

### 3. Run Automated Test Suite (93 Assertions)
```bash
npm test
```
*Executes 19-section automated verification suite testing P2P WebRTC SDK, priority fallback signaling, audio pipeline, Whisper STT, LLM providers, Workflow Engine, MCP Adapter, Plugin Sandbox, IPC Proxy, and Settings Store.*

---

## 📁 Repository Architecture

```text
ScreenShareApp/
├── assets/                         # Application Icon & Native Whisper Binary assets
│   ├── icon.jpg                    # Custom 3D P2P App Icon
│   └── whisper/                    # Native whisper-cli.exe & ggml-tiny.en.bin model
├── FRD.md                          # Functional Requirements Document
├── release/                        # Packaged Standalone Portable Output
│   └── P2PScreenShare-Portable.zip # Standalone Portable Executable Zip
├── src/
│   ├── agent/                      # AI Agent Architecture
│   │   ├── ai/                     # LLM Providers (OpenAI, Ollama, Claude CLI)
│   │   ├── mcp/                    # Embedded In-Memory MCP Adapter & Approval Queue
│   │   └── transcription/          # Speech-To-Text Providers & LocalAgreement-n
│   ├── main/                       # Electron Main Process
│   │   ├── index.ts                # App lifecycle, Frameless Titlebar & IPC Setup
│   │   ├── ipcProxy.ts             # Main-Process Security IPC Proxy for OS Tools
│   │   ├── settingsManager.ts      # Persistent Preferences Store (userData/app_preferences.json)
│   │   └── ipc/                    # Main IPC Handlers
│   ├── plugin/                     # Plugin Sandbox Architecture
│   │   ├── PluginSandbox.ts        # Isolated Node.js vm Sandbox with Crash Shield & Timeouts
│   │   ├── PluginManager.ts        # Lifecycle Manager & Capability-Scoped API Bridge
│   │   └── builtin/                # Built-in Plugins (AutoSummaryPlugin)
│   ├── realtime/                   # Realtime Bus & Audio Pipeline
│   │   ├── RealtimeBus.ts          # 127.0.0.1 Loopback WebSocket/HTTP Server
│   │   └── RingBuffer.ts           # 1MB PCM RingBuffer with drop-oldest backpressure
│   ├── shared/                     # Shared Foundations
│   │   ├── Container.ts            # Lightweight DI Service Container
│   │   ├── EventBus.ts             # Strongly-typed Pub/Sub Event Bus
│   │   ├── settings.ts             # AppSettings Schema & Default Preferences
│   │   └── tools.ts                # 12 MCP Tool Definitions & Zod Schemas
│   ├── workers/                    # Worker Controllers
│   │   ├── agentWorker.ts          # AgentWorkerController (LLM + Workflow Engine)
│   │   └── audioWorker.ts          # AudioWorkerController (PCM Audio Pipeline)
│   ├── preload/
│   │   └── index.ts                # ContextBridge IPC APIs (getSettings, saveSettings)
│   ├── renderer/                   # Front-End UI (React 18 + Zustand)
│   │   ├── index.html              # Glassmorphic layout & responsive CSS styling
│   │   ├── index.tsx               # React 18 DOM mount script
│   │   ├── App.tsx                 # Root React container & SDK event handling
│   │   └── components/             # UI Components
│   │       ├── TitleBar.tsx        # TitleBar with clean Navbar Dropdown Menu (⚙️ Menu ▾)
│   │       ├── ChatStream.ts       # Glassmorphic Chat Bar & Inline Approval Prompt Cards
│   │       ├── SettingsPanel.ts    # Preferences & AI Settings Modal Component
│   │       ├── HostCard.tsx        # Screen share setup & session code display
│   │       └── StreamView.tsx      # WebRTC stream viewport & control bar
│   └── sdk/                        # Core P2P Media SDK
├── test/
│   └── index.ts                    # Automated 19-Section Dual-SDK Test Suite (93 PASSED)
└── package.json                    # Scripts and dependencies
```

---

## 📜 Essential Scripts Reference

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run start` | `npm run build && electron .` | Launch Electron desktop application |
| `npm run build` | `esbuild & tsc` | Bundle main, preload, and renderer React TSX source |
| `npm test` | `tsx test/index.ts` | Run 19-section automated verification test suite (93 PASSED) |
| `npm run typecheck` | `tsc --noEmit` | Check TypeScript type safety |
| `npm run package:portable` | `electron-packager & Compress-Archive` | Build portable ZIP package (`release/P2PScreenShare-Portable.zip`) |
| `npm run clean` | `rimraf dist release` | Clean compiled output directories |

---

## 📄 License
MIT License
