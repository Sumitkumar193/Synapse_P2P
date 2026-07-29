# 📺 P2P Screen Share App & Media SDK — Functional Documentation

> **Product Vision**: A zero self-hosted infrastructure, zero-installer, end-to-end encrypted P2P screen sharing desktop application and reusable TypeScript SDK built with React 18 and Zustand.

---

## 🌐 1. Signaling vs. WebRTC Media Transport Architecture

In WebRTC real-time applications, there is a strict separation between **Signaling** (control handshake) and **Media Transport** (data/video stream):

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                      1. SIGNALING PHASE (Control Handshake)                 │
 │                                                                             │
 │  Host Window  ──────[SDP Offer / Answer / ICE Candidates]──────►  Viewer    │
 │                           via Firebase HTTPS (Port 443)                     │
 └──────────────────────────────────────┬──────────────────────────────────────┘
                                        │ (Handshake Complete)
                                        ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                    2. MEDIA TRANSPORT PHASE (WebRTC P2P Stream)             │
 │                                                                             │
 │    Path A: Host LAN Candidate  ───► Direct P2P (0ms Latency, Same Network)  │
 │    Path B: STUN WAN Candidate   ───► Direct P2P (NAT Hole Punching)         │
 │    Path C: TURN Relay Candidate ───► Relayed P2P (Port 443 Relay Fallback)  │
 └─────────────────────────────────────────────────────────────────────────────┘
```

1. **Signaling Provider**: Exclusively used to deliver JSON metadata (`peer-joined`, `offer`, `answer`, `ice-candidate`). Firebase Realtime DB operates over HTTPS/SSE Port 443.
2. **Media Transport**: Once signaling finishes, WebRTC evaluates candidates and streams 60FPS video directly between peers via the optimal network path. Video bytes are **never** passed through Firebase, ensuring zero database bandwidth usage and lowest possible latency.

---

## 🔍 2. Multi-Provider Room Probing & Multi-Tracker Mesh

### A. Multi-Provider Room Probing (`FallbackSignalingProvider`)
When a Joiner connects using **⚡ Auto Cascade**, the SDK probes each signaling provider sequentially:

```text
Host is on WebTorrent (Priority 3)  │  Joiner connects via Auto Cascade
───────────────────────────────────┼─────────────────────────────────────────────
                                   │ 1. Joiner probes Firebase (Priority 1)...
                                   │    ⏱️ No Host response within 1.8s.
                                   │ 2. Joiner probes WebSockets (Priority 2)...
                                   │    ⏱️ No Host response within 1.8s.
                                   │ 3. Joiner probes WebTorrent (Priority 3)...
                                   │    🟢 Host Found! Offer received in 100ms.
                                   │ 4. 🎯 Locks connection onto WebTorrent!
```

### B. Simultaneous Multi-Tracker Mesh (`WebTorrentSignalingProvider`)
To eliminate single-tracker mismatch across public torrent trackers:
- **Parallel Socket Pool (`sockets: Map<string, WebSocket>`)**: Connects to `tracker.openwebtorrent.com`, `tracker.btorrent.xyz`, and `tracker.files.fm` simultaneously.
- **Mesh Broadcasting**: Broadcasts signaling messages across all open tracker sockets in parallel. No matter which tracker a peer uses, messages reach both peers instantly.

---

## ⚖️ 3. WebRTC Perfect Negotiation & Glare Prevention

To resolve WebRTC dual-offer race conditions (glare) where both peers issue an SDP Offer simultaneously:

- **Host (`isHost: true`)**: Designated as the impolite peer (Offerer). Initiates the SDP Offer upon `peer-joined`. Ignores colliding incoming offers.
- **Viewer (`isHost: false`)**: Designated as the polite peer (Answerer). Waits for the Host's SDP Offer. If an offer collision occurs, executes local description rollback (`setLocalDescription({ type: 'rollback' })`) before accepting the remote offer.

This prevents `Called in wrong state: stable (INVALID_STATE)` crashes and guarantees reliable 100% connection success.

---

## 🔒 4. Session Code Security & Base36 Entropy

| Format | Sample Code | Character Set | Combinations | Brute-Force Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Legacy 6-Digit** | `255-624` | `0-9` (10 chars) | $1,000,000$ (1 Million) | Moderate |
| **New 8-Character Base36** | `a7k9-x2p4` | `0-9, a-z` (36 chars) | **$36^8 = \mathbf{2,821,109,907,456}$ (2.82 Trillion)** | **0.00000000003%** (Impossible) |

---

## 🧊 5. ICE Candidate Queueing & Staleness Filtering

To handle asynchronous WebRTC signaling over Firebase, WebSockets, or WebTorrents:

1. **Queueing Phase**: Candidates arriving while `peerConnection.remoteDescription` is empty are held in `pendingIceCandidates: any[]`.
2. **Flush Phase**: Immediately after `setRemoteDescription()` resolves on Offer or Answer, `flushPendingIceCandidates()` processes all queued candidates sequentially.
3. **Staleness Filtering (30s TTL)**: Firebase snapshot messages older than 30 seconds (`Date.now() - timestamp > 30000`) are automatically discarded to prevent interference from past test sessions.
4. **Intentional Peer Teardown Guard**: When `peer-left` signaling is received, `isPeerEnded = true` prevents automatic ICE restart timers from triggering false reconnection loops.

---

## 📡 6. Priority Signaling Cascade & Health Probing

Users can dynamically switch signaling methods using the header dropdown or allow `P2PMediaSDK` to execute its automatic priority cascade:

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      Priority 1: Firebase Realtime DB                  │
 │       (Serverless HTTPS/SSE Port 443 — FirebaseSignalingProvider)       │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ (If unavailable or network error)
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      Priority 2: Custom WebSockets                     │
 │          (Standard WSS Port 443 — WebSocketSignalingProvider)          │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ (If domain blocked)
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      Priority 3: WebTorrent Trackers                   │
 │           (Multi-Tracker Mesh — WebTorrentSignalingProvider)           │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ (If restricted network)
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      Priority 4: Electron IPC                          │
 │              (Local Loopback — IPCSignalingProvider)                   │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ (Fallback)
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                      Priority 5: Memory Fallback                       │
 │              (In-Memory Safety Net — MemorySignalingProvider)          │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ 7. React 18 + Zustand State Architecture

```text
 ┌─────────────────────────────────────────────────────────────────────────────────┐
 │                               FRONT-END UI (React 18)                           │
 │   ┌──────────────────────────┐                   ┌──────────────────────────┐   │
 │   │ TitleBar & Health Select │                   │   Host / Viewer Cards    │   │
 │   └─────────────┬────────────┘                   └────────────▲─────────────┘   │
 └─────────────────┼─────────────────────────────────────────────┼─────────────────┘
                   │                                             │
 ┌─────────────────▼─────────────────────────────────────────────┴─────────────────┐
 │                         ZUSTAND STORE (useAppStore.ts)                          │
 │   • activeTab / sources / selectedSourceId / signalingMethod / signalingHealth│
 │   • statusState / statusText / remainingSeconds / remoteStream / localStream    │
 └─────────────────┬─────────────────────────────────────────────▲─────────────────┘
                   │                                             │
 ┌─────────────────▼─────────────────────────────────────────────┴─────────────────┐
 │                       P2PMediaSDK (Session Architecture)                        │
 │   ┌─────────────────────────────────────────────────────────────────────────┐   │
 │   │                             Session Context                             │   │
 │   │   ┌──────────────┬──────────────────┬────────────────┬──────────────┐   │   │
 │   │   │session.media │ session.control  │  session.data  │session.stats │   │   │
 │   │   │session.files │session.clipboard │                │              │   │   │
 │   │   └──────┬───────┴────────┬─────────┴────────┬───────┴──────┬───────┘   │   │
 │   └──────────┼────────────────┼──────────────────┼──────────────┼───────────┘   │
 └──────────────┼────────────────┼──────────────────┼──────────────┼───────────────┘
                │                │                  │              │
 ┌──────────────▼────────────────▼──────────────────▼──────────────▼───────────────┐
 │                             WEBRTC ICE AGENT PIPELINE                           │
 │   ┌──────────────────────────────────┐      ┌───────────────────────────────┐   │
 │   │        Signaling Provider        │      │           ICE Agent           │   │
 │   │    (FallbackSignalingProvider)   │      │   • Candidate Gathering       │   │
 │   └─────────────────┬────────────────┘      │     (Host / STUN / TURN)      │   │
 │                     │                       │   • Candidate Queueing        │   │
 │                     ▼                       │   • Connectivity Checks       │   │
 │             SDP + ICE Messages              │   • Selected Candidate Pair   │   │
 │                     │                       └───────────────▲───────────────┘   │
 │                     │                                       │                   │
 └─────────────────────┼───────────────────────────────────────┼───────────────────┘
                       │                                       │
                       ▼                                       │
 ┌─────────────────────────────────────────────────────────────┴───────────────────┐
 │                              PHYSICAL P2P NETWORK                               │
 │            HOST PEER ◄════════════ DTLS-SRTP Media Stream ═══════════► VIEWER PEER  │
 └─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 8. Portable Build Specifications

- **Target OS**: Windows 10 / 11 (64-bit)
- **Packager Engine**: `electron-packager` v30.5.1
- **Zip Compression**: PowerShell `Compress-Archive`
- **Output Artifact**: `release/P2PScreenShare-Portable.zip`
- **Distribution Model**: Standalone zero-installer portable zip.

---

## 🚀 9. Transport-First Session Architecture (`sdk.connect()`)

The SDK functions as a pure low-level P2P transport layer:

1. **`SessionMedia` (`session.media`)**:
   - `videoTrack()`: Primary video track.
   - `microphoneTrack()`: Local microphone track.
   - `speakerTrack()`: Remote audio track.
   - `publishScreen()`: Screen media stream capture and publishing.
   - `frames()`: **Async Iterator** for video frame sampling (`AsyncIterableIterator<FrameSample>`).
   - `audio()`: **Async Iterator** for PCM audio sampling (`AsyncIterableIterator<Float32Array>`).

2. **`SessionControl` (`session.control`)**:
   - `mouse`: `move(x, y)`, `click(button, x, y, double)`, `scroll(dx, dy)`, `drag(startX, startY, endX, endY)`.
   - `keyboard`: `press(key, modifiers)`, `type(text)`.

3. **`SessionClipboard` (`session.clipboard`)**:
   - `write(text)`: Remote clipboard text transmission.
   - `read()`: Clipboard content inspection.
   - `onClipboard(handler)`: Remote clipboard listener.

4. **`SessionFiles` (`session.files`)**:
   - `send(file, name)`: Chunked 16KB DataChannel file transfer.
   - `onReceive(handler)`: Reassembled file reception listener.
   - `onProgress(handler)`: Transfer percentage and byte count progress listener.

5. **`SessionData` (`session.data`)**:
   - `send(data)`: Transmit string, ArrayBuffer, or Uint8Array.
   - `sendJson(data)`: JSON object serialization and transmission.
   - `sendBinary(data)`: Raw binary buffer transmission.

6. **`SessionStats` (`session.stats`)**:
   - `getStats()`: Real-time telemetry report containing `rttMs`, `inboundBitrateKbps`, `outboundBitrateKbps`, `packetLossRate`, `candidateType` (`host`/`srflx`/`relay`), `connectionType`, `activeStunTurnUrl`, `activeTrackerUrl`, `videoCodec`, `audioCodec`, and video resolution/FPS.
