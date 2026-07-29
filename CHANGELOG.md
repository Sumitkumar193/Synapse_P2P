# 📜 Changelog

All notable changes to the **Electron P2P Screen Share App & Media SDK** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-07-29

### 🚀 Added
- **Dynamic Signaling Provider Selection Dropdown**: Integrated signaling provider selector in the frameless titlebar allowing users to select between Auto Cascade, Firebase Realtime DB, Custom WebSockets, WebTorrent Trackers, Electron IPC, and Memory.
- **Real-Time Signaling Health Check (`sdk.checkSignalingHealth()`)**: Probes provider connectivity (HTTPS GET for Firebase, WebSocket handshakes for WSS and WebTorrent trackers) on application launch and displays `🟢 Active` vs `🔴 Offline` badges in the UI dropdown.
- **Multi-Provider Room Probing (`FallbackSignalingProvider`)**: When a Joiner connects using Auto Cascade, the SDK probes each provider sequentially (Firebase -> WebSockets -> WebTorrent -> IPC -> Memory) until it finds where the Host registered the session code.
- **WebTorrent Multi-Tracker Mesh (`WebTorrentSignalingProvider`)**: Connects to all reachable public WebTorrent trackers (`openwebtorrent.com`, `btorrent.xyz`, `files.fm`) simultaneously and broadcasts signaling messages across all open tracker sockets in parallel.
- **Transport-First Session Architecture (`sdk.connect()`)**: Completely decoupled interface-driven SDK exposing `session.media`, `session.control`, `session.clipboard`, `session.files`, `session.data`, and `session.stats`.
- **Async Iterators for AI Frameworks**: `session.media.frames()` and `session.media.audio()` async iterators for real-time video/audio frame sampling in AI agent pipelines (LangGraph, OpenAI Agents SDK, AutoGen, CrewAI).
- **WebRTC Perfect Negotiation & Glare Prevention**: Host (`isHost: true`) acts as the impolite offerer while Viewer (`isHost: false`) acts as polite answerer with description rollback support, eliminating `INVALID_STATE` dual-offer collisions.
- **Firebase Realtime Database Signaling Provider (`FirebaseSignalingProvider`)**: Serverless signaling over HTTPS / SSE Port 443 with SSE `put`/`patch` event parsing, 30-second TTL staleness filtering, and polling backup.
- **37-Step Dual-SDK Automated Test Suite (`npm test`)**: Automated test runner verifying session creation, dual-SDK handshake, remote input transmission, signaling cascades, and clean teardown.

### 🛡️ Fixed & Improved
- **Clean Test Exit**: Added `process.exit(0)` to `test/index.ts` ensuring automated test process terminates cleanly upon completion.
- **Renderer Bundle Size & Blank Screen**: Fixed renderer bundling crash on `npm start` by guarding `process.env` access and passing `--define:process.env.NODE_ENV='"production"'` to esbuild, reducing bundle size from 1.1 MB down to 358 KB.
- **Chromium WGC Log Noise**: Appended `disable-features=WGCWindowCapturer,WGCDisplayCapturer,WgcCapturer` to Electron main process command line switches to suppress Windows Graphics Capture timeout messages.
- **ICE Candidate Queueing**: Added early candidate queueing to prevent WebRTC candidate drops prior to SDP settlement.
- **Status Badge Descriptions**: Updated WebRTC candidate type descriptions to clearly distinguish `Hosting` vs `Viewing` sessions (`Direct P2P (Local LAN)`, `Direct P2P (STUN Public IP)`, `Relayed P2P (TURN Relay)`).

---
